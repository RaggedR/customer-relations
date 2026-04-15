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
import { findAll, update } from "./repository";
import { tryDecryptLegacy } from "./token-crypto";
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
  const accessToken = tryDecryptLegacy(conn.access_token);
  const refreshToken = tryDecryptLegacy(conn.refresh_token);

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
 * Captures the ETag from the response and stores it on the appointment record
 * for optimistic concurrency on subsequent update/delete operations.
 */
export async function pushAppointment(
  appointment: Row
): Promise<void> {
  const appointmentId = appointment.id as number;
  await withCalendarConnections(appointment.nurseId as number | undefined, "push", appointmentId, async (client, calendar, uid) => {
    const ical = generateVEvent(appointment);
    const response = await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString: ical,
    });
    // Capture ETag from the response for future If-Match headers.
    // tsdav's createCalendarObject returns a native Response object.
    const etag = extractEtag(response);
    if (etag) {
      await storeEtag(appointmentId, etag);
    }
  });
}

/**
 * Update an existing appointment on all connected calendars.
 * Uses the stored ETag (if available) for optimistic concurrency via If-Match.
 * If the server returns 412 Precondition Failed, the event was modified
 * externally — we log a warning but don't throw (fire-and-forget).
 */
export async function updateAppointment(
  appointment: Row
): Promise<void> {
  const appointmentId = appointment.id as number;
  const storedEtag = (appointment as Record<string, unknown>).caldav_etag as string | undefined;

  await withCalendarConnections(appointment.nurseId as number | undefined, "update", appointmentId, async (client, calendar, uid) => {
    const ical = generateVEvent(appointment);
    const objects = await client.fetchCalendarObjects({ calendar });
    const existing = objects.find(
      (o) => o.data?.includes(uid) || o.url.includes(uid)
    );

    if (existing) {
      // Prefer stored ETag over fetched one for true optimistic concurrency.
      // The fetched object's etag reflects the current server state, while
      // our stored etag reflects the state when we last wrote — if they differ,
      // someone else modified the event and If-Match will correctly 412.
      const calendarObject = storedEtag
        ? { ...existing, data: ical, etag: storedEtag }
        : { ...existing, data: ical };

      const response = await client.updateCalendarObject({ calendarObject });

      if (is412(response)) {
        logger.warn(
          { appointmentId, uid },
          "CalDAV update got 412 Precondition Failed — event was modified externally"
        );
        return;
      }

      // Store new ETag for future operations
      const newEtag = extractEtag(response);
      if (newEtag) {
        await storeEtag(appointmentId, newEtag);
      }
    } else {
      // Event doesn't exist yet — create it
      const response = await client.createCalendarObject({
        calendar,
        filename: `${uid}.ics`,
        iCalString: ical,
      });
      const etag = extractEtag(response);
      if (etag) {
        await storeEtag(appointmentId, etag);
      }
    }
  });
}

/**
 * Delete an appointment from all connected calendars.
 * The fetched calendarObject already includes the server's current ETag,
 * which tsdav passes as If-Match automatically. If the server returns 412
 * (event modified externally), we log a warning but don't throw.
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
      const response = await client.deleteCalendarObject({
        calendarObject: existing,
      });

      if (is412(response)) {
        logger.warn(
          { appointmentId, uid },
          "CalDAV delete got 412 Precondition Failed — event was modified externally"
        );
      }
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

/**
 * Extract ETag from a CalDAV response.
 * tsdav's create/update/delete return a native Response object.
 * The ETag header may be quoted (e.g., `"abc123"`) — we preserve it as-is
 * since CalDAV servers expect the same value back in If-Match.
 */
function extractEtag(response: Response): string | undefined {
  const etag = response?.headers?.get("etag");
  return etag ?? undefined;
}

/**
 * Check if the response is a 412 Precondition Failed.
 * This means the event was modified externally between our fetch and update.
 */
function is412(response: Response): boolean {
  return response?.status === 412;
}

/**
 * Persist the CalDAV ETag on the appointment record.
 * Silently catches errors — ETag storage is best-effort.
 */
async function storeEtag(appointmentId: number, etag: string): Promise<void> {
  try {
    await update("appointment", appointmentId, { caldav_etag: etag });
  } catch (err) {
    logger.warn({ err, appointmentId }, "Failed to store CalDAV ETag on appointment");
  }
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
