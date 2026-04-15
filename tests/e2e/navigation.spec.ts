/**
 * Navigation Model E2E Tests — Section 11 of HUMAN_TESTS_TODO.md
 *
 * Tests the schema-driven navigation: sidebar structure, drill-down chains,
 * unique window IDs, and window positioning.
 */

import { test, expect } from "playwright/test";
import {
  E2E_PREFIX,
  createPatient,
  createReferral,
  cleanup,
} from "./helpers/fixtures";

// All tests run under the "admin" project

test.describe("Section 11 — Navigation Model", () => {
  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("sidebar shows only first-order entities", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);

    // First-order entities should be in the sidebar
    await expect(page.getByRole("button", { name: "Patients" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nurses" })).toBeVisible();

    // Second-order entities (properties) should NOT be in the sidebar
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Referrals")).not.toBeVisible();
    await expect(sidebar.getByText("Clinical Notes")).not.toBeVisible();
    await expect(sidebar.getByText("Hearing Aids")).not.toBeVisible();
    await expect(sidebar.getByText("Claim Items")).not.toBeVisible();
    await expect(sidebar.getByText("Nurse Specialties")).not.toBeVisible();
  });

  test("drill-down chain: sidebar → search → detail → property", async ({
    page,
    request,
  }) => {
    // Setup: create patient with a referral
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Nav Chain Patient`,
    });
    await createReferral(request, patient.id);

    await page.goto("/");

    // Step 1: Sidebar → search window
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder("Search patients...")).toBeVisible();

    // Step 2: Search → detail window
    await page
      .getByPlaceholder("Search patients...")
      .fill("Nav Chain Patient");
    await page.waitForTimeout(800);
    await page.getByText("Nav Chain Patient").first().click();
    await page.waitForTimeout(800);

    // Verify detail panel is showing the patient
    await expect(page.getByText("Nav Chain Patient").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

    // Step 3: Detail → property window
    await page.getByRole("button", { name: /Referrals/i }).click();
    await page.waitForTimeout(500);

    // Referral data should be visible in the property panel
    await expect(page.getByText("Dr. Referrer")).toBeVisible();
  });

  test("multiple windows get unique IDs — no duplicates", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(500);

    // Open patient search
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(300);

    // Open nurse search
    await page.getByRole("button", { name: "Nurses" }).first().click();
    await page.waitForTimeout(300);

    // Open add patient form
    await page.getByRole("button", { name: "Add Patient" }).click();
    await page.waitForTimeout(300);

    // Count floating windows — each should be distinct
    // Floating windows are portaled to body with class "fixed rounded-lg"
    const windows = page.locator("[class*='fixed'][class*='rounded-lg']");
    const count = await windows.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Verify each has a different title
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const title = await windows
        .nth(i)
        .locator("span.truncate")
        .first()
        .textContent();
      if (title) titles.push(title);
    }
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });

  test("window positioning: search left, detail right", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, {
      name: `${E2E_PREFIX} Position Patient`,
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Patients" }).first().click();
    await page.waitForTimeout(800);

    // Get the first floating window (search)
    const windows = page.locator("[class*='fixed'][class*='rounded-lg']");
    const searchBox = await windows.first().boundingBox();

    // Open detail
    await page.getByPlaceholder("Search patients...").fill("Position Patient");
    await page.waitForTimeout(800);
    await page.getByText("Position Patient").first().click();
    await page.waitForTimeout(800);

    // Now there should be 2 floating windows — the last is the detail
    const windowCount = await windows.count();
    expect(windowCount).toBeGreaterThanOrEqual(2);
    const detailBox = await windows.last().boundingBox();

    // Detail should be to the right of search
    if (searchBox && detailBox) {
      expect(detailBox.x).toBeGreaterThan(searchBox.x);
    }
  });
});
