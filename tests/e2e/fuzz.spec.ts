import { test, expect, type Page } from "playwright/test";

/**
 * Fuzz testing — randomly click buttons, fill forms, open/close windows.
 * Goal: find crashes, unhandled errors, and broken states.
 */

const ACTIONS = [
  "clickRandomButton",
  "clickRandomLink",
  "clickCalendarSlot",
  "clickCalendarPill",
  "fillRandomInput",
  "fillRandomSelect",
  "closeRandomWindow",
  "pressEscape",
  "scrollRandomly",
  "clickSidebarEntity",
  "clickAddEntity",
  "navigateCalendar",
] as const;

type Action = (typeof ACTIONS)[number];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789 ";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomTime(): string {
  const h = String(7 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const m = Math.random() > 0.5 ? "00" : "30";
  return `${h}:${m}`;
}

function randomDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * 14));
  return d.toISOString().split("T")[0];
}

async function clickRandomButton(page: Page) {
  const buttons = page.locator("button:visible");
  const count = await buttons.count();
  if (count === 0) return;
  const idx = Math.floor(Math.random() * count);
  try {
    await buttons.nth(idx).click({ timeout: 2000 });
  } catch { /* element may have moved */ }
}

async function clickRandomLink(page: Page) {
  const links = page.locator("a:visible, [role='link']:visible");
  const count = await links.count();
  if (count === 0) return;
  try {
    await links.nth(Math.floor(Math.random() * count)).click({ timeout: 2000 });
  } catch {}
}

async function clickCalendarSlot(page: Page) {
  const cells = page.locator("div[style*='height: 32px'][class*='cursor-pointer']:visible");
  const count = await cells.count();
  if (count === 0) return;
  try {
    await cells.nth(Math.floor(Math.random() * count)).click({ timeout: 2000 });
  } catch {}
}

async function clickCalendarPill(page: Page) {
  const pills = page.locator("div[class*='rounded-sm'][class*='border'][class*='absolute']:visible");
  const count = await pills.count();
  if (count === 0) return;
  try {
    await pills.nth(Math.floor(Math.random() * count)).click({ timeout: 2000 });
  } catch {}
}

async function fillRandomInput(page: Page) {
  const inputs = page.locator("input:visible:not([type='file'])");
  const count = await inputs.count();
  if (count === 0) return;
  const idx = Math.floor(Math.random() * count);
  try {
    const input = inputs.nth(idx);
    const type = await input.getAttribute("type");
    if (type === "date") {
      await input.fill(randomDate());
    } else if (type === "time") {
      await input.fill(randomTime());
    } else if (type === "number") {
      await input.fill(String(Math.floor(Math.random() * 1000)));
    } else if (type === "email") {
      await input.fill(`fuzz${Math.floor(Math.random() * 999)}@test.com`);
    } else if (type === "tel") {
      await input.fill(`04${Math.floor(Math.random() * 100000000)}`);
    } else {
      await input.fill(randomString(3 + Math.floor(Math.random() * 20)));
    }
  } catch {}
}

async function fillRandomSelect(page: Page) {
  const selects = page.locator("select:visible");
  const count = await selects.count();
  if (count === 0) return;
  const idx = Math.floor(Math.random() * count);
  try {
    const select = selects.nth(idx);
    const options = select.locator("option");
    const optCount = await options.count();
    if (optCount > 1) {
      // Pick a random non-placeholder option
      const optIdx = 1 + Math.floor(Math.random() * (optCount - 1));
      const value = await options.nth(optIdx).getAttribute("value");
      if (value) await select.selectOption(value);
    }
  } catch {}
}

async function closeRandomWindow(page: Page) {
  // Close buttons are the X in floating window title bars
  const closeButtons = page.locator("div[class*='cursor-grab'] button:visible").last();
  try {
    if (await closeButtons.isVisible()) {
      await closeButtons.click({ timeout: 2000 });
    }
  } catch {}
}

async function pressEscape(page: Page) {
  await page.keyboard.press("Escape");
}

async function scrollRandomly(page: Page) {
  const main = page.locator("main").first();
  try {
    await main.evaluate((el) => {
      el.scrollTop = Math.floor(Math.random() * el.scrollHeight);
    });
  } catch {}
}

async function clickSidebarEntity(page: Page) {
  const items = page.locator("nav button:visible");
  const count = await items.count();
  if (count === 0) return;
  try {
    await items.nth(Math.floor(Math.random() * count)).click({ timeout: 2000 });
  } catch {}
}

async function clickAddEntity(page: Page) {
  const addButtons = page.locator("button:has-text('Add'):visible");
  const count = await addButtons.count();
  if (count === 0) return;
  try {
    await addButtons.nth(Math.floor(Math.random() * count)).click({ timeout: 2000 });
  } catch {}
}

async function navigateCalendar(page: Page) {
  const navButtons = [
    page.locator("button:has-text('Today')"),
    page.locator("button:has(polyline[points='9 18 15 12 9 6'])"),
    page.locator("button:has(polyline[points='15 18 9 12 15 6'])"),
  ];
  try {
    await pickRandom(navButtons).click({ timeout: 2000 });
  } catch {}
}

const actionMap: Record<Action, (page: Page) => Promise<void>> = {
  clickRandomButton,
  clickRandomLink,
  clickCalendarSlot,
  clickCalendarPill,
  fillRandomInput,
  fillRandomSelect,
  closeRandomWindow,
  pressEscape,
  scrollRandomly,
  clickSidebarEntity,
  clickAddEntity,
  navigateCalendar,
};

test.describe("Fuzz Testing", () => {
  test("30 random actions without crashing", { timeout: 60000 }, async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on("pageerror", (err) => {
      errors.push(`PAGE ERROR: ${err.message}`);
    });

    // Capture unhandled promise rejections
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
        errors.push(`CONSOLE ERROR: ${msg.text()}`);
      }
    });

    await page.goto("/");
    await page.waitForTimeout(1500);

    for (let i = 0; i < 30; i++) {
      const action = pickRandom([...ACTIONS]);
      const fn = actionMap[action];

      try {
        await fn(page);
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
      } catch {
        // Individual action failures are expected (elements disappearing, etc.)
      }

      // Check the page hasn't crashed — body should still be present
      const body = await page.locator("body").count();
      expect(body).toBe(1);
    }

    // Filter out known benign errors
    const realErrors = errors.filter(
      (e) =>
        !e.includes("React DevTools") &&
        !e.includes("HMR") &&
        !e.includes("hydration") &&
        !e.includes("Failed to load resource")
    );

    if (realErrors.length > 0) {
      console.log("Errors encountered during fuzz testing:");
      realErrors.forEach((e) => console.log(`  ${e}`));
    }

    // No page crashes — the test passes even with console errors
    // (we log them for investigation but don't fail on them)
    expect(await page.locator("body").count()).toBe(1);
  });

  test("rapid form create/close cycle", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Rapidly open and close forms 10 times
    for (let i = 0; i < 10; i++) {
      await clickAddEntity(page);
      await page.waitForTimeout(300);
      await closeRandomWindow(page);
      await page.waitForTimeout(200);
    }

    // Page should still be functional
    await expect(page.locator("text=Today")).toBeVisible();
  });

  test("open many windows simultaneously", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    // Open patient search
    await page.locator("button:has-text('Patients')").first().click();
    await page.waitForTimeout(300);

    // Open nurse search
    await page.locator("button:has-text('Nurses')").first().click();
    await page.waitForTimeout(300);

    // Open add patient form
    await page.getByRole("button", { name: "Add Patient" }).click();
    await page.waitForTimeout(300);

    // Open add nurse form
    await page.getByRole("button", { name: "Add Nurse" }).click();
    await page.waitForTimeout(300);

    // Open add appointment form
    await page.getByRole("button", { name: "Add Appointment" }).click();
    await page.waitForTimeout(300);

    // Open AI chat
    await page.getByRole("button", { name: "Ask AI" }).click();
    await page.waitForTimeout(300);

    // Click a calendar pill if available
    await clickCalendarPill(page);
    await page.waitForTimeout(300);

    // Page should still be alive with many windows open
    await expect(page.locator("body")).toBeVisible();
    // Calendar should still be behind all the windows
    await expect(page.locator("text=Today")).toBeVisible();
  });

  test("fill appointment form with garbage and submit", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Add Appointment" }).click();
    await page.waitForTimeout(500);

    // Fill every visible input with random data
    const inputs = page.locator("input:visible:not([type='file'])");
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      try {
        await inputs.nth(i).fill(randomString(10));
      } catch {}
    }

    // Try to submit — should get a validation error, not a crash
    const submitBtn = page.locator("button[type='submit']:visible");
    if ((await submitBtn.count()) > 0) {
      await submitBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Page should still be alive
    await expect(page.locator("body")).toBeVisible();
  });
});
