/**
 * iCal (VEVENT) Generation and Parsing
 *
 * Partially schema-driven: reads summary_template from schema.yaml via the
 * unified template engine (lib/template.ts), but field extraction and iCal
 * property formatting are hardcoded to the appointment entity.
 *
 * DSL-ESCAPE: Field names (date, start_time, end_time, location) are accessed
 *   by hardcoded name at lines 28-31 instead of reading from ical.mapping.
 *   The status→STATUS mapping (confirmed/cancelled/completed) is also hardcoded.
 *   Reason: iCal properties need specific date/time formatting (YYYYMMDD, HHMMSS)
 *   that the schema's field→property mapping doesn't express. Making this fully
 *   schema-driven would require a formatter registry keyed by iCal property type.
 *   Cost to promote: medium — add format specifiers to ical.mapping in schema.yaml.
 *   Trigger to promote: a second entity needs iCal representation.
 */

import { getICalRepresentation } from "@/lib/schema";
import { interpolateTemplate } from "@/lib/template";
import { escapeText, unescapeText, unfoldLines } from "@/lib/text-codec";
import type { Row } from "@/lib/parsers";

/** Build a UID string for an entity record (exported for CalDAV client reuse) */
export function makeUid(entityName: string, id: unknown): string {
  return `${entityName}-${id}@customer-relations`;
}

/**
 * Generate a VCALENDAR string containing one VEVENT.
 *
 * The record should be hydrated (with nested relations like patient/nurse).
 * The iCal mapping in schema.yaml determines which fields map to which
 * iCal properties.
 */
export function generateVEvent(record: Row, entityName = "appointment"): string {
  const ical = getICalRepresentation(entityName);

  const id = record.id;
  const date = formatDate(record.date);
  const startTime = record.start_time as string;
  const endTime = record.end_time as string;
  const location = record.location as string || "";

  // Build summary from template (unified template engine handles both {field} and {relation.field})
  const summary = interpolateTemplate(ical?.summary_template ?? "{specialty}", record);

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Customer Relations//EN",
    "BEGIN:VEVENT",
    `UID:${makeUid(entityName, id)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${date}T${formatTime(startTime)}00`,
    `DTEND:${date}T${formatTime(endTime)}00`,
    `SUMMARY:${escapeText(summary)}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeText(location)}`);
  }
  // NOTE: DESCRIPTION intentionally omitted — appointment notes may contain
  // clinical context that should not flow to external calendars (Google, Apple, etc.)

  // Add status mapping
  const status = record.status as string;
  if (status === "confirmed") lines.push("STATUS:CONFIRMED");
  else if (status === "cancelled") lines.push("STATUS:CANCELLED");
  else if (status === "completed") lines.push("STATUS:COMPLETED");

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

/**
 * Generate a VCALENDAR with multiple VEVENTs (for a calendar feed).
 */
export function generateCalendarFeed(
  appointments: Row[],
  calendarName = "Customer Relations"
): string {
  const events = appointments.map((a) => {
    // Extract just the VEVENT part
    const full = generateVEvent(a);
    const start = full.indexOf("BEGIN:VEVENT");
    const end = full.indexOf("END:VEVENT") + "END:VEVENT".length;
    return full.slice(start, end);
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Customer Relations//EN",
    `X-WR-CALNAME:${calendarName}`,
    ...events,
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

/**
 * Parse a VEVENT string back into appointment fields.
 * Returns a partial record with the fields found.
 */
export function parseVEvent(icalText: string, entityName = "appointment"): Row {
  const result: Row = {};

  const lines = unfoldLines(icalText);

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const prop = line.slice(0, colonIdx).split(";")[0].toUpperCase();
    const value = unescapeText(line.slice(colonIdx + 1));

    switch (prop) {
      case "UID": {
        const match = value.match(new RegExp(`${entityName}-(\\d+)@`));
        if (match) result.id = parseInt(match[1], 10);
        break;
      }
      case "DTSTART": {
        const { date, time } = parseDtValue(value);
        if (date) result.date = date;
        if (time) result.start_time = time;
        break;
      }
      case "DTEND": {
        const { time } = parseDtValue(value);
        if (time) result.end_time = time;
        break;
      }
      case "SUMMARY":
        result._summary = value;
        break;
      case "LOCATION":
        result.location = value;
        break;
      case "DESCRIPTION":
        // NOTE: We parse inbound DESCRIPTION for interop with external calendars,
        // but we do NOT emit DESCRIPTION outbound (see generateVEvent) to avoid
        // leaking clinical context. Inbound data stays local.
        result.notes = value;
        break;
      case "STATUS":
        if (value === "CONFIRMED") result.status = "confirmed";
        else if (value === "CANCELLED") result.status = "cancelled";
        else if (value === "COMPLETED") result.status = "completed";
        break;
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────

function formatDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatTime(time: string): string {
  // "09:00" → "090000", "14:30" → "143000"
  const parts = time.split(":");
  return `${parts[0]}${parts[1]}`;
}

function parseDtValue(value: string): { date?: string; time?: string } {
  // Handle "20260410T090000" or "20260410"
  const clean = value.replace("Z", "");
  const date = clean.length >= 8
    ? `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
    : undefined;
  const time = clean.length >= 13
    ? `${clean.slice(9, 11)}:${clean.slice(11, 13)}`
    : undefined;
  return { date, time };
}
