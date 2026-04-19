/**
 * iCal Round-Trip Tests
 *
 * Verifies that generateVEvent -> parseVEvent preserves field values
 * for the appointment entity.
 *
 * These are unit tests — no database or server needed. The schema
 * cache is loaded by tests/setup.ts before any test runs.
 *
 * Categorical context: generateVEvent is Sigma_F (project CRM -> iCal),
 * parseVEvent is Delta_F (pull iCal -> CRM). These tests verify the
 * unit of the adjunction and document intentional asymmetries (lossy
 * fields where Sigma intentionally discards information for privacy).
 */

import { describe, it, expect } from "vitest";
import { generateVEvent, parseVEvent } from "@/lib/ical";
import { ICAL_APPOINTMENT_FIXTURE } from "../helpers/fixtures";

describe("iCal Round-Trip: appointment", () => {
  it("date and time fields survive round-trip", () => {
    const ical = generateVEvent(ICAL_APPOINTMENT_FIXTURE);
    const parsed = parseVEvent(ical);

    expect(parsed.date).toBe("2026-04-20");
    expect(parsed.start_time).toBe("09:00");
    expect(parsed.end_time).toBe("09:30");
  });

  it("location survives round-trip", () => {
    const ical = generateVEvent(ICAL_APPOINTMENT_FIXTURE);
    const parsed = parseVEvent(ical);

    expect(parsed.location).toBe("Room 3, Main Clinic");
  });

  it("location with special characters survives round-trip", () => {
    const fixture = {
      ...ICAL_APPOINTMENT_FIXTURE,
      id: 100,
      location: "Müller Clinic, Level 2 — Room 5",
    };
    const ical = generateVEvent(fixture);
    const parsed = parseVEvent(ical);

    expect(parsed.location).toBe("Müller Clinic, Level 2 — Room 5");
  });

  it("status mapping round-trips for all values", () => {
    for (const status of ["confirmed", "cancelled", "completed"]) {
      const fixture = { ...ICAL_APPOINTMENT_FIXTURE, id: 101, status };
      const ical = generateVEvent(fixture);
      const parsed = parseVEvent(ical);

      expect(parsed.status).toBe(status);
    }
  });

  it("empty location is omitted and doesn't corrupt parse", () => {
    const fixture = { ...ICAL_APPOINTMENT_FIXTURE, id: 102, location: "" };
    const ical = generateVEvent(fixture);
    const parsed = parseVEvent(ical);

    // Location line should not appear in the output
    expect(ical).not.toContain("LOCATION:");
    expect(parsed.location).toBeUndefined();
  });

  it("UID preserves entity type and id", () => {
    const ical = generateVEvent(ICAL_APPOINTMENT_FIXTURE);
    const parsed = parseVEvent(ical);

    expect(parsed.id).toBe(99);
  });

  it("DESCRIPTION asymmetry — notes are intentionally not emitted (PII boundary)", () => {
    // This documents an intentional lossy field: the `notes` field contains
    // clinical context that should NOT flow to external calendars (Google,
    // Apple, etc.) per APP 8 (Australian Privacy Principles).
    //
    // Sigma (export) suppresses DESCRIPTION.
    // Delta (import) parses DESCRIPTION → notes.
    //
    // This means notes is write-only from external calendars: it enters
    // the system but never leaves via iCal.
    const ical = generateVEvent(ICAL_APPOINTMENT_FIXTURE);

    // Verify DESCRIPTION is not in the output
    expect(ical).not.toContain("DESCRIPTION:");

    // Verify the original fixture had notes
    expect(ICAL_APPOINTMENT_FIXTURE.notes).toBeTruthy();

    // Verify parsing doesn't produce notes (since DESCRIPTION wasn't emitted)
    const parsed = parseVEvent(ical);
    expect(parsed.notes).toBeUndefined();
  });

  it("inbound DESCRIPTION is parsed when present from external source", () => {
    // Simulate an external calendar (e.g., Google Calendar) that includes
    // DESCRIPTION in its VEVENT. Our parser should capture it as `notes`.
    const externalIcal = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:appointment-200@customer-relations",
      "DTSTART:20260420T090000",
      "DTEND:20260420T093000",
      "SUMMARY:audiometry — Appt #200",
      "DESCRIPTION:Patient needs interpreter",
      "LOCATION:Room 1",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const parsed = parseVEvent(externalIcal);

    expect(parsed.notes).toBe("Patient needs interpreter");
    expect(parsed.location).toBe("Room 1");
    expect(parsed.status).toBe("confirmed");
  });

  it("SUMMARY is not decomposable — template output stored as _summary", () => {
    // The summary is generated from template "{specialty} — Appt #{id}".
    // On parse, it comes back as the interpolated string in `_summary`,
    // NOT decomposed back into `specialty` and `id` fields.
    // This is a known limitation: SUMMARY is a Sigma-only projection.
    const ical = generateVEvent(ICAL_APPOINTMENT_FIXTURE);
    const parsed = parseVEvent(ical);

    expect(parsed._summary).toContain("audiometry");
    expect(parsed._summary).toContain("Appt #99");
    // specialty is NOT extracted back — it's baked into the summary string
    expect(parsed.specialty).toBeUndefined();
  });
});
