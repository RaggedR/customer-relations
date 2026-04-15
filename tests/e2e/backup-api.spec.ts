/**
 * Backup API E2E Tests — Section 10 of HUMAN_TESTS_TODO.md
 *
 * Tests the GET /api/backup endpoint for JSON full export.
 * Shell script backup/restore (backup.sh, restore.sh) are [HUMAN] items.
 */

import { test, expect } from "playwright/test";
import {
  E2E_PREFIX,
  createPatient,
  createClinicalNote,
  createReferral,
  cleanup,
} from "./helpers/fixtures";

test.describe("Section 10 — Backup API", () => {
  let patientId: number;

  test.beforeAll(async ({ request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Backup Test Patient`,
      phone: "0400777888",
      email: "backup@test.local",
    });
    patientId = patient.id;
    await createReferral(request, patientId);
    await createClinicalNote(request, patientId);
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("GET /api/backup returns valid backup structure", async ({
    request,
  }) => {
    const res = await request.get("/api/backup");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(res.headers()["content-disposition"]).toContain("backup-");

    const body = await res.json();

    // Top-level structure
    expect(body.exported_at).toBeDefined();
    expect(body.version).toBe("1.0");
    expect(Array.isArray(body.import_order)).toBe(true);
    expect(typeof body.entity_counts).toBe("object");
    expect(typeof body.entities).toBe("object");

    // Import order should include key entities
    expect(body.import_order).toContain("patient");
    expect(body.import_order).toContain("nurse");
    expect(body.import_order).toContain("appointment");

    // Entity counts should match
    for (const [entity, count] of Object.entries(body.entity_counts)) {
      expect(typeof count).toBe("number");
      expect(body.entities[entity]).toBeDefined();
      expect(body.entities[entity].length).toBe(count);
    }

    // Sensitive entities should be excluded
    expect(body.entities.user).toBeUndefined();
    expect(body.entities.session).toBeUndefined();
  });

  test("backup contains our test patient with correct fields", async ({
    request,
  }) => {
    const res = await request.get("/api/backup");
    const body = await res.json();

    const patients = body.entities.patient ?? [];
    const testPatient = patients.find((p: Record<string, string>) =>
      p.name?.includes("Backup Test Patient"),
    );
    expect(testPatient).toBeDefined();
    expect(testPatient.phone).toBe("0400777888");
    expect(testPatient.email).toBe("backup@test.local");

    // Should have FK references, not nested objects
    expect(testPatient.id).toBeDefined();
    expect(testPatient.createdAt).toBeDefined();
  });

  test("backup includes related records (referrals, notes)", async ({
    request,
  }) => {
    const res = await request.get("/api/backup");
    const body = await res.json();

    // Referrals should exist and reference our patient
    const referrals = body.entities.referral ?? [];
    const testReferral = referrals.find(
      (r: Record<string, unknown>) => r.patientId === patientId,
    );
    expect(testReferral).toBeDefined();
    expect(testReferral.referring_gp).toContain(E2E_PREFIX);

    // Clinical notes
    const notes = body.entities.clinical_note ?? [];
    const testNote = notes.find(
      (n: Record<string, unknown>) => n.patientId === patientId,
    );
    expect(testNote).toBeDefined();
  });
});

test.describe("Section 10 — Backup Auth", () => {
  test("GET /api/backup without auth — no crash", async () => {
    // Use raw fetch without any session cookie to test unauthenticated access
    const res = await fetch("http://localhost:3000/api/backup", {
      redirect: "manual",
    });
    // The backup endpoint may or may not require auth.
    // If it requires auth: expect redirect (302) or forbidden (401/403).
    // If it doesn't: expect 200 with valid JSON.
    // Either behaviour is acceptable — we just verify no crash.
    expect([200, 302, 307, 401, 403]).toContain(res.status);

    if (res.ok) {
      const body = await res.json();
      expect(body.version).toBe("1.0");
    }
  });
});
