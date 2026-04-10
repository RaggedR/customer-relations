/**
 * Navigation Model — Runtime
 *
 * Loads navigation.yaml and exposes:
 *   - windowDefs: window type → { role, titleTemplate }
 *   - transitionDefs: array of { from, to, on, idTemplate }
 *   - transition(): builds a WindowState from a transition + context
 *   - windowTitle(): resolves a title template against a WindowState
 *
 * The YAML is loaded server-side and served via /api/navigation.
 * The client fetches it once on startup alongside the schema.
 */

import type { WindowRole } from "@/lib/layout";

// --- Types ---

export interface WindowDef {
  role: WindowRole;
  titleTemplate: string;
  component: string;
  features?: string[];
}

export interface TransitionDef {
  from: string;
  to: string;
  on: string;
  idTemplate: string;
}

export interface NavigationConfig {
  windows: Record<string, WindowDef>;
  transitions: TransitionDef[];
}

export interface WindowState {
  id: string;
  type: string;
  entityName?: string;
  entityId?: number;
  entityLabel?: string;
  propertyEntity?: string;
  parentKey?: string;
  label?: string;
  zIndex: number;
}

// --- Template interpolation ---

interface TransitionContext {
  entity?: string;
  id?: number;
  name?: string;
  label?: string;
  propertyEntity?: string;
  parentKey?: string;
  mode?: string;
}

/** Resolve "{entity}", "{id}", "{name}", "{label}", "{mode}" in a template */
function interpolate(template: string, ctx: TransitionContext): string {
  return template
    .replace(/\{entity\}/g, formatLabel(ctx.entity ?? ""))
    .replace(/\{id\}/g, String(ctx.id ?? ""))
    .replace(/\{name\}/g, ctx.name ?? "")
    .replace(/\{label\}/g, ctx.label ?? "")
    .replace(/\{propertyEntity\}/g, ctx.propertyEntity ?? "")
    .replace(/\{mode\}/g, ctx.mode ?? "Add");
}

function formatLabel(name: string): string {
  const map: Record<string, string> = {
    clinical_note: "Clinical Notes",
    personal_note: "Personal Notes",
    hearing_aid: "Hearing Aids",
    claim_item: "Claim Items",
    nurse_specialty: "Specialties",
  };
  if (map[name]) return map[name];
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1) + "s";
}

function formatSingular(name: string): string {
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// --- Public API ---

/** Build a WindowState for a transition */
export function transition(
  nav: NavigationConfig,
  transitionName: string,
  ctx: TransitionContext
): Omit<WindowState, "zIndex"> {
  const def = nav.transitions.find((t) => `${t.from}→${t.to}` === transitionName);
  if (!def) {
    throw new Error(`Unknown transition: ${transitionName}`);
  }

  // Build the mode for form titles
  const mode = ctx.id ? "Edit" : "Add";
  const fullCtx = { ...ctx, mode };

  return {
    id: interpolate(def.idTemplate, fullCtx),
    type: def.to,
    entityName: ctx.entity,
    entityId: ctx.id,
    entityLabel: ctx.name,
    propertyEntity: ctx.propertyEntity,
    parentKey: ctx.parentKey,
    label: ctx.label,
  };
}

/** Resolve the title for a window */
export function windowTitle(
  nav: NavigationConfig,
  win: WindowState
): string {
  const def = nav.windows[win.type];
  if (!def) return win.type;

  const ctx: TransitionContext = {
    entity: win.entityName,
    id: win.entityId,
    name: win.entityLabel,
    label: win.label,
    propertyEntity: win.propertyEntity,
    mode: win.entityId ? "Edit" : "Add",
  };

  // Special case: for entity lists, pluralize; for singular, use the label
  let title = interpolate(def.titleTemplate, ctx);

  // Replace raw entity name with formatted version for form titles
  if (win.type === "form" && win.entityName) {
    title = `${win.entityId ? "Edit" : "Add"} ${formatSingular(win.entityName)}`;
  }

  return title;
}

// YAML loader is in navigation-loader.ts (server-side only)
