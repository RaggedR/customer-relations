/**
 * CalDAV Client
 *
 * Push/update/delete appointments on external CalDAV servers
 * (Google Calendar, Apple Calendar, Radicale, etc.).
 *
 * All operations are fire-and-forget — failures are logged but
 * never block the HTTP response.
 */

import { DAVClient, type DAVCalendar } from "tsdav";
import { generateVEvent, makeUid } from "./ical";
import { findAll } from "./repository";
import { tryDecrypt } from "./token-crypto";
import { withRetry } from "./retry";
import { logger } from "@/lib/logger";
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
 * Shared scaffolding for push/update/delete operations.
 * Loads calendar connections for a nurse, loops over them, creates a DAV
 * client, fetches calendars, builds the UID, then calls the action callback.
 * Failures are logged per-connection but never propagated.
 */
async function withCalendarConnections(
  nurseId: number | undefined,
  action: string,
  appointmentId: number | string,
  fn: (client: DAVClient, calendar: DAVCalendar, uid: string) => Promise<void>,
): Promise<void> {
  if (!nurseId) return;
  const connections = await getConnectionsForNurse(nurseId);
  if (connections.length === 0) return;

  const uid = makeUid("appointment", appointmentId);

  for (const conn of connections) {
    try {
      await withRetry(async () => {
        const client = await getClient(conn);
        const calendars = await client.fetchCalendars();
        if (calendars.length === 0) return;

        const calendar = calendars[0];
        await fn(client, calendar, uid);
      }, { label: `CalDAV ${action} (conn ${conn.id})` });
    } catch (err) {
      logger.error({ err, connectionId: conn.id, action }, "CalDAV operation failed");
    }
  }
}

/**
 * Push a new appointment to all connected calendars for the assigned nurse.
 */
export async function pushAppointment(
  appointment: Row
): Promise<void> {
  await withCalendarConnections(appointment.nurseId as number | undefined, "push", appointment.id as number, async (client, calendar, uid) => {
    const ical = generateVEvent(appointment);
    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString: ical,
    });
  });
}

/**
 * Update an existing appointment on all connected calendars.
 */
export async function updateAppointment(
  appointment: Row
): Promise<void> {
  await withCalendarConnections(appointment.nurseId as number | undefined, "update", appointment.id as number, async (client, calendar, uid) => {
    const ical = generateVEvent(appointment);
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
  });
}

/**
 * Delete an appointment from all connected calendars.
 */
export async function deleteAppointment(
  appointmentId: number,
  nurseId: number
): Promise<void> {
  await withCalendarConnections(nurseId, "delete", appointmentId, async (client, calendar, uid) => {
    const objects = await client.fetchCalendarObjects({ calendar });
    const existing = objects.find(
      (o) => o.data?.includes(uid) || o.url.includes(uid)
    );

    if (existing) {
      await client.deleteCalendarObject({
        calendarObject: existing,
      });
    }
  });
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
      await withRetry(async () => {
        const client = await getClient(conn);
        const calendars = await client.fetchCalendars();
        if (calendars.length === 0) return;

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
      }, { label: `CalDAV fetch (conn ${conn.id})` });
    } catch (err) {
      logger.error({ err, connectionId: conn.id, action: "fetch" }, "CalDAV operation failed");
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
