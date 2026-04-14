/**
 * Tests that the import pipeline validates data before writing to DB.
 *
 * Previously, import skipped validateEntity() entirely — invalid emails,
 * out-of-range enums, and blank required fields all passed through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateEntity } from "@/lib/repository";

// We test validateEntity directly against import-shaped data.
// The integration test (import → validateEntity → skip) requires a running DB,
// so here we verify the validator catches the specific cases import was missing.

// Load the real schema so validateEntity can find entity definitions.
import { loadSchema } from "@/lib/schema";

beforeEach(() => {
  loadSchema();
});

describe("Import validation — cases previously bypassed", () => {
  it("rejects patient with invalid email", () => {
    const errors = validateEntity("patient", {
      name: "Test Patient",
      email: "not-an-email",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("email"))).toBe(true);
  });

  it("rejects patient with missing required name", () => {
    const errors = validateEntity("patient", {
      email: "valid@example.com",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects patient with invalid enum status", () => {
    const errors = validateEntity("patient", {
      name: "Test Patient",
      status: "superadmin",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("accepts patient with all valid fields", () => {
    const errors = validateEntity("patient", {
      name: "Valid Patient",
      email: "valid@example.com",
      phone: "+61 412 345 678",
      status: "active",
    });
    expect(errors).toEqual([]);
  });

  it("rejects appointment with invalid time format", () => {
    const errors = validateEntity("appointment", {
      date: "2026-04-15",
      start_time: "9am",
      end_time: "10am",
      location: "Clinic",
      specialty: "Audiology",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("start_time") || e.includes("end_time"))).toBe(true);
  });

  it("rejects hearing_aid with invalid ear enum", () => {
    const errors = validateEntity("hearing_aid", {
      ear: "both",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("ear"))).toBe(true);
  });

  it("rejects clinical note with missing required content", () => {
    const errors = validateEntity("clinical_note", {
      date: "2026-04-15T10:00:00Z",
      // content is required but missing
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("content"))).toBe(true);
  });

  it("accepts valid data that would come from a CSV import", () => {
    // Simulates coerced CSV data — all strings, matching schema expectations
    const errors = validateEntity("patient", {
      name: "Susan O'Brien",
      date_of_birth: "1985-03-15",
      medicare_number: "1234567890",
      phone: "0412345678",
      email: "susan@example.com",
      status: "active",
    });
    expect(errors).toEqual([]);
  });
});
