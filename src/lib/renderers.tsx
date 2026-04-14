/**
 * Unified Rendering Module
 *
 * Three GoF design patterns eliminate frontend duplication:
 *
 * 1. Strategy Pattern — field-type rendering registry.
 *    Maps the same type strings as field-types.ts to render functions,
 *    but lives in lib/ (React-aware) not engine/ (framework-free).
 *    Parameterized by RenderMode ("detail" | "list").
 *
 * 2. Interpreter Pattern — entity summary rendering.
 *    The `display` block in schema.yaml is a mini-DSL. renderEntitySummary
 *    interprets it into an EntitySummary data structure. Adding a new entity
 *    means adding a display block in YAML — no TypeScript changes.
 *
 * 3. Facade Pattern — all schema access goes through @/lib/schema.
 *    This module imports types and functions from the Facade, not from
 *    @/engine/ directly, preserving the architectural boundary.
 */

import React from "react";
import { Linkify } from "@/components/linkify";
import type { FieldConfig, EntityConfig } from "@/lib/schema";

// ─── Types ────────────────────────────────────────────────────

/** Rendering context: "detail" for full detail views, "list" for search/property lists */
export type RenderMode = "detail" | "list";

/** Structured summary of an entity record — returned by the Interpreter */
export interface EntitySummary {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  summary?: React.ReactNode;
  actions?: Array<{ label: string; href: string }>;
}

// ─── Strategy Pattern: Field-Type Rendering Registry ──────────

/**
 * Semantic status/enum colors for badge rendering.
 * Maps common enum values to Tailwind color stems.
 * Unknown values get the default blue.
 */
const STATUS_COLORS: Record<string, string> = {
  // Positive outcomes
  active: "emerald",
  confirmed: "emerald",
  completed: "emerald",
  paid: "emerald",
  // Negative outcomes
  inactive: "gray",
  cancelled: "red",
  rejected: "red",
  no_show: "red",
  // Pending/in-progress
  pending: "amber",
  requested: "blue",
  claimed: "blue",
  discharged: "amber",
};

function badgeClasses(value: string): string {
  const color = STATUS_COLORS[value] ?? "blue";
  return `bg-${color}-500/15 text-${color}-400`;
}

/**
 * Render a single field value as a React node.
 *
 * Strategy pattern: dispatches by field.type, parameterized by mode.
 * - "detail" mode: en-AU dates, enum badges, handles time type
 * - "list" mode: default locale dates, plain text enums
 *
 * Replaces three independent implementations that previously lived in
 * entity-detail-panel, entity-search-panel, and patient-property-panel.
 */
export function renderFieldValue(
  value: unknown,
  field: FieldConfig,
  mode: RenderMode = "list"
): React.ReactNode {
  if (value === null || value === undefined) return "—";

  switch (field.type) {
    case "time":
      return String(value);

    case "date":
    case "datetime": {
      if (mode === "detail") {
        return new Date(value as string).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
      return new Date(value as string).toLocaleDateString();
    }

    case "enum": {
      const str = String(value).replace(/_/g, " ");
      if (mode === "detail") {
        return (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badgeClasses(String(value))}`}
          >
            {str}
          </span>
        );
      }
      return str;
    }

    case "number": {
      const num = Number(value);
      if (!isNaN(num)) return num.toLocaleString();
      return String(value);
    }

    case "boolean":
      return value ? "Yes" : "No";

    default:
      return <Linkify>{String(value)}</Linkify>;
  }
}

// ─── Record Display Name ──────────────────────────────────────

/**
 * Get the display name for a record.
 *
 * Checks (in order):
 * 1. Schema-declared title_field (from display config)
 * 2. A "name" field on the record
 * 3. The first declared field in the entity schema
 * 4. Fallback to "#id"
 *
 * Replaces four independent heuristics across entity-detail-panel,
 * entity-search-panel, patient-property-panel, and entity-form-panel.
 */
export function recordDisplayName(
  record: Record<string, unknown>,
  entityConfig?: EntityConfig
): string {
  // 1. Schema-declared title field
  if (entityConfig?.display?.title) {
    const titleSpec = entityConfig.display.title;
    // Template: interpolate and return
    if (titleSpec.includes("{")) {
      const result = interpolateTemplate(titleSpec, record);
      if (result.trim()) return result;
    } else {
      // Plain field name
      const val = record[titleSpec];
      if (val != null && val !== "") return String(val);
    }
  }

  // 2. Try 'name' field
  if (record.name != null && record.name !== "") return String(record.name);

  // 3. First declared field in schema
  if (entityConfig) {
    const firstField = Object.keys(entityConfig.fields)[0];
    if (firstField) {
      const val = record[firstField];
      if (val != null && val !== "") return String(val);
    }
  }

  // 4. Fallback
  return `#${record.id ?? "?"}`;
}

// ─── Form Helpers ─────────────────────────────────────────────

/** Convert a stored date value to YYYY-MM-DD for <input type="date"> */
export function formatDateForInput(val: unknown): string {
  if (!val) return "";
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

/** Convert a stored datetime value to YYYY-MM-DDTHH:MM for <input type="datetime-local"> */
export function formatDatetimeForInput(val: unknown): string {
  if (!val) return "";
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

// ─── Interpreter Pattern: Entity Summary Rendering ────────────

/**
 * Interpolate a template string with record field values.
 * e.g. "{ear} — {make} {model}" → "LEFT — Phonak Audeo"
 *
 * Follows the same convention as navigation.ts:interpolate().
 */
function interpolateTemplate(
  template: string,
  record: Record<string, unknown>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = record[key];
    if (val == null || val === "") return "";
    return String(val);
  });
}

/**
 * Resolve a display spec to a React node.
 *
 * - Plain field name (no "{") → render the field value
 * - Template string (contains "{") → interpolate and return as text
 * - Array of field names → join rendered values with " · "
 */
function resolveDisplay(
  spec: string | string[],
  record: Record<string, unknown>,
  entityConfig: EntityConfig,
  mode: RenderMode
): React.ReactNode {
  // Array: join multiple field values
  if (Array.isArray(spec)) {
    const parts = spec
      .map((fieldName) => {
        const field = entityConfig.fields[fieldName];
        const val = record[fieldName];
        if (val == null || val === "") return null;
        return field ? renderFieldValue(val, field, mode) : String(val);
      })
      .filter(Boolean);
    if (parts.length === 0) return null;
    return (
      <>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-muted-foreground"> · </span>}
            {part}
          </React.Fragment>
        ))}
      </>
    );
  }

  // Template string
  if (spec.includes("{")) {
    const result = interpolateTemplate(spec, record);
    return result.trim() || null;
  }

  // Plain field name
  const field = entityConfig.fields[spec];
  const val = record[spec];
  if (val == null || val === "") return null;
  return field ? renderFieldValue(val, field, mode) : String(val);
}

/**
 * Auto-derive a summary when no display block is configured.
 * Title = first field, subtitle = first string/email field, badge = first enum.
 */
function fallbackSummary(
  record: Record<string, unknown>,
  entityConfig: EntityConfig,
  mode: RenderMode
): EntitySummary {
  const fieldEntries = Object.entries(entityConfig.fields);
  const firstField = fieldEntries[0];
  const subtitleField = fieldEntries.find(
    ([name, f]) =>
      name !== firstField?.[0] &&
      ["string", "email", "phone"].includes(f.type)
  );
  const badgeField = fieldEntries.find(([, f]) => f.type === "enum");

  return {
    title: firstField
      ? renderFieldValue(record[firstField[0]], firstField[1], mode) ?? `#${record.id}`
      : `#${record.id}`,
    subtitle: subtitleField
      ? renderFieldValue(record[subtitleField[0]], subtitleField[1], mode)
      : undefined,
    badge: badgeField
      ? renderFieldValue(record[badgeField[0]], badgeField[1], "detail")
      : undefined,
  };
}

/**
 * Render a structured summary of an entity record.
 *
 * Interpreter pattern: reads the `display` DSL from schema.yaml and
 * produces an EntitySummary. Components destructure this and apply
 * their own layout — the rendering logic is shared, the layout is per-component.
 *
 * Replaces renderInlineItem (entity-detail-panel) and PropertyRow
 * (patient-property-panel) — two 120+ line switch statements.
 */
export function renderEntitySummary(
  entityName: string,
  record: Record<string, unknown>,
  entityConfig: EntityConfig,
  mode: RenderMode = "list"
): EntitySummary {
  const display = entityConfig.display;

  // No display config → auto-derive
  if (!display) return fallbackSummary(record, entityConfig, mode);

  // Interpret the DSL
  const title = display.title
    ? resolveDisplay(display.title, record, entityConfig, mode)
    : `#${record.id}`;

  const subtitle = display.subtitle
    ? resolveDisplay(display.subtitle, record, entityConfig, mode)
    : undefined;

  const badge = display.badge
    ? renderFieldValue(
        record[display.badge],
        entityConfig.fields[display.badge],
        "detail" // badges are always rendered in detail mode (with color)
      )
    : undefined;

  const summary = display.summary
    ? truncate(
        String(record[display.summary] ?? ""),
        display.summary_max ?? 80
      )
    : undefined;

  // Actions: interpreted from display.actions DSL, with {field} interpolation
  const actions = display.actions?.length
    ? display.actions.map((a) => ({
        label: a.label,
        href: interpolateTemplate(a.href, record),
      }))
    : undefined;

  return { title, subtitle, badge, summary, actions };
}

/** Truncate text to maxLen characters with ellipsis */
function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
