/**
 * Navigation YAML Loader (server-side only)
 *
 * Reads navigation.yaml and returns the parsed config.
 * Must NOT be imported from client components.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import type { NavigationConfig, WindowDef, TransitionDef } from "./navigation";
import type { WindowRole } from "./layout";

const VALID_WINDOW_ROLES: ReadonlySet<WindowRole> = new Set([
  "search", "detail", "property", "form", "ai", "calendar",
]);

/**
 * Validate the parsed navigation config.
 * Throws if any transition references an unknown window type, or any
 * window declares an invalid role.
 */
export function validateNavigation(config: NavigationConfig): void {
  const errors: string[] = [];
  const definedWindows = new Set(Object.keys(config.windows));

  // Every window must have a valid role
  for (const [name, def] of Object.entries(config.windows)) {
    if (!VALID_WINDOW_ROLES.has(def.role)) {
      errors.push(`Window "${name}" has invalid role "${def.role}"`);
    }
  }

  // Every transition's `to` must reference a defined window type.
  // `from` can be a logical source (app, sidebar) or parameterized (detail[appointment]),
  // so we only validate the base name if it looks like a window reference.
  for (const t of config.transitions) {
    if (!definedWindows.has(t.to)) {
      errors.push(`Transition references unknown window type "${t.to}" (to)`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid navigation.yaml:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}

export function loadNavigationYaml(): NavigationConfig {
  const filePath = path.resolve(process.cwd(), "navigation.yaml");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw);

  const windows: Record<string, WindowDef> = {};
  for (const [name, def] of Object.entries(
    parsed.windows as Record<string, Record<string, unknown>>
  )) {
    windows[name] = {
      role: def.role as WindowRole,
      titleTemplate: def.title as string,
      component: def.component as string,
      features: Array.isArray(def.features) ? (def.features as string[]) : undefined,
      floating: def.floating === false ? false : undefined,
    };
  }

  const transitions: TransitionDef[] = (
    parsed.transitions as Record<string, string>[]
  ).map((t) => ({
    from: t.from,
    to: t.to,
    on: t.on,
    idTemplate: t.id,
  }));

  const config = { windows, transitions };
  validateNavigation(config);
  return config;
}
