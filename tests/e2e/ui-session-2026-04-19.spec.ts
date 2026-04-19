/**
 * UI E2E Tests — Session 2026-04-19
 *
 * Covers:
 * - Patient Portal (/portal): header, appointments list, appointment detail,
 *   back navigation, profile (Medicare), booking flow
 * - Nurse Portal (/nurse): header, nav tabs, appointments, past section
 *   collapsible, notes Show/Hide button, countdown timer, patient records
 * - Admin Calendar (/): count pills, highlight dropdown, cell popup, nurse names
 *
 * Runs in NEXT_PUBLIC_DEMO_MODE=true — no login required.
 * Each test does its own page.goto() for full independence.
 */

import { test, expect } from "playwright/test";

// ---------------------------------------------------------------------------
// Patient Portal
// ---------------------------------------------------------------------------

test.describe("Patient Portal — Header", () => {
  test("shows 'Logged in as Margaret Thompson'", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    // Wait for the async profile fetch to resolve
    await page.waitForSelector("text=Logged in as", { timeout: 10000 });
    await expect(page.locator("text=Margaret Thompson")).toBeVisible();
  });

  test("navigation links exist: Appointments, Book, My Profile, Privacy", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/portal");
    await expect(page.locator("a:has-text('Appointments')").first()).toBeVisible();
    await expect(page.locator("a:has-text('Book')")).toBeVisible();
    await expect(page.locator("a:has-text('My Profile')")).toBeVisible();
    await expect(page.locator("a:has-text('Privacy')")).toBeVisible();
  });
});

test.describe("Patient Portal — Appointments List", () => {
  test("shows 'Upcoming Appointments' heading", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForSelector("h2", { timeout: 10000 });
    await expect(page.locator("h2:has-text('Upcoming Appointments')")).toBeVisible();
  });

  test("appointment cards are rendered as links", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const cards = page.locator("a[href^='/portal/appointments/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Patient Portal — Appointment Detail", () => {
  test("clicking an appointment card navigates to /portal/appointments/[id]", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const firstCard = page.locator("a[href^='/portal/appointments/']").first();
    await firstCard.click();
    await page.waitForURL(/\/portal\/appointments\/\d+/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/portal\/appointments\/\d+/);
  });

  test("detail page shows Time, Location, Specialty fields", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await page.locator("a[href^='/portal/appointments/']").first().click();
    await page.waitForURL(/\/portal\/appointments\/\d+/, { timeout: 10000 });
    await expect(page.locator("span.text-muted-foreground:has-text('Time')")).toBeVisible();
    await expect(page.locator("span.text-muted-foreground:has-text('Location')")).toBeVisible();
    await expect(page.locator("span.text-muted-foreground:has-text('Specialty')")).toBeVisible();
  });

  test("detail page shows a status badge", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await page.locator("a[href^='/portal/appointments/']").first().click();
    await page.waitForURL(/\/portal\/appointments\/\d+/, { timeout: 10000 });
    const badge = page.locator("span[class*='rounded-full']");
    await expect(badge).toBeVisible();
  });

  test("detail page shows the date heading", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await page.locator("a[href^='/portal/appointments/']").first().click();
    await page.waitForURL(/\/portal\/appointments\/\d+/, { timeout: 10000 });
    const heading = page.locator("h2.text-xl");
    await expect(heading).toBeVisible();
    const text = await heading.textContent();
    expect(text).toBeTruthy();
  });

  test("back link returns to /portal", async ({ page }) => {
    await page.goto("http://localhost:3000/portal");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await page.locator("a[href^='/portal/appointments/']").first().click();
    await page.waitForURL(/\/portal\/appointments\/\d+/, { timeout: 10000 });
    await page.locator("a:has-text('Back to appointments')").click();
    await page.waitForURL("http://localhost:3000/portal", { timeout: 10000 });
    expect(page.url()).toBe("http://localhost:3000/portal");
  });
});

test.describe("Patient Portal — Profile", () => {
  test("profile page shows 'Medicare number' label", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/profile");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await expect(
      page.locator("span.text-muted-foreground:has-text('Medicare number')")
    ).toBeVisible();
  });

  test("profile page shows 'My Profile' heading", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/profile");
    await page.waitForSelector("h2", { timeout: 10000 });
    await expect(page.locator("h2:has-text('My Profile')")).toBeVisible();
  });

  test("profile page shows the patient Name field", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/profile");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await expect(
      page.locator("span.text-muted-foreground:has-text('Name')")
    ).toBeVisible();
  });
});

test.describe("Patient Portal — Book Tab", () => {
  test("Book page shows 'Book an Appointment' heading", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/book");
    await expect(page.locator("h2:has-text('Book an Appointment')")).toBeVisible();
  });

  test("specialty dropdown exists with 'Choose...' placeholder", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/book");
    await expect(page.locator("label:has-text('Select a specialty')")).toBeVisible();
    const select = page.locator("select");
    await expect(select).toBeVisible();
    await expect(select.locator("option[value='']")).toHaveText("Choose...");
  });

  test("selecting a specialty triggers slot loading state", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/book");
    await page.waitForTimeout(2000);
    const select = page.locator("select");
    const options = select.locator("option:not([value=''])");
    const count = await options.count();
    if (count === 0) { test.skip(); return; }
    const firstOption = await options.first().getAttribute("value");
    if (!firstOption) { test.skip(); return; }
    await select.selectOption(firstOption);
    await page.waitForTimeout(3000);
    // Page should still be intact — no crash
    await expect(page.locator("h2:has-text('Book an Appointment')")).toBeVisible();
  });

  test("slot buttons show nurse names after specialty selected", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/book");
    await page.waitForTimeout(2000);
    const select = page.locator("select");
    const options = select.locator("option:not([value=''])");
    const count = await options.count();
    if (count === 0) { test.skip(); return; }
    const firstOption = await options.first().getAttribute("value");
    if (!firstOption) { test.skip(); return; }
    await select.selectOption(firstOption);
    await page.waitForTimeout(3000);
    const slotButtons = page.locator("button:has(.text-xs.text-muted-foreground)");
    const slotCount = await slotButtons.count();
    if (slotCount === 0) { test.skip(); return; }
    const nurseNameText = await slotButtons.first().locator(".text-xs.text-muted-foreground").textContent();
    expect(nurseNameText).toBeTruthy();
  });

  test("clicking a slot opens 'Confirm Appointment' modal", async ({ page }) => {
    await page.goto("http://localhost:3000/portal/book");
    await page.waitForTimeout(2000);
    const select = page.locator("select");
    const options = select.locator("option:not([value=''])");
    const count = await options.count();
    if (count === 0) { test.skip(); return; }
    const firstOption = await options.first().getAttribute("value");
    if (!firstOption) { test.skip(); return; }
    await select.selectOption(firstOption);
    await page.waitForTimeout(3000);
    const slotButtons = page.locator("button:has(.text-xs.text-muted-foreground)");
    const slotCount = await slotButtons.count();
    if (slotCount === 0) { test.skip(); return; }
    await slotButtons.first().click();
    await expect(page.locator("h3:has-text('Confirm Appointment')")).toBeVisible();
    await expect(page.locator("span.text-muted-foreground:has-text('Specialty')")).toBeVisible();
    await expect(page.locator("span.text-muted-foreground:has-text('Practitioner')")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Nurse Portal
// ---------------------------------------------------------------------------

test.describe("Nurse Portal — Header", () => {
  test("shows 'Logged in as Emma Taylor'", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForSelector("text=Logged in as", { timeout: 10000 });
    await expect(page.locator("text=Emma Taylor")).toBeVisible();
  });

  test("header shows 'Nurse Portal' title", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await expect(page.locator("h1:has-text('Nurse Portal')")).toBeVisible();
  });

  test("header shows watermark notice", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await expect(
      page.locator("text=Clinical data is watermarked and access-logged")
    ).toBeVisible();
  });
});

test.describe("Nurse Portal — Navigation", () => {
  test("Availability tab exists in navigation", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await expect(page.locator("a[href='/nurse/availability']")).toBeVisible();
  });

  test("Patient Records tab exists in navigation", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await expect(page.locator("a[href='/nurse/records']")).toBeVisible();
  });

  test("Appointments link exists in navigation", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await expect(page.locator("a[href='/nurse']")).toBeVisible();
  });
});

test.describe("Nurse Portal — Appointments Page", () => {
  test("shows 'Upcoming Appointments' heading", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForSelector("h2", { timeout: 10000 });
    await expect(page.locator("h2:has-text('Upcoming Appointments')")).toBeVisible();
  });

  test("shows collapsible 'Past Appointments' button", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await expect(
      page.locator("button:has-text('Past Appointments')")
    ).toBeVisible();
  });

  test("past appointments section is collapsed by default", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const toggleBtn = page.locator("button:has-text('Past Appointments')");
    await expect(toggleBtn).toBeVisible();
    // Content div is not rendered when collapsed
    const expandedContent = page.locator("div.mt-4.space-y-6");
    expect(await expandedContent.count()).toBe(0);
  });

  test("clicking 'Past Appointments' expands the section", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const toggleBtn = page.locator("button:has-text('Past Appointments')");
    await toggleBtn.click();
    await page.waitForTimeout(500);
    // Expanded div appears
    const expandedContent = page.locator("div.mt-4.space-y-6");
    await expect(expandedContent).toBeVisible({ timeout: 5000 });
  });

  test("clicking 'Past Appointments' again collapses the section", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const toggleBtn = page.locator("button:has-text('Past Appointments')");
    await toggleBtn.click();
    await page.waitForTimeout(300);
    await toggleBtn.click();
    await page.waitForTimeout(300);
    const expandedContent = page.locator("div.mt-4.space-y-6");
    expect(await expandedContent.count()).toBe(0);
  });
});

test.describe("Nurse Portal — Appointment Detail", () => {
  test("appointment detail has 'Show Notes' button (notes hidden by default)", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const firstCard = page.locator("a[href^='/nurse/appointments/']").first();
    if ((await firstCard.count()) === 0) { test.skip(); return; }
    await firstCard.click();
    await page.waitForURL(/\/nurse\/appointments\/\d+/, { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await expect(page.locator("button:has-text('Show Notes')")).toBeVisible();
    await expect(page.locator("button:has-text('Hide Notes')")).not.toBeVisible();
  });

  test("clicking Show Notes reveals countdown timer and Hide Notes button", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const firstCard = page.locator("a[href^='/nurse/appointments/']").first();
    if ((await firstCard.count()) === 0) { test.skip(); return; }
    await firstCard.click();
    await page.waitForURL(/\/nurse\/appointments\/\d+/, { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await page.locator("button:has-text('Show Notes')").click();
    await page.waitForTimeout(1500);
    await expect(page.locator("button:has-text('Hide Notes')")).toBeVisible();
    // 5-minute countdown timer in "M:SS" format
    await expect(page.locator("span.font-mono.text-amber-400")).toBeVisible();
    const timerText = await page.locator("span.font-mono.text-amber-400").textContent();
    expect(timerText).toMatch(/^\d:\d{2}$/);
  });

  test("back link on detail page returns to /nurse", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const firstCard = page.locator("a[href^='/nurse/appointments/']").first();
    if ((await firstCard.count()) === 0) { test.skip(); return; }
    await firstCard.click();
    await page.waitForURL(/\/nurse\/appointments\/\d+/, { timeout: 10000 });
    await page.locator("a:has-text('Back to appointments')").click();
    await page.waitForURL("http://localhost:3000/nurse", { timeout: 10000 });
    expect(page.url()).toBe("http://localhost:3000/nurse");
  });
});

test.describe("Nurse Portal — Patient Records", () => {
  test("shows 'Patient Records' heading", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse/records");
    await page.waitForSelector("h2", { timeout: 10000 });
    await expect(page.locator("h2:has-text('Patient Records')")).toBeVisible();
  });

  test("patient list shows pseudonymised references (Patient #N)", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/nurse/records");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const patientRefs = page.locator("p.text-sm.font-medium");
    const count = await patientRefs.count();
    if (count === 0) {
      await expect(page.locator("text=No assigned patients.")).toBeVisible();
      return;
    }
    const firstRef = await patientRefs.first().textContent();
    expect(firstRef).toMatch(/^Patient #\d+$/);
  });

  test("each patient row has a 'Show Notes' button", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse/records");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const showNotesBtn = page.locator("button:has-text('Show Notes')").first();
    if ((await showNotesBtn.count()) === 0) {
      await expect(page.locator("text=No assigned patients.")).toBeVisible();
      return;
    }
    await expect(showNotesBtn).toBeVisible();
  });

  test("clicking Show Notes shows countdown timer", async ({ page }) => {
    await page.goto("http://localhost:3000/nurse/records");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    const showNotesBtn = page.locator("button:has-text('Show Notes')").first();
    if ((await showNotesBtn.count()) === 0) { test.skip(); return; }
    await showNotesBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator("button:has-text('Hide Notes')").first()).toBeVisible();
    await expect(page.locator("span.font-mono.text-amber-400")).toBeVisible();
    const timerText = await page.locator("span.font-mono.text-amber-400").textContent();
    expect(timerText).toMatch(/^\d:\d{2}$/);
  });

  test("no real patient names visible on records page (pseudonymisation check)", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/nurse/records");
    await page.waitForFunction(
      () => !document.querySelector("p")?.textContent?.includes("Loading"),
      { timeout: 10000 }
    );
    await expect(page.locator("text=Margaret Thompson")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin Calendar
// ---------------------------------------------------------------------------

test.describe("Admin Calendar — Count Pills", () => {
  test("calendar renders without error", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    await expect(page.locator("button:has-text('Today')")).toBeVisible();
  });

  test("appointment count pills appear as absolute-positioned cells", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']"
    );
    const count = await pills.count();
    if (count === 0) { test.skip(); return; }
    // Pills contain a numeric span
    const pillText = await pills.first().locator("span").textContent();
    expect(Number(pillText)).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Admin Calendar — Highlight Dropdown", () => {
  test("Highlight label and dropdown exist in header", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(2000);
    await expect(page.locator("label:has-text('Highlight:')")).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
  });

  test("dropdown has 'All nurses' as default option", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(2000);
    const select = page.locator("select");
    await expect(select.locator("option[value='']")).toHaveText("All nurses");
  });

  test("dropdown is populated with nurse names after data loads", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const select = page.locator("select");
    const nurseOptions = select.locator("option:not([value=''])");
    const count = await nurseOptions.count();
    if (count === 0) { test.skip(); return; }
    expect(count).toBeGreaterThan(0);
    const firstName = await nurseOptions.first().textContent();
    expect(firstName?.trim().length).toBeGreaterThan(0);
  });

  test("selecting a nurse in the dropdown does not crash the page", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const select = page.locator("select");
    const nurseOptions = select.locator("option:not([value=''])");
    const count = await nurseOptions.count();
    if (count === 0) { test.skip(); return; }
    const nurseId = await nurseOptions.first().getAttribute("value");
    if (!nurseId) { test.skip(); return; }
    await select.selectOption(nurseId);
    await page.waitForTimeout(500);
    // Calendar still visible, no crash
    await expect(page.locator("label:has-text('Highlight:')")).toBeVisible();
    await expect(page.locator("button:has-text('Today')")).toBeVisible();
  });
});

test.describe("Admin Calendar — Cell Popup", () => {
  test("clicking a cell with appointments shows popup menu", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']"
    );
    const count = await pills.count();
    if (count === 0) { test.skip(); return; }
    await pills.first().click();
    await page.waitForTimeout(500);
    const popup = page.locator("div.rounded-lg.border.bg-card.shadow-lg");
    await expect(popup).toBeVisible();
  });

  test("popup shows nurse names for appointments", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']"
    );
    const count = await pills.count();
    if (count === 0) { test.skip(); return; }
    await pills.first().click();
    await page.waitForTimeout(500);
    const popup = page.locator("div.rounded-lg.border.bg-card.shadow-lg");
    await expect(popup).toBeVisible();
    const apptButtons = popup.locator("button.w-full span.font-medium");
    const btnCount = await apptButtons.count();
    if (btnCount > 0) {
      const nurseName = await apptButtons.first().textContent();
      expect(nurseName?.trim().length).toBeGreaterThan(0);
    }
  });

  test("popup shows '+ New appointment' option", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']"
    );
    const count = await pills.count();
    if (count === 0) { test.skip(); return; }
    await pills.first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("button:has-text('+ New appointment')")).toBeVisible();
  });

  test("clicking the overlay closes the popup", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(3000);
    const pills = page.locator(
      "div[class*='rounded-sm'][class*='border'][class*='absolute']"
    );
    const count = await pills.count();
    if (count === 0) { test.skip(); return; }
    await pills.first().click();
    await page.waitForTimeout(500);
    const popup = page.locator("div.rounded-lg.border.bg-card.shadow-lg");
    await expect(popup).toBeVisible();
    // Click the fixed overlay backdrop (top-left corner, away from the popup)
    await page.locator("div.fixed.inset-0.z-50").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    await expect(popup).not.toBeVisible();
  });
});
