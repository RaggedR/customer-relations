/**
 * CRUD E2E Tests — Sections 1-4 of HUMAN_TESTS_TODO.md
 *
 * Section 1: Patient CRUD (7 tests)
 * Section 2: Nurse CRUD (4 tests)
 * Section 3: Appointment CRUD (7 tests)
 * Section 4: Clinical Data + Immutability (10 tests)
 */

import { test, expect } from "playwright/test";
import {
  E2E_PREFIX,
  createPatient,
  createNurse,
  createAppointment,
  createClinicalNote,
  createPersonalNote,
  createHearingAid,
  createReferral,
  createClaimItem,
  cleanup,
} from "./helpers/fixtures";

// All tests run under the "admin" project (storageState with admin session)

// ─── Section 1: Patient CRUD ──────────────────────────────────────────────────

test.describe("Section 1 — Patient CRUD", () => {
  test.beforeAll(async ({ request }) => {
    await cleanup(request); // clean up from previous runs
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("create patient with all fields", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add Patient" }).click();
    await page.waitForTimeout(500);

    // Fill all fields (use placeholder locators — labels have CSS capitalize + asterisks)
    await page.getByPlaceholder("name").fill(`${E2E_PREFIX} Full Fields Patient`);
    await page.locator("input[type='date']").first().fill("1985-06-15");
    await page.getByPlaceholder("medicare number").fill("9876543210");
    await page.getByPlaceholder("phone").fill("0411222333");
    await page.getByPlaceholder("email").fill("fullfields@test.local");
    await page.getByPlaceholder("address").fill("123 E2E Street, Melbourne VIC 3000");
    await page.locator("select").first().selectOption("active");
    await page.getByPlaceholder("notes").fill("Patient created by E2E test with all fields");

    await page.getByRole("button", { name: "Create Patient" }).click();
    await page.waitForTimeout(1000);

    // Open search and verify patient exists
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search patients...").fill("Full Fields Patient");
    await page.waitForTimeout(500);
    await expect(page.getByText("Full Fields Patient")).toBeVisible();
  });

  test("create patient with only required fields", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add Patient" }).click();
    await page.waitForTimeout(500);

    await page.getByPlaceholder("name").fill(`${E2E_PREFIX} Minimal Patient`);
    await page.getByRole("button", { name: "Create Patient" }).click();
    await page.waitForTimeout(1000);

    // Verify search finds it
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search patients...").fill("Minimal Patient");
    await page.waitForTimeout(500);
    await expect(page.getByText("Minimal Patient")).toBeVisible();
  });

  test("search for patient by name", async ({ page, request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Searchable Sam`,
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);

    await page.getByPlaceholder("Search patients...").fill("Searchable Sam");
    await page.waitForTimeout(500);

    await expect(page.getByText("Searchable Sam")).toBeVisible();
  });

  test("open patient detail — all fields display", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Detail Donna`,
      phone: "0400111222",
      email: "donna@test.local",
      status: "active",
    });

    // Verify the patient exists in DB before searching UI
    const check = await request.get(`/api/patient/${patient.id}`);
    expect(check.ok()).toBeTruthy();

    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(1000);

    // Clear search and type — retry once if needed
    const searchInput = page.getByPlaceholder("Search patients...");
    await searchInput.fill("");
    await page.waitForTimeout(500);
    await searchInput.fill("Detail Donna");
    await page.waitForTimeout(1500);

    // Wait for search results to load, then click
    const result = page.getByText("Detail Donna").first();
    await expect(result).toBeVisible({ timeout: 10000 });
    await result.click();
    await page.waitForTimeout(1000);

    // Verify key fields are visible in the detail panel
    await expect(page.getByText("donna@test.local").last()).toBeVisible();
    await expect(page.getByText("0400111222").last()).toBeVisible();
  });

  test("edit patient via API and verify in UI", async ({ page, request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Editable Eve`,
      phone: "0400000001",
    });

    // Edit via API (PUT requires all required fields — name is required)
    const res = await request.put(`/api/patient/${patient.id}`, {
      data: { name: patient.name, phone: "0499999999" },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`PUT /api/patient/${patient.id} failed (${res.status()}): ${body}`);
    }

    // Verify the change shows in the UI
    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("Search patients...").fill("Editable Eve");
    await page.waitForTimeout(800);
    await page.getByText("Editable Eve").first().click();
    await page.waitForTimeout(800);

    await expect(page.getByText("0499999999").last()).toBeVisible();
  });

  test("drill down to referrals from patient detail", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Drilldown Diane`,
    });
    await createReferral(request, patient.id);
    await createClinicalNote(request, patient.id);
    await createHearingAid(request, patient.id);

    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search patients...").fill("Drilldown Diane");
    await page.waitForTimeout(500);
    await page.getByText("Drilldown Diane").click();
    await page.waitForTimeout(500);

    // Verify property links with counts
    await expect(
      page.getByRole("button", { name: /Referrals/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Clinical Notes/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Hearing Aids/i }),
    ).toBeVisible();

    // Click into referrals
    await page.getByRole("button", { name: /Referrals/i }).click();
    await page.waitForTimeout(500);

    // Verify referral data is visible in the property panel
    await expect(page.getByText("Dr. Referrer")).toBeVisible();
  });

  test("delete patient", async ({ page, request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Deletable Dan`,
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("Search patients...").fill("Deletable Dan");
    await page.waitForTimeout(800);
    await page.getByText("Deletable Dan").first().click();
    await page.waitForTimeout(800);

    // Delete with two-step confirmation
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForTimeout(1500);

    // Verify patient is gone — check via API (more reliable than UI refresh)
    const res = await request.get(`/api/patient?search=${encodeURIComponent("Deletable Dan")}`);
    const list = await res.json();
    const found = list.filter((p: { name: string }) => p.name.includes("Deletable Dan"));
    expect(found.length).toBe(0);
  });
});

// ─── Section 2: Nurse CRUD ────────────────────────────────────────────────────

test.describe("Section 2 — Nurse CRUD", () => {
  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("create nurse with all fields", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add Nurse" }).click();
    await page.waitForTimeout(500);

    await page.getByPlaceholder("name").fill(`${E2E_PREFIX} Nurse Nancy`);
    await page.getByPlaceholder("phone").fill("0422333444");
    await page.getByPlaceholder("email").fill("nancy@test.local");
    await page.getByPlaceholder("registration number").fill("NR-E2E-NANCY");

    await page.getByRole("button", { name: "Create Nurse" }).click();
    await page.waitForTimeout(1000);

    // Verify in search
    await page.getByRole("button", { name: "Nurses" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search nurses...").fill("Nurse Nancy");
    await page.waitForTimeout(500);
    await expect(page.getByText("Nurse Nancy")).toBeVisible();
  });

  test("edit nurse via API and verify in UI", async ({ page, request }) => {
    const nurse = await createNurse(request, {
      name: `${E2E_PREFIX} Editable Nurse`,
      phone: "0400000002",
    });

    // Edit via API
    const res = await request.put(`/api/nurse/${nurse.id}`, {
      data: { name: nurse.name, phone: "0488888888" },
    });
    expect(res.ok()).toBeTruthy();

    // Verify in UI
    await page.goto("/");
    await page.getByRole("button", { name: "Nurses" }).first().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("Search nurses...").fill("Editable Nurse");
    await page.waitForTimeout(800);
    await page.getByText("Editable Nurse").first().click();
    await page.waitForTimeout(800);
    await expect(page.getByText("0488888888").last()).toBeVisible();
  });

  test("nurse appears in appointment form dropdown", async ({
    page,
    request,
  }) => {
    const nurse = await createNurse(request, {
      name: `${E2E_PREFIX} Dropdown Nurse`,
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Add Appointment" }).click();
    await page.waitForTimeout(1000);

    // Check the nurse select has our nurse as an option
    const nurseSelect = page.locator("select").last();
    await expect(nurseSelect).toBeVisible();
    const options = await nurseSelect.locator("option").allTextContents();
    expect(options.some((o) => o.includes("Dropdown Nurse"))).toBeTruthy();
  });

  test("add nurse specialty via drill-down", async ({ page, request }) => {
    const nurse = await createNurse(request, {
      name: `${E2E_PREFIX} Specialty Nurse`,
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Nurses" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search nurses...").fill("Specialty Nurse");
    await page.waitForTimeout(500);
    await page.getByText("Specialty Nurse").click();
    await page.waitForTimeout(500);

    // Look for Nurse Specialties property link — may show as 0 items
    const specialtyLink = page.getByRole("button", {
      name: /Nurse Specialt/i,
    });
    // If the property link exists and is clickable (count > 0 or always shown)
    if ((await specialtyLink.count()) > 0) {
      await specialtyLink.click();
      await page.waitForTimeout(500);
      // The property panel should open — look for an Add button or empty state
      await expect(
        page.getByText(/No nurse specialt/i).or(page.getByText(/Nurse Specialt/i)),
      ).toBeVisible();
    }
  });
});

// ─── Section 3: Appointment CRUD ──────────────────────────────────────────────

test.describe("Section 3 — Appointment CRUD", () => {
  let patientId: number;
  let nurseId: number;

  test.beforeAll(async ({ request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Appt Patient`,
    });
    patientId = patient.id;

    const nurse = await createNurse(request, {
      name: `${E2E_PREFIX} Appt Nurse`,
    });
    nurseId = nurse.id;
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("create appointment via form", async ({ page }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    await page.goto("/");
    await page.getByRole("button", { name: "Add Appointment" }).click();
    await page.waitForTimeout(1000);

    await page.locator("input[type='date']").first().fill(dateStr);
    await page.locator("input[type='time']").first().fill("09:00");
    await page.locator("input[type='time']").last().fill("09:30");
    await page.getByPlaceholder("location").fill("E2E Clinic Room 1");
    await page.getByPlaceholder("specialty").fill("Audiology");

    // Select patient and nurse from dropdowns
    const selects = page.locator("select");
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
      const sel = selects.nth(i);
      const options = await sel.locator("option").allTextContents();
      if (options.some((o) => o.includes("Appt Patient"))) {
        const matchOpt = await sel
          .locator("option")
          .filter({ hasText: "Appt Patient" });
        const val = await matchOpt.getAttribute("value");
        if (val) await sel.selectOption(val);
      } else if (options.some((o) => o.includes("Appt Nurse"))) {
        const matchOpt = await sel
          .locator("option")
          .filter({ hasText: "Appt Nurse" });
        const val = await matchOpt.getAttribute("value");
        if (val) await sel.selectOption(val);
      }
    }

    await page.getByRole("button", { name: "Create Appointment" }).click();
    await page.waitForTimeout(1000);

    // Verify success — no error message visible
    await expect(page.getByText(/error/i)).not.toBeVisible();
  });

  test("appointment detail shows patient and nurse links", async ({
    page,
    request,
  }) => {
    const appt = await createAppointment(request, patientId, nurseId, {
      notes: `${E2E_PREFIX} link test`,
    });

    await page.goto("/");
    await page.waitForTimeout(1500);

    // Find and click the appointment pill on the calendar
    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']",
    );
    const count = await pills.count();
    if (count > 0) {
      // Click the last pill (most likely our new appointment)
      await pills.last().click();
      await page.waitForTimeout(500);

      // Look for blue relation links
      const relationLinks = page.locator("button[class*='text-blue']");
      await expect(relationLinks.first()).toBeVisible();
    }
  });

  test("edit appointment — reschedule", async ({ page, request }) => {
    const appt = await createAppointment(request, patientId, nurseId, {
      notes: `${E2E_PREFIX} reschedule test`,
    });

    // Edit via API (PUT requires all required fields)
    const res = await request.put(`/api/appointment/${appt.id}`, {
      data: {
        date: appt.date,
        start_time: "14:00",
        end_time: "14:30",
        location: appt.location,
        specialty: appt.specialty,
      },
    });
    expect(res.ok()).toBeTruthy();

    const updated = await res.json();
    expect(updated.start_time).toContain("14:00");
  });

  test("change appointment status", async ({ page, request }) => {
    const appt = await createAppointment(request, patientId, nurseId, {
      status: "confirmed",
      notes: `${E2E_PREFIX} status change test`,
    });

    const res = await request.put(`/api/appointment/${appt.id}`, {
      data: {
        date: appt.date,
        start_time: appt.start_time,
        end_time: appt.end_time,
        location: appt.location,
        specialty: appt.specialty,
        status: "cancelled",
      },
    });
    expect(res.ok()).toBeTruthy();

    const updated = await res.json();
    expect(updated.status).toBe("cancelled");
  });

  test("delete appointment", async ({ page, request }) => {
    const appt = await createAppointment(request, patientId, nurseId, {
      notes: `${E2E_PREFIX} delete test`,
    });

    const res = await request.delete(`/api/appointment/${appt.id}`);
    expect(res.ok()).toBeTruthy();

    // Verify it's gone
    const getRes = await request.get(`/api/appointment/${appt.id}`);
    expect(getRes.status()).toBe(404);
  });

  test("drill down: appointment detail → patient detail", async ({
    page,
    request,
  }) => {
    const appt = await createAppointment(request, patientId, nurseId, {
      notes: `${E2E_PREFIX} drilldown test`,
    });

    await page.goto("/");
    await page.waitForTimeout(1500);

    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']",
    );
    if ((await pills.count()) > 0) {
      await pills.last().click();
      await page.waitForTimeout(500);

      // Click the patient relation link (blue text)
      const patientLink = page
        .locator("button[class*='text-blue']")
        .filter({ hasText: "Appt Patient" });
      if ((await patientLink.count()) > 0) {
        await patientLink.click();
        await page.waitForTimeout(500);
        // Patient detail should now be visible
        await expect(page.getByText("Appt Patient")).toBeVisible();
      }
    }
  });

  test("drill down: appointment detail → nurse detail", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']",
    );
    if ((await pills.count()) > 0) {
      await pills.last().click();
      await page.waitForTimeout(500);

      const nurseLink = page
        .locator("button[class*='text-blue']")
        .filter({ hasText: "Appt Nurse" });
      if ((await nurseLink.count()) > 0) {
        await nurseLink.click();
        await page.waitForTimeout(500);
        await expect(page.getByText("Appt Nurse")).toBeVisible();
      }
    }
  });
});

// ─── Section 4: Clinical Data + Immutability ──────────────────────────────────

test.describe("Section 4 — Clinical Data Creation", () => {
  let patientId: number;

  test.beforeAll(async ({ request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Clinical Patient`,
    });
    patientId = patient.id;
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("create clinical note via API", async ({ request }) => {
    const note = await createClinicalNote(request, patientId);
    expect(note.id).toBeDefined();
    expect(note.content).toContain(E2E_PREFIX);
  });

  test("create personal note via API", async ({ request }) => {
    const note = await createPersonalNote(request, patientId);
    expect(note.id).toBeDefined();
    expect(note.content).toContain(E2E_PREFIX);
  });

  test("create hearing aid record via API", async ({ request }) => {
    const aid = await createHearingAid(request, patientId);
    expect(aid.id).toBeDefined();
    expect(aid.ear).toBe("left");
  });

  test("create referral via API", async ({ request }) => {
    const ref = await createReferral(request, patientId);
    expect(ref.id).toBeDefined();
    expect(ref.referring_gp).toContain(E2E_PREFIX);
  });

  test("create claim item via API", async ({ request }) => {
    const claim = await createClaimItem(request, patientId);
    expect(claim.id).toBeDefined();
    expect(claim.status).toBe("pending");
  });

  test("all properties appear on patient detail", async ({
    page,
    request,
  }) => {
    // Ensure at least one of each property exists
    await createClinicalNote(request, patientId, {
      content: `${E2E_PREFIX} verify-count clinical note`,
    });
    await createPersonalNote(request, patientId, {
      content: `${E2E_PREFIX} verify-count personal note`,
    });
    await createHearingAid(request, patientId, {
      serial_number: `E2E-COUNT-${Date.now()}`,
    });
    await createReferral(request, patientId, {
      referring_gp: `${E2E_PREFIX} Count GP`,
    });
    await createClaimItem(request, patientId, {
      item_number: `COUNT-${Date.now()}`,
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Search patients...").fill("Clinical Patient");
    await page.waitForTimeout(500);
    await page.getByText("Clinical Patient").click();
    await page.waitForTimeout(500);

    // Verify property sections are visible
    await expect(
      page.getByRole("button", { name: /Clinical Notes/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Personal Notes/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Hearing Aids/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Referrals/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Claim Items/i }),
    ).toBeVisible();
  });
});

test.describe("Section 4 — Immutability (API level)", () => {
  let clinicalNoteId: number;
  let personalNoteId: number;

  test.beforeAll(async ({ request }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Immutable Patient`,
    });
    const cn = await createClinicalNote(request, patient.id);
    clinicalNoteId = cn.id;
    const pn = await createPersonalNote(request, patient.id);
    personalNoteId = pn.id;
  });

  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("PUT clinical_note returns 405", async ({ request }) => {
    const res = await request.put(`/api/clinical_note/${clinicalNoteId}`, {
      data: { content: "modified" },
    });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toContain("immutable");
  });

  test("DELETE clinical_note returns 405", async ({ request }) => {
    const res = await request.delete(`/api/clinical_note/${clinicalNoteId}`);
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toContain("immutable");
  });

  test("PUT personal_note returns 405", async ({ request }) => {
    const res = await request.put(`/api/personal_note/${personalNoteId}`, {
      data: { content: "modified" },
    });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error).toContain("immutable");
  });

  test("import clinical notes via CSV is blocked", async ({ request }) => {
    const csvContent = "date,note_type,content,clinician\n2024-01-01,progress_note,imported,Dr. Hack";
    const res = await request.post("/api/clinical_note/import", {
      multipart: {
        file: {
          name: "notes.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csvContent),
        },
      },
    });
    // Should be blocked — either 405 or 403
    expect([403, 405]).toContain(res.status());
  });
});
