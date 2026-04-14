import { describe, it, expect } from "vitest";
import {
  transition,
  windowTitle,
  type NavigationConfig,
  type WindowState,
} from "@/lib/navigation";
import type { SchemaConfig } from "@/lib/schema";

/**
 * Minimal schema for label resolution in tests.
 * Only entities with non-obvious labels need explicit label/label_singular.
 * Entities like "patient" auto-generate correctly ("Patients" / "Patient").
 */
const SCHEMA = {
  entities: {
    patient: { fields: {} },
    appointment: { fields: {} },
    clinical_note: { label: "Clinical Notes", label_singular: "Clinical Note", fields: {} },
    nurse_specialty: { label: "Specialties", label_singular: "Specialty", fields: {} },
    hearing_aid: { label: "Hearing Aids", label_singular: "Hearing Aid", fields: {} },
  },
} as SchemaConfig;

/**
 * Minimal navigation config for testing.
 * Mirrors the shape of navigation.yaml but with only what we need.
 */
const NAV: NavigationConfig = {
  windows: {
    calendar: {
      role: "calendar" as const,
      titleTemplate: "Calendar",
      component: "CalendarPanel",
      features: ["two_week_view"],
    },
    search: {
      role: "search" as const,
      titleTemplate: "{entity} list",
      component: "EntitySearchPanel",
    },
    detail: {
      role: "detail" as const,
      titleTemplate: "{name}",
      component: "EntityDetailPanel",
    },
    property: {
      role: "property" as const,
      titleTemplate: "{label}",
      component: "PropertyPanel",
    },
    form: {
      role: "form" as const,
      titleTemplate: "{mode} {entitySingular}",
      component: "EntityFormPanel",
    },
    ai: {
      role: "ai" as const,
      titleTemplate: "Ask AI",
      component: "AiChatPanel",
    },
  },
  transitions: [
    { from: "app", to: "calendar", on: "load", idTemplate: "calendar" },
    {
      from: "calendar",
      to: "detail",
      on: "click event",
      idTemplate: "detail-appointment-{id}",
    },
    {
      from: "calendar",
      to: "form",
      on: "click empty slot",
      idTemplate: "form-appointment-new",
    },
    {
      from: "sidebar",
      to: "search",
      on: "click entity",
      idTemplate: "search-{entity}",
    },
    {
      from: "sidebar",
      to: "form",
      on: "click add",
      idTemplate: "form-{entity}-new",
    },
    {
      from: "sidebar",
      to: "ai",
      on: "click ai",
      idTemplate: "ai-chat",
    },
    {
      from: "search",
      to: "detail",
      on: "select item",
      idTemplate: "detail-{entity}-{id}",
    },
    {
      from: "detail",
      to: "property",
      on: "click property",
      idTemplate: "property-{entity}-{id}-{propertyEntity}",
    },
    {
      from: "detail",
      to: "form",
      on: "click edit",
      idTemplate: "form-{entity}-{id}",
    },
  ],
};

// ── transition() ──────────────────────────────────────────────────

describe("transition()", () => {
  it("builds a calendar window on app load", () => {
    const win = transition(NAV, { from: "app", to: "calendar" }, {}, SCHEMA);
    expect(win.id).toBe("calendar");
    expect(win.type).toBe("calendar");
  });

  it("builds a detail window from calendar click", () => {
    const win = transition(NAV, { from: "calendar", to: "detail" }, {
      entity: "appointment",
      id: 42,
      displayName: "Ada Lovelace — Audiology",
    }, SCHEMA);
    expect(win.id).toBe("detail-appointment-42");
    expect(win.type).toBe("detail");
    expect(win.entityName).toBe("appointment");
    expect(win.entityId).toBe(42);
    expect(win.displayName).toBe("Ada Lovelace — Audiology");
  });

  it("builds a search window from sidebar", () => {
    const win = transition(NAV, { from: "sidebar", to: "search" }, { entity: "patient" }, SCHEMA);
    expect(win.id).toBe("search-Patients");
    expect(win.type).toBe("search");
    expect(win.entityName).toBe("patient");
  });

  it("builds an add form from sidebar (no id = Add mode)", () => {
    const win = transition(NAV, { from: "sidebar", to: "form" }, { entity: "patient" }, SCHEMA);
    expect(win.id).toBe("form-Patients-new");
    expect(win.type).toBe("form");
    expect(win.entityId).toBeUndefined();
  });

  it("builds an edit form from detail (has id = Edit mode)", () => {
    const win = transition(NAV, { from: "detail", to: "form" }, {
      entity: "patient",
      id: 7,
    }, SCHEMA);
    expect(win.id).toBe("form-Patients-7");
    expect(win.type).toBe("form");
    expect(win.entityId).toBe(7);
  });

  it("builds a property window from detail", () => {
    const win = transition(NAV, { from: "detail", to: "property" }, {
      entity: "patient",
      id: 7,
      propertyEntity: "hearing_aid",
      label: "Hearing Aids",
    }, SCHEMA);
    expect(win.id).toBe("property-Patients-7-hearing_aid");
    expect(win.type).toBe("property");
    expect(win.propertyEntity).toBe("hearing_aid");
  });

  it("builds an AI chat window from sidebar", () => {
    const win = transition(NAV, { from: "sidebar", to: "ai" }, {}, SCHEMA);
    expect(win.id).toBe("ai-chat");
    expect(win.type).toBe("ai");
  });

  it("throws on unknown transition", () => {
    expect(() => transition(NAV, { from: "foo", to: "bar" }, {}, SCHEMA)).toThrow(
      "Unknown transition: foo → bar"
    );
  });
});

// ── windowTitle() ─────────────────────────────────────────────────

describe("windowTitle()", () => {
  it("returns static title for calendar", () => {
    const win: WindowState = {
      id: "calendar",
      type: "calendar",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Calendar");
  });

  it("returns entity name for search windows", () => {
    const win: WindowState = {
      id: "search-patient",
      type: "search",
      entityName: "patient",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Patients list");
  });

  it("returns record name for detail windows", () => {
    const win: WindowState = {
      id: "detail-patient-7",
      type: "detail",
      entityName: "patient",
      entityId: 7,
      displayName: "Ada Lovelace",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Ada Lovelace");
  });

  it("returns 'Add <Entity>' for new forms", () => {
    const win: WindowState = {
      id: "form-patient-new",
      type: "form",
      entityName: "patient",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Add Patient");
  });

  it("returns 'Edit <Entity>' for edit forms", () => {
    const win: WindowState = {
      id: "form-patient-7",
      type: "form",
      entityName: "patient",
      entityId: 7,
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Edit Patient");
  });

  it("returns label for property windows", () => {
    const win: WindowState = {
      id: "property-patient-7-hearing_aid",
      type: "property",
      entityName: "patient",
      entityId: 7,
      label: "Hearing Aids",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Hearing Aids");
  });

  it("returns static title for AI chat", () => {
    const win: WindowState = {
      id: "ai-chat",
      type: "ai",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Ask AI");
  });

  it("falls back to type name for unknown window type", () => {
    const win: WindowState = {
      id: "unknown-1",
      type: "nonexistent",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("nonexistent");
  });

  it("formats snake_case entity names with custom labels", () => {
    const win: WindowState = {
      id: "search-clinical_note",
      type: "search",
      entityName: "clinical_note",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Clinical Notes list");
  });

  it("formats nurse_specialty with custom label", () => {
    const win: WindowState = {
      id: "search-nurse_specialty",
      type: "search",
      entityName: "nurse_specialty",
      zIndex: 0,
    };
    expect(windowTitle(NAV, win, SCHEMA)).toBe("Specialties list");
  });
});
