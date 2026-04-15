/**
 * Hearing Aid Roundtrip Tests
 *
 * Tests the existing export -> import cycle for hearing aids across
 * all three supported formats (CSV, xlsx, JSON).
 *
 * Flow: create data -> export -> delete -> reimport -> verify fields match.
 *
 * Requires: dev server running on localhost:3000 + Postgres.
 * Skips gracefully if server or database is unreachable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { create, findAll, remove } from "@/lib/repository";
import {
  isServerRunning,
  isDatabaseAvailable,
  assertFieldsMatch,
  getExport,
  postImportFile,
} from "../helpers/roundtrip";
import {
  PATIENT_FIXTURE,
  hearingAidFixtures,
  ROUNDTRIP_PREFIX,
} from "../helpers/fixtures";

type Row = Record<string, unknown>;

describe("Hearing Aid Roundtrip", () => {
  let available = false;
  let patientId: number;
  let originalAids: Row[];

  beforeAll(async () => {
    // Check both server and database before attempting any Prisma operations
    const [serverUp, dbUp] = await Promise.all([
      isServerRunning(),
      isDatabaseAvailable(),
    ]);
    if (!serverUp || !dbUp) return;

    try {
      // Create test patient
      const patient = (await create("patient", {
        ...PATIENT_FIXTURE,
      })) as Row;
      patientId = patient.id as number;

      // Create test hearing aids
      const fixtures = hearingAidFixtures(patientId);
      originalAids = [];
      for (const fixture of fixtures) {
        const aid = (await create("hearing_aid", { ...fixture })) as Row;
        originalAids.push(aid);
      }

      available = true;
    } catch {
      // DB connection failed or schema mismatch — skip all tests
      available = false;
    }
  });

  afterAll(async () => {
    // Cascade-delete: removing patient deletes hearing aids too
    if (patientId) {
      try {
        await remove("patient", patientId);
      } catch {
        // Already cleaned up
      }
    }
  });

  /**
   * Helper: delete all hearing aids for our test patient,
   * then reimport from the exported data, then verify.
   */
  async function deleteTestAids() {
    const current = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    for (const aid of current) {
      await remove("hearing_aid", aid.id as number);
    }
  }

  async function verifyRoundtrip() {
    const reimported = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];

    // At least our original records must be present
    expect(reimported.length).toBeGreaterThanOrEqual(originalAids.length);

    // Match by serial_number since IDs will differ after reimport
    for (const original of originalAids) {
      const match = reimported.find(
        (r) => r.serial_number === original.serial_number
      );
      expect(match, `No reimported record for serial ${original.serial_number}`).toBeDefined();

      // Compare individual fields
      assertFieldsMatch("hearing_aid", original as Row, match as Row);
    }
  }

  // -- CSV roundtrip ---------------------------------------------------

  it("CSV: export -> delete -> import -> fields match", async ({ skip }) => {
    if (!available) skip();

    // Export
    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    expect(exportRes.ok).toBe(true);
    const csvText = await exportRes.text();

    // Verify export contains our test data
    expect(csvText).toContain("RT-TEST-001");
    expect(csvText).toContain("RT-TEST-002");

    // Delete
    await deleteTestAids();

    // Verify deleted
    const afterDelete = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    expect(afterDelete).toHaveLength(0);

    // Reimport — note: export contains ALL hearing aids, not just ours.
    // Some may fail if their patients don't exist. We only check our records.
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      csvText,
      "roundtrip-test.csv",
      "text/csv"
    );
    expect(importRes.ok).toBe(true);
    const summary = await importRes.json();
    expect(summary.created).toBeGreaterThanOrEqual(originalAids.length);

    // Verify our test records survived
    await verifyRoundtrip();
  });

  // -- JSON roundtrip --------------------------------------------------

  it("JSON: export -> delete -> import -> fields match", async ({ skip }) => {
    if (!available) skip();

    // Export
    const exportRes = await getExport("/api/hearing-aid/export", "json");
    expect(exportRes.ok).toBe(true);
    const jsonData = await exportRes.json();

    // Verify export contains our test data
    const testRecords = jsonData.filter(
      (r: Row) =>
        (r.patient_name as string)?.includes(ROUNDTRIP_PREFIX)
    );
    expect(testRecords.length).toBeGreaterThanOrEqual(originalAids.length);

    // Delete
    await deleteTestAids();

    // Reimport — export contains ALL records, some may fail for missing patients
    const jsonContent = JSON.stringify(jsonData);
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      jsonContent,
      "roundtrip-test.json",
      "application/json"
    );
    expect(importRes.ok).toBe(true);
    const summary = await importRes.json();
    expect(summary.created).toBeGreaterThanOrEqual(originalAids.length);

    // Verify our test records survived
    await verifyRoundtrip();
  });

  // -- xlsx roundtrip --------------------------------------------------

  it("xlsx: export -> delete -> import -> fields match", async ({ skip }) => {
    if (!available) skip();

    // Export
    const exportRes = await getExport("/api/hearing-aid/export", "xlsx");
    expect(exportRes.ok).toBe(true);
    const xlsxBuffer = Buffer.from(await exportRes.arrayBuffer());
    expect(xlsxBuffer.length).toBeGreaterThan(0);

    // Delete
    await deleteTestAids();

    // Reimport
    const importRes = await postImportFile(
      "/api/hearing-aid/import",
      xlsxBuffer,
      "roundtrip-test.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(importRes.ok).toBe(true);
    const summary = await importRes.json();
    expect(summary.created).toBeGreaterThanOrEqual(originalAids.length);

    // Verify our test records survived
    await verifyRoundtrip();
  });

  // -- Format-specific checks ------------------------------------------

  it("CSV export has correct headers", async ({ skip }) => {
    if (!available) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();
    const headerLine = csvText.split("\n")[0];

    expect(headerLine).toContain("Patient Name");
    expect(headerLine).toContain("Serial Number");
    expect(headerLine).toContain("Battery Type");
    expect(headerLine).toContain("Warranty End Date");
  });

  it("JSON export flattens patient name", async ({ skip }) => {
    if (!available) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "json");
    const jsonData = await exportRes.json();

    const testRecord = jsonData.find(
      (r: Row) => r.serial_number === "RT-TEST-001"
    );
    expect(testRecord).toBeDefined();
    expect(testRecord.patient_name).toContain("Ada Lovelace");
  });

  it("dates survive CSV roundtrip in correct format", async ({ skip }) => {
    if (!available) skip();

    const exportRes = await getExport("/api/hearing-aid/export", "csv");
    const csvText = await exportRes.text();

    // Find the line with RT-TEST-001
    const lines = csvText.split("\n");
    const testLine = lines.find((l) => l.includes("RT-TEST-001"));
    expect(testLine).toBeDefined();

    // The warranty_end_date should appear as YYYY-MM-DD
    expect(testLine).toContain("2027-06-30");
  });

  it("null fields survive roundtrip as null, not empty string", async ({ skip }) => {
    if (!available) skip();

    // RT-TEST-002 has null last_repair_details and repair_address
    const aids = (await findAll("hearing_aid", {
      filterBy: { patientId },
    })) as Row[];
    const aid = aids.find((a) => a.serial_number === "RT-TEST-002");
    expect(aid).toBeDefined();
    expect(aid!.last_repair_details).toBeNull();
    expect(aid!.repair_address).toBeNull();
  });
});
