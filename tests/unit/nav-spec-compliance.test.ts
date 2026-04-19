/**
 * Navigation Spec Compliance
 *
 * Validates that the frontend layout files match navigation.yaml.
 * Prevents silent regressions where a refactor drops nav items,
 * visible fields, or features that the spec requires.
 *
 * This test reads the actual source files and checks them against
 * navigation.yaml — it's a static analysis guard, not a runtime test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { load } from "js-yaml";

const ROOT = resolve(__dirname, "../..");

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

// Parse navigation.yaml once
const navYaml = load(readFileSync(resolve(ROOT, "navigation.yaml"), "utf-8")) as Record<string, unknown>;

// ── Nurse Portal ──────────────────────────────────────────────────

describe("nurse portal nav compliance", () => {
  const nurseSpec = navYaml.nurse as Record<string, unknown>;
  const tabs = (nurseSpec.layout as Record<string, unknown>).tabs as Array<{ label: string; path: string }>;
  const nurseLayout = readSrc("src/app/nurse/layout.tsx");

  it("layout has all tabs from navigation.yaml", () => {
    for (const tab of tabs) {
      expect(nurseLayout, `Missing tab: ${tab.label} (${tab.path})`).toContain(tab.path);
      expect(nurseLayout, `Missing label: ${tab.label}`).toContain(tab.label);
    }
  });

  it("layout fetches nurse identity from /api/nurse/me", () => {
    expect(nurseLayout).toContain("/api/nurse/me");
  });

  it("layout shows compliance notice with full text", () => {
    expect(nurseLayout).toContain("watermarked and access-logged");
  });

  it("all tab pages exist as page.tsx files", () => {
    for (const tab of tabs) {
      const pagePath = `src/app${tab.path}/page.tsx`;
      expect(() => readSrc(pagePath), `Missing page file: ${pagePath}`).not.toThrow();
    }
  });
});

// ── Patient Portal ────────────────────────────────────────────────

describe("patient portal nav compliance", () => {
  const portalSpec = navYaml.portal as Record<string, unknown>;
  const tabs = (portalSpec.layout as Record<string, unknown>).tabs as Array<{ label: string; path: string }>;
  const portalLayout = readSrc("src/app/portal/layout.tsx");

  it("layout has all tabs from navigation.yaml", () => {
    for (const tab of tabs) {
      expect(portalLayout, `Missing tab: ${tab.label} (${tab.path})`).toContain(tab.path);
      expect(portalLayout, `Missing label: ${tab.label}`).toContain(tab.label);
    }
  });

  it("layout fetches patient identity", () => {
    expect(portalLayout).toContain("/api/portal/profile");
  });

  it("all tab pages exist as page.tsx files", () => {
    for (const tab of tabs) {
      // /portal is the root page, maps to src/app/portal/page.tsx
      const pagePath = tab.path === "/portal"
        ? "src/app/portal/page.tsx"
        : `src/app${tab.path}/page.tsx`;
      expect(() => readSrc(pagePath), `Missing page file: ${pagePath}`).not.toThrow();
    }
  });
});

// ── Patient Portal Visible Fields ─────────────────────────────────

describe("patient portal visible fields", () => {
  const portalSpec = navYaml.portal as Record<string, unknown>;
  const pages = portalSpec.pages as Record<string, Record<string, unknown>>;

  it("appointment detail includes nurse_name in visible fields", () => {
    const apptDetail = pages.appointment_detail;
    const visibleFields = apptDetail.visible_fields as string[];
    expect(visibleFields).toContain("nurse_name");
  });

  it("appointment detail page renders nurseName", () => {
    const detailPage = readSrc("src/app/portal/appointments/[id]/page.tsx");
    expect(detailPage).toContain("nurseName");
  });

  it("profile page includes medicare_number", () => {
    const profilePage = readSrc("src/app/portal/profile/page.tsx");
    expect(profilePage).toContain("medicare_number");
  });

  it("profile visible_fields match spec", () => {
    const profileSpec = pages.profile;
    const visibleFields = profileSpec.visible_fields as string[];
    const profilePage = readSrc("src/app/portal/profile/page.tsx");
    for (const field of visibleFields) {
      expect(profilePage, `Missing visible field: ${field}`).toContain(field);
    }
  });
});

// ── Nurse Portal Features ─────────────────────────────────────────

describe("nurse portal features", () => {
  it("appointment detail page fetches hearing aids", () => {
    const apptPage = readSrc("src/app/nurse/appointments/[id]/page.tsx");
    expect(apptPage).toContain("/hearing-aids");
  });

  it("records page fetches hearing aids per patient", () => {
    const recordsPage = readSrc("src/app/nurse/records/page.tsx");
    expect(recordsPage).toContain("/hearing-aids");
  });

  it("hearing aids API route exists for nurse appointments", () => {
    expect(() => readSrc("src/app/api/nurse/appointments/[id]/hearing-aids/route.ts")).not.toThrow();
  });

  it("hearing aids API route exists for nurse records", () => {
    expect(() => readSrc("src/app/api/nurse/records/[id]/hearing-aids/route.ts")).not.toThrow();
  });
});

// ── Patient Portal Features ───────────────────────────────────────

describe("patient portal features", () => {
  it("hearing aids page has privacy banner", () => {
    const page = readSrc("src/app/portal/hearing-aids/page.tsx");
    expect(page).toContain("private health information");
  });
});

// ── Admin CRM Windows ─────────────────────────────────────────────

describe("admin CRM window types", () => {
  const dashShell = readSrc("src/components/dashboard-shell.tsx");

  it("slot end time uses 45-minute duration", () => {
    expect(dashShell).toMatch(/\+ 45/);
    expect(dashShell).not.toMatch(/\+ 30/);
  });

  it("new appointment form uses static window ID", () => {
    expect(dashShell).toContain('"form-appointment-new"');
    expect(dashShell).not.toContain("`form-appointment-new-${");
  });
});
