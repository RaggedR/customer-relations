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
import { entityLabel, entityLabelSingular, type SchemaConfig } from "@/lib/schema-client";

// --- Types ---

export interface WindowDef {
  role: WindowRole;
  titleTemplate: string;
  component: string;
  features?: string[];
  floating?: boolean; // default true — set false for windows rendered in main area
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
  /** Display name of the specific record (e.g. "John Smith"), not the entity type label */
  displayName?: string;
  propertyEntity?: string;
  parentKey?: string;
  label?: string;
  initialValues?: Record<string, string>;
  zIndex: number;
}

// --- Template interpolation ---

interface TransitionContext {
  entity?: string;
  id?: number;
  /** Display name of the specific record (e.g. "John Smith") */
  displayName?: string;
  label?: string;
  propertyEntity?: string;
  parentKey?: string;
  mode?: string;
}

/**
 * Resolve navigation template tokens: {entity}, {entitySingular}, {id}, {name}, {label}, {mode}.
 *
 * This is intentionally NOT the unified template engine (lib/template.ts).
 * Navigation templates use a closed vocabulary of UI-derived tokens (entity labels,
 * window IDs), not open-ended database field references. The two grammars share
 * syntax ({...}) but have different semantics and different token sources.
 */
function interpolate(template: string, ctx: TransitionContext, schema?: SchemaConfig): string {
  return template
    .replace(/\{entity\}/g, entityLabel(ctx.entity ?? "", schema))
    .replace(/\{entitySingular\}/g, entityLabelSingular(ctx.entity ?? "", schema))
    .replace(/\{id\}/g, String(ctx.id ?? ""))
    .replace(/\{name\}/g, ctx.displayName ?? "")
    .replace(/\{label\}/g, ctx.label ?? "")
    .replace(/\{propertyEntity\}/g, ctx.propertyEntity ?? "")
    .replace(/\{mode\}/g, ctx.mode ?? "Add");
}

// --- Public API ---

/** Structured key for transition lookup — replaces the fragile "from→to" string */
interface TransitionKey {
  from: string;
  to: string;
}

/**
 * Build a WindowState for a transition.
 *
 * @param key — { from, to } identifying which transition to follow,
 *   e.g. { from: "sidebar", to: "search" }.
 *   Matched against the `from` and `to` fields in navigation.yaml.
 */
export function transition(
  nav: NavigationConfig,
  key: TransitionKey,
  ctx: TransitionContext,
  schema?: SchemaConfig
): Omit<WindowState, "zIndex"> {
  const def = nav.transitions.find((t) => t.from === key.from && t.to === key.to);
  if (!def) {
    throw new Error(`Unknown transition: ${key.from} → ${key.to}`);
  }

  // Build the mode for form titles
  const mode = ctx.id ? "Edit" : "Add";
  const fullCtx = { ...ctx, mode };

  return {
    id: interpolate(def.idTemplate, fullCtx, schema),
    type: def.to,
    entityName: ctx.entity,
    entityId: ctx.id,
    displayName: ctx.displayName,
    propertyEntity: ctx.propertyEntity,
    parentKey: ctx.parentKey,
    label: ctx.label,
  };
}

/** Resolve the title for a window */
export function windowTitle(
  nav: NavigationConfig,
  win: WindowState,
  schema?: SchemaConfig
): string {
  const def = nav.windows[win.type];
  if (!def) return win.type;

  const ctx: TransitionContext = {
    entity: win.entityName,
    id: win.entityId,
    displayName: win.displayName,
    label: win.label,
    propertyEntity: win.propertyEntity,
    mode: win.entityId ? "Edit" : "Add",
  };

  return interpolate(def.titleTemplate, ctx, schema);
}

// YAML loader is in navigation-loader.ts (server-side only)
