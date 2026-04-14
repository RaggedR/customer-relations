/**
 * CalDAV Client
 *
 * Push/update/delete appointments on external CalDAV servers
 * (Google Calendar, Apple Calendar, Radicale, etc.).
 *
 * All operations are fire-and-forget — failures are logged but
 * never block the HTTP response.
 */

import { DAVClient } from "tsdav";
import { generateVEvent, makeUid } from "./ical";
import { findAll } from "./repository";
import { decryptToken } from "./token-crypto";
import type { Row } from "./parsers";

interface CalendarConnection {
  id: number;
  provider: string;
  calendar_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: Date | null;
  nurseId: number;
}

/**
 * Get the CalDAV client for a calendar connection.
 * Handles Google OAuth2 token refresh.
 */
/**
 * Decrypt a stored token, falling back to plaintext for legacy
 * rows that were stored before encryption was enabled.
 */
function tryDecrypt(token: string | null): string | undefined {
  if (!token) return undefined;
  try {
    return decryptToken(token);
  } catch {
    // Legacy plaintext token — return as-is for graceful migration
    return token;
  }
}

async function getClient(conn: CalendarConnection): Promise<DAVClient> {
  const isGoogle = conn.provider === "google";
  const accessToken = tryDecrypt(conn.access_token);
  const refreshToken = tryDecrypt(conn.refresh_token);

  const client = new DAVClient({
    serverUrl: isGoogle
      ? "https://apidata.googleusercontent.com/caldav/v2/"
      : conn.calendar_id,
    credentials: isGoogle
      ? {
          tokenUrl: "https://oauth2.googleapis.com/token",
          refreshToken,
          accessToken,
        }
      : {
          username: "",
          password: accessToken ?? "",
        },
    authMethod: isGoogle ? "Oauth" : "Basic",
    defaultAccountType: "caldav",
  });

  await client.login();
  return client;
}

/**
 * Push a new appointment to all connected calendars for the assigned nurse.
 */
export async function pushAppointment(
  appointment: Row
): Promise<void> {
  const nurseId = appointment.nurseId as number | undefined;
  if (!nurseId) return;

  const connections = await getConnectionsForNurse(nurseId);
  if (connections.length === 0) return;

  const ical = generateVEvent(appointment);
  const uid = makeUid("appointment", appointment.id);

  for (const conn of connections) {
    try {
      const client = await getClient(conn);
      const calendars = await client.fetchCalendars();
      if (calendars.length === 0) continue;

      const calendar = calendars[0];
      await client.createCalendarObject({
        calendar,
        filename: `${uid}.ics`,
        iCalString: ical,
      });
    } catch (err) {
      console.error(
        `CalDAV push failed for connection ${conn.id}:`,
        (err as Error).message
      );
    }
  }
}

/**
 * Update an existing appointment on all connected calendars.
 */
export async function updateAppointment(
  appointment: Row
): Promise<void> {
  const nurseId = appointment.nurseId as number | undefined;
  if (!nurseId) return;

  const connections = await getConnectionsForNurse(nurseId);
  if (connections.length === 0) return;

  const ical = generateVEvent(appointment);
  const uid = makeUid("appointment", appointment.id);

  for (const conn of connections) {
    try {
      const client = await getClient(conn);
      const calendars = await client.fetchCalendars();
      if (calendars.length === 0) continue;

      const calendar = calendars[0];
      const objects = await client.fetchCalendarObjects({ calendar });
      const existing = objects.find(
        (o) => o.data?.includes(uid) || o.url.includes(uid)
      );

      if (existing) {
        await client.updateCalendarObject({
          calendarObject: { ...existing, data: ical },
        });
      } else {
        // Event doesn't exist yet — create it
        await client.createCalendarObject({
          calendar,
          filename: `${uid}.ics`,
          iCalString: ical,
        });
      }
    } catch (err) {
      console.error(
        `CalDAV update failed for connection ${conn.id}:`,
        (err as Error).message
      );
    }
  }
}

/**
 * Delete an appointment from all connected calendars.
 */
export async function deleteAppointment(
  appointmentId: number,
  nurseId: number
): Promise<void> {
  const connections = await getConnectionsForNurse(nurseId);
  if (connections.length === 0) return;

  const uid = makeUid("appointment", appointmentId);

  for (const conn of connections) {
    try {
      const client = await getClient(conn);
      const calendars = await client.fetchCalendars();
      if (calendars.length === 0) continue;

      const calendar = calendars[0];
      const objects = await client.fetchCalendarObjects({ calendar });
      const existing = objects.find(
        (o) => o.data?.includes(uid) || o.url.includes(uid)
      );

      if (existing) {
        await client.deleteCalendarObject({
          calendarObject: existing,
        });
      }
    } catch (err) {
      console.error(
        `CalDAV delete failed for connection ${conn.id}:`,
        (err as Error).message
      );
    }
  }
}

/**
 * Fetch busy slots from a nurse's connected calendars.
 * Returns an array of { start, end } time ranges.
 */
export async function fetchBusySlots(
  nurseId: number,
  dateFrom: string,
  dateTo: string
): Promise<{ start: Date; end: Date }[]> {
  const connections = await getConnectionsForNurse(nurseId);
  const slots: { start: Date; end: Date }[] = [];

  for (const conn of connections) {
    try {
      const client = await getClient(conn);
      const calendars = await client.fetchCalendars();
      if (calendars.length === 0) continue;

      const calendar = calendars[0];
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
          start: new Date(dateFrom).toISOString(),
          end: new Date(dateTo).toISOString(),
        },
      });

      for (const obj of objects) {
        if (!obj.data) continue;
        const dtstart = obj.data.match(/DTSTART[^:]*:(\d{8}T\d{6})/);
        const dtend = obj.data.match(/DTEND[^:]*:(\d{8}T\d{6})/);
        if (dtstart && dtend) {
          slots.push({
            start: parseICalDate(dtstart[1]),
            end: parseICalDate(dtend[1]),
          });
        }
      }
    } catch (err) {
      console.error(
        `CalDAV fetch failed for connection ${conn.id}:`,
        (err as Error).message
      );
    }
  }

  return slots;
}

function parseICalDate(value: string): Date {
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  const h = value.slice(9, 11);
  const min = value.slice(11, 13);
  const s = value.slice(13, 15);
  return new Date(`${y}-${m}-${d}T${h}:${min}:${s}`);
}

async function getConnectionsForNurse(
  nurseId: number
): Promise<CalendarConnection[]> {
  const connections = (await findAll("calendar_connection", {
    filterBy: { nurseId },
  })) as CalendarConnection[];
  return connections;
}
