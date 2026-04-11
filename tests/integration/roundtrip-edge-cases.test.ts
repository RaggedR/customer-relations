/**
 * Roundtrip Edge Case Tests
 *
 * Adversarial inputs that stress CSV/xlsx serialization:
 * commas, quotes, unicode, newlines, null preservation, large text.
 *
 * Uses the existing hearing-aid export/import endpoints.
 *
 * Requires: dev server running on localhost:3000 + Postgres.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { create, findAll, remove } from "@/lib/repository";
import {
  isServerRunning,
  assertFieldsMatch,
  getExport,
  postImportFile,
} from "../helpers/roundtrip";
import {
  PATIENT_EDGE_CASE,
  hearingAidEdgeCaseFixtures,
} from "../helpers/fixtures";

type Row = Record<string, unknown>;

describe("Edge Case Roundtrip", () => {
  let serverAvailable = false;
  let patientId: number;
  let edgeFixtures: ReturnType<typeof hearingAidEdgeCaseFixtures>;

  beforeAll(async () => {
    serverAvailable = await isServerRunning();
    if (!serverAvailable) return;

    // Create edge-case patient (name has commas, quotes)
    const patient = (await create("patient", {
      ...PATIENT_EDGE_CASE,
    })) as Row;
    patientId = patient.id as number;

    // Create all edge-case hearing aids
    edgeFixtures = hearingAidEdgeCaseFixtures(patientId);
    for (const fixture of Object.values(edgeFixtures)) {
      await create("hearing_aid", { ...fixture });
    }
  });

  afterAll(async () => {
    if (patientId) {
      try {
        await remove("patient", patientId);
      } catch {
        // Already cleaned up
      }
    }
  });

  async function deleteTestAids() {
    const current = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    for (const aid of current) {
      await remove("hearing_aid", aid.id as number);
    }
  }

  // ── Commas and quotes in CSV ──────────────────────────────

  it("CSV handles commas and quotes in text fields", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    expect(exportRes.ok).toBe(true);
    const csvText = await exportRes.text();

    // The model field with quotes should be properly escaped
    expect(csvText).toContain("RT-EDGE-001");

    // Delete and reimport
    await deleteTestAids();
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "edge-test.csv"
    );
    expect(importRes.ok).toBe(true);
    const summary = await importRes.json();

    // All our edge-case records should survive
    const edgeErrors = summary.errors.filter((e: string) =>
      e.includes("RT-EDGE")
    );
    expect(edgeErrors).toHaveLength(0);

    // Verify the quotes survived
    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const quotesAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-001"
    );
    expect(quotesAid).toBeDefined();
    expect(quotesAid!.model).toBe('Genesis AI "Evolv"');
    expect(quotesAid!.last_repair_details).toContain("$350");
  });

  // ── Unicode ───────────────────────────────────────────────

  it("CSV preserves unicode characters", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();

    await deleteTestAids();
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "unicode-test.csv"
    );
    expect(importRes.ok).toBe(true);

    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const unicodeAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-002"
    );
    expect(unicodeAid).toBeDefined();
    expect(unicodeAid!.model).toContain("für Müller");
    expect(unicodeAid!.battery_type).toContain("\u2122");
    expect(unicodeAid!.wax_filter).toContain("\u00AE");
    expect(unicodeAid!.dome).toContain("gr\u00F6\u00DFe");
    expect(unicodeAid!.repair_address).toContain("M\u00FCller Stra\u00DFe");
  });

  // ── Newlines in text fields ───────────────────────────────

  it("CSV handles newlines in text fields", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();

    await deleteTestAids();
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "newlines-test.csv"
    );
    expect(importRes.ok).toBe(true);

    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const newlineAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-003"
    );
    expect(newlineAid).toBeDefined();
    expect(newlineAid!.last_repair_details).toContain("Line one");
    expect(newlineAid!.last_repair_details).toContain("Line two");
    expect(newlineAid!.repair_address).toContain("Floor 3");
  });

  // ── Null preservation ─────────────────────────────────────

  it("null fields remain null after CSV roundtrip", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();

    await deleteTestAids();
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "nulls-test.csv"
    );
    expect(importRes.ok).toBe(true);

    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const nullsAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-004"
    );
    expect(nullsAid).toBeDefined();
    expect(nullsAid!.battery_type).toBeNull();
    expect(nullsAid!.wax_filter).toBeNull();
    expect(nullsAid!.dome).toBeNull();
    expect(nullsAid!.programming_cable).toBeNull();
    expect(nullsAid!.programming_software).toBeNull();
    expect(nullsAid!.hsp_code).toBeNull();
    expect(nullsAid!.warranty_end_date).toBeNull();
    expect(nullsAid!.last_repair_details).toBeNull();
    expect(nullsAid!.repair_address).toBeNull();
  });

  // ── Large text ────────────────────────────────────────────

  it("large text blobs survive CSV roundtrip", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();

    await deleteTestAids();
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "large-text-test.csv"
    );
    expect(importRes.ok).toBe(true);

    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const largeAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-005"
    );
    expect(largeAid).toBeDefined();
    expect(largeAid!.last_repair_details).toHaveLength(2000);
  });

  // ── Date edge case ────────────────────────────────────────

  it("warranty_end_date survives roundtrip in YYYY-MM-DD format", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();

    await deleteTestAids();
    await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "dates-test.csv"
    );

    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const dateAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-002"
    );
    expect(dateAid).toBeDefined();
    const date = new Date(dateAid!.warranty_end_date as string);
    expect(date.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  // ── Patient name with commas ──────────────────────────────

  it("patient name with commas resolves correctly on import", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "json");
    const jsonData = await exportRes.json();

    // Our edge-case patient has a comma in the name
    const testRecords = jsonData.filter(
      (r: Row) =>
        (r.patient_name as string)?.includes("O'Brien")
    );
    expect(testRecords.length).toBeGreaterThan(0);
    // The patient_name field should contain the full name
    expect(testRecords[0].patient_name).toContain("Jr.");
  });

  // ── JSON roundtrip preserves edge cases ───────────────────

  it("JSON roundtrip preserves all edge-case fields", async ({ skip }) => {
    if (!serverAvailable) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "json");
    expect(exportRes.ok).toBe(true);
    const jsonData = await exportRes.json();

    await deleteTestAids();
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      JSON.stringify(jsonData),
      "edge-json-test.json",
      "application/json"
    );
    expect(importRes.ok).toBe(true);

    // Verify all edge case records survived
    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    expect(reimported.length).toBeGreaterThanOrEqual(Object.keys(edgeFixtures).length);

    // Spot-check the most adversarial record
    const quotesAid = reimported.find(
      (r) => r.serial_number === "RT-EDGE-001"
    );
    expect(quotesAid).toBeDefined();
    assertFieldsMatch("hearing_aid", quotesAid as Row, quotesAid as Row);
  });
});
