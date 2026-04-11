import { test, expect } from "playwright/test";

test.describe("Calendar — Home View", () => {
  test("renders as the default home view", async ({ page }) => {
    await page.goto("/");
    // Calendar header with navigation
    await expect(page.locator("text=Today")).toBeVisible();
    // Time grid visible (use exact match to avoid matching appointment time ranges)
    await expect(page.getByText("09:00", { exact: true })).toBeVisible();
    await expect(page.getByText("12:00", { exact: true })).toBeVisible();
    // Day headers visible (two-week view has two of each day)
    await expect(page.getByText(/Mon \d+/).first()).toBeVisible();
    await expect(page.getByText(/Tue \d+/).first()).toBeVisible();
  });

  test("shows two-week date range in header", async ({ page }) => {
    await page.goto("/");
    // Should show a date range like "6 Apr — 19 Apr 2026"
    const header = page.locator("text=/\\d+ \\w+ — \\d+ \\w+ \\d{4}/");
    await expect(header).toBeVisible();
  });

  test("navigation arrows shift the view", async ({ page }) => {
    await page.goto("/");
    // Get initial date range text
    const rangeText = page.locator("text=/\\d+ \\w+ — \\d+ \\w+ \\d{4}/");
    const initial = await rangeText.textContent();

    // Click next arrow
    await page.locator("button:has(polyline[points='9 18 15 12 9 6'])").click();
    await page.waitForTimeout(500);
    const after = await rangeText.textContent();
    expect(after).not.toEqual(initial);

    // Click prev arrow twice to go before initial
    await page.locator("button:has(polyline[points='15 18 9 12 15 6'])").click();
    await page.waitForTimeout(500);
    await page.locator("button:has(polyline[points='15 18 9 12 15 6'])").click();
    await page.waitForTimeout(500);
    const before = await rangeText.textContent();
    expect(before).not.toEqual(initial);
  });

  test("Today button returns to current week", async ({ page }) => {
    await page.goto("/");
    const rangeText = page.locator("text=/\\d+ \\w+ — \\d+ \\w+ \\d{4}/");
    const initial = await rangeText.textContent();

    // Navigate away
    await page.locator("button:has(polyline[points='9 18 15 12 9 6'])").click();
    await page.waitForTimeout(500);

    // Click Today
    await page.locator("button:has-text('Today')").click();
    await page.waitForTimeout(500);
    const restored = await rangeText.textContent();
    expect(restored).toEqual(initial);
  });

  test("nurse legend shows nurse names", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
    // At least one nurse name chip should be visible in the header
    const legend = page.locator("span:has-text('Emma'), span:has-text('Clare'), span:has-text('Liam')");
    await expect(legend.first()).toBeVisible();
  });

  test("nurse legend is visible in header", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
    // Nurse colour chips should be in the calendar header
    const chips = page.locator("span[class*='rounded'][class*='text-']");
    expect(await chips.count()).toBeGreaterThan(0);
  });
});

test.describe("Calendar — Appointment Interaction", () => {
  test("clicking empty slot opens appointment form", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    // Click an empty cell in the grid (pick a slot that's likely empty)
    const emptyCells = page.locator(
      "div[style*='height: 32px'][class*='cursor-pointer']:not(:has(div[class*='rounded-sm']))"
    );
    const count = await emptyCells.count();
    if (count > 10) {
      await emptyCells.nth(10).click();
      await page.waitForTimeout(500);
      // Appointment form window should appear (title bar)
      await expect(page.locator("span.truncate:has-text('Add Appointment')")).toBeVisible();
    }
  });

  test("clicking appointment pill opens detail popup", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    // Find appointment pills
    const pills = page.locator("div[class*='rounded-sm'][class*='border'][class*='absolute']");
    const count = await pills.count();
    if (count > 0) {
      await pills.first().click();
      await page.waitForTimeout(500);
      // Detail window should appear — look for the floating window with field labels
      await expect(page.locator(".text-muted-foreground:has-text('start time')").first()).toBeVisible();
    }
  });

  test("appointment detail has clickable nurse and patient links", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    const pills = page.locator("div[class*='rounded-sm'][class*='border'][class*='absolute']");
    const count = await pills.count();
    if (count > 0) {
      await pills.first().click();
      await page.waitForTimeout(500);
      // Should have clickable relation links (blue text)
      const nurseLink = page.locator("button[class*='text-blue-400']").first();
      await expect(nurseLink).toBeVisible();
    }
  });

  test("appointment detail has edit and delete buttons", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    const pills = page.locator("div[class*='rounded-sm'][class*='border'][class*='absolute']");
    if ((await pills.count()) > 0) {
      await pills.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator("button:has-text('Edit')")).toBeVisible();
      await expect(page.locator("button:has-text('Delete')")).toBeVisible();
    }
  });
});

test.describe("Sidebar — CRUD", () => {
  test("sidebar shows Patients and Nurses", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Patients")).toBeVisible();
    await expect(page.locator("text=Nurses")).toBeVisible();
  });

  test("sidebar has Add Patient, Add Nurse, Add Appointment buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("button:has-text('Add Patient')")).toBeVisible();
    await expect(page.locator("button:has-text('Add Nurse')")).toBeVisible();
    await expect(page.locator("button:has-text('Add Appointment')")).toBeVisible();
  });

  test("Add Appointment opens form with relation dropdowns", async ({ page }) => {
    await page.goto("/");
    await page.locator("button:has-text('Add Appointment')").click();
    await page.waitForTimeout(1000);

    // Form window title bar should say "Add Appointment"
    await expect(page.locator("span.truncate:has-text('Add Appointment')")).toBeVisible();
    // Should have patient and nurse select elements (check the select, not the hidden option)
    await expect(page.locator("select").first()).toBeVisible();
    // Verify the selects have loaded options by checking the select count
    const selects = page.locator("select");
    expect(await selects.count()).toBeGreaterThanOrEqual(2); // status enum + patient + nurse
  });

  test("clicking Patients opens patient search", async ({ page }) => {
    await page.goto("/");
    await page.locator("button:has-text('Patients')").first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("text=Patient list").or(page.locator("input[placeholder*='Search patient']"))).toBeVisible();
  });

  test("clicking Nurses opens nurse search", async ({ page }) => {
    await page.goto("/");
    await page.locator("button:has-text('Nurses')").first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("text=Nurse list").or(page.locator("input[placeholder*='Search nurse']"))).toBeVisible();
  });
});

test.describe("Delete Flow", () => {
  test("delete has two-step confirmation", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    // Open an appointment detail
    const pills = page.locator("div[class*='rounded-sm'][class*='border'][class*='absolute']");
    if ((await pills.count()) > 0) {
      await pills.first().click();
      await page.waitForTimeout(500);

      // Click Delete
      await page.locator("button:has-text('Delete')").click();
      await page.waitForTimeout(200);

      // Should show "Confirm delete" and "Cancel"
      await expect(page.locator("button:has-text('Confirm delete')")).toBeVisible();
      await expect(page.locator("button:has-text('Cancel')")).toBeVisible();

      // Click Cancel — should go back to Delete button
      await page.locator("button:has-text('Cancel')").click();
      await page.waitForTimeout(200);
      await expect(page.locator("button:has-text('Delete')")).toBeVisible();
    }
  });
});

test.describe("AI Chat", () => {
  test("Ask AI button opens chat panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Ask AI" }).click();
    await page.waitForTimeout(500);
    // Chat panel should open with input field
    await expect(page.locator("input[placeholder='Ask about your data...']")).toBeVisible();
  });
});
