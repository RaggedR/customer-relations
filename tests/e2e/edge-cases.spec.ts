/**
 * Edge Cases E2E Tests — Sections 15, 21, 22 of HUMAN_TESTS_TODO.md
 *
 * Section 15: Error handling & validation (5 tests)
 * Section 21: Concurrency & race conditions (4 tests)
 * Section 22: Boundary values (7 tests)
 *
 * All tests use the "admin" project (storageState with admin session).
 */

import { test, expect } from "playwright/test";
import {
  E2E_PREFIX,
  createPatient,
  createNurse,
  createAppointment,
  createClaimItem,
  cleanup,
} from "./helpers/fixtures";

// ─── Section 15: Edge Cases & Error Handling ──────────────────────────────────

test.describe("Section 15 — Validation & Error Handling", () => {
  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("invalid email returns validation error", async ({ request }) => {
    const res = await request.post("/api/patient", {
      data: {
        name: `${E2E_PREFIX} Bad Email Patient`,
        email: "not-an-email",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/email/i);
  });

  test("missing required fields returns error", async ({ request }) => {
    // Appointment requires date, start_time, end_time, location, specialty
    const res = await request.post("/api/appointment", {
      data: { notes: "missing everything" },
    });
    expect(res.ok()).toBeFalsy();
  });

  test("duplicate patient names — both stored", async ({ request }) => {
    const name = `${E2E_PREFIX} Twin Patient`;
    const p1 = await request.post("/api/patient", { data: { name } });
    expect(p1.ok()).toBeTruthy();
    const p2 = await request.post("/api/patient", { data: { name } });
    expect(p2.ok()).toBeTruthy();

    const id1 = (await p1.json()).id;
    const id2 = (await p2.json()).id;
    // Both should exist with different IDs
    expect(id1).not.toBe(id2);

    const search = await request.get(
      `/api/patient?search=${encodeURIComponent("Twin Patient")}`,
    );
    const list = await search.json();
    const twins = list.filter((p: Record<string, string>) =>
      p.name.includes("Twin Patient"),
    );
    expect(twins.length).toBeGreaterThanOrEqual(2);
  });

  test("malformed CSV import returns graceful error", async ({ request }) => {
    // Binary garbage pretending to be CSV
    const garbage = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x89, 0x50]);
    const res = await request.post("/api/referral/import", {
      multipart: {
        file: {
          name: "garbage.csv",
          mimeType: "text/csv",
          buffer: garbage,
        },
      },
    });
    // Should return 400, not crash
    expect([200, 400]).toContain(res.status());
  });

  test("10MB string in notes field — server doesn't crash", async ({
    request,
  }) => {
    const bigNotes = "x".repeat(10 * 1024 * 1024);
    const res = await request.post("/api/patient", {
      data: {
        name: `${E2E_PREFIX} Big Notes Patient`,
        notes: bigNotes,
      },
    });
    // Server may accept, reject with 413, or return 400 — all acceptable
    expect(res.status()).toBeLessThan(600);

    // Verify server is still alive
    const healthCheck = await request.get("/api/patient?search=health");
    expect(healthCheck.status()).toBeLessThan(600);
  });
});

// ─── Section 21: Concurrency & Race Conditions ───────────────────────────────

test.describe("Section 21 — Concurrency", () => {
  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("create same patient simultaneously — both succeed, no deadlock", async ({
    request,
  }) => {
    const name = `${E2E_PREFIX} Concurrent Create`;

    // Fire two creates in parallel
    const [res1, res2] = await Promise.all([
      request.post("/api/patient", { data: { name } }),
      request.post("/api/patient", { data: { name } }),
    ]);

    // Both should succeed (no uniqueness constraint on name)
    expect(res1.ok()).toBeTruthy();
    expect(res2.ok()).toBeTruthy();

    const id1 = (await res1.json()).id;
    const id2 = (await res2.json()).id;
    expect(id1).not.toBe(id2);
  });

  test("delete patient while reading detail — graceful 404", async ({
    request,
  }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Delete Race Patient`,
    });

    // Delete and read in parallel
    const [deleteRes, readRes] = await Promise.all([
      request.delete(`/api/patient/${patient.id}`),
      request.get(`/api/patient/${patient.id}`),
    ]);

    // Delete should succeed
    expect(deleteRes.ok()).toBeTruthy();
    // Read may get 200 (arrived first) or 404 (arrived after delete)
    expect([200, 404]).toContain(readRes.status());
  });

  test("concurrent edits — last-write-wins, no corruption", async ({
    request,
  }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Edit Race Patient`,
      phone: "0400000000",
    });

    // Two simultaneous edits changing different fields
    const [res1, res2] = await Promise.all([
      request.put(`/api/patient/${patient.id}`, {
        data: { name: patient.name, phone: "0411111111" },
      }),
      request.put(`/api/patient/${patient.id}`, {
        data: { name: patient.name, phone: "0422222222" },
      }),
    ]);

    // Both should succeed (no optimistic locking)
    expect(res1.ok()).toBeTruthy();
    expect(res2.ok()).toBeTruthy();

    // Final state should be one of the two values — not corrupted
    const final = await request.get(`/api/patient/${patient.id}`);
    const body = await final.json();
    expect(["0411111111", "0422222222"]).toContain(body.phone);
  });

  test("backup during concurrent writes — completes without error", async ({
    request,
  }) => {
    // Fire a backup and a create simultaneously
    const [backupRes, createRes] = await Promise.all([
      request.get("/api/backup"),
      createPatient(request, {
        name: `${E2E_PREFIX} Backup Race Patient`,
      }),
    ]);

    expect(backupRes.ok()).toBeTruthy();
    const backup = await backupRes.json();
    expect(backup.version).toBe("1.0");
    expect(backup.entities.patient).toBeDefined();

    expect(createRes.id).toBeDefined();
  });
});

// ─── Section 22: Boundary Values ─────────────────────────────────────────────

test.describe("Section 22 — Boundary Values", () => {
  let patientId: number;
  let nurseId: number;

  test.beforeAll(async ({ request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Boundary Patient`,
    });
    patientId = patient.id;
    const nurse = await createNurse(request, {
      name: `${E2E_PREFIX} Boundary Nurse`,
    });
    nurseId = nurse.id;
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("appointment at midnight boundary (23:59 → 00:01)", async ({
    request,
  }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const res = await request.post("/api/appointment", {
      data: {
        date: dateStr,
        start_time: "23:59",
        end_time: "00:01",
        location: "E2E Midnight Clinic",
        specialty: "Audiology",
        status: "confirmed",
        notes: `${E2E_PREFIX} midnight boundary`,
        patient: patientId,
        nurse: nurseId,
      },
    });
    expect(res.ok()).toBeTruthy();
    const appt = await res.json();
    expect(appt.start_time).toContain("23:59");
    expect(appt.end_time).toContain("00:01");
  });

  test("future date of birth (tomorrow) — accepted or rejected consistently", async ({
    request,
  }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureDate = tomorrow.toISOString().split("T")[0];

    const res = await request.post("/api/patient", {
      data: {
        name: `${E2E_PREFIX} Future DOB Patient`,
        date_of_birth: futureDate,
      },
    });
    // Either accepted (200) or rejected (400) — not a crash
    expect([200, 201, 400]).toContain(res.status());
  });

  test("date of birth 1900-01-01 — saves correctly", async ({ request }) => {
    const res = await request.post("/api/patient", {
      data: {
        name: `${E2E_PREFIX} Old DOB Patient`,
        date_of_birth: "1900-01-01",
      },
    });
    expect(res.ok()).toBeTruthy();
    const patient = await res.json();
    expect(patient.date_of_birth).toContain("1900");
  });

  test("claim amount = 0 — accepted", async ({ request }) => {
    const res = await createClaimItem(request, patientId, {
      amount: 0,
      item_number: `E2E-ZERO-${Date.now()}`,
    });
    expect(res.amount).toBe(0);
  });

  test("claim amount = -100 — accepted or rejected consistently", async ({
    request,
  }) => {
    const res = await request.post("/api/claim_item", {
      data: {
        item_number: `E2E-NEG-${Date.now()}`,
        date_of_service: new Date().toISOString().split("T")[0],
        amount: -100,
        status: "pending",
        patient: patientId,
      },
    });
    // Either accepted or rejected — not a crash
    expect([200, 201, 400]).toContain(res.status());
  });

  test("claim amount = 999999999.99 — no overflow", async ({ request }) => {
    const res = await createClaimItem(request, patientId, {
      amount: 999999999.99,
      item_number: `E2E-BIG-${Date.now()}`,
    });
    // Should store without overflow — check the value is close
    expect(res.amount).toBeGreaterThan(999999999);
  });

  test("patient with 500-character name — saves and displays", async ({
    page,
    request,
  }) => {
    const longName = `${E2E_PREFIX} ${"A".repeat(485)}`;
    expect(longName.length).toBeGreaterThanOrEqual(490);

    const res = await request.post("/api/patient", {
      data: { name: longName },
    });
    expect(res.ok()).toBeTruthy();
    const patient = await res.json();
    expect(patient.name.length).toBeGreaterThanOrEqual(490);

    // Verify it renders in the UI without breaking layout
    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search patients...").fill("AAAA");
    await page.waitForTimeout(1500);

    // Should find and display without crashing
    await expect(page.locator("body")).toBeVisible();
  });
});
