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

export function loadNavigationYaml(): NavigationConfig {
  const filePath = path.resolve(process.cwd(), "navigation.yaml");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw);

  const windows: Record<string, WindowDef> = {};
  for (const [name, def] of Object.entries(
    parsed.windows as Record<string, Record<string, string>>
  )) {
    windows[name] = {
      role: def.role as WindowRole,
      titleTemplate: def.title,
      component: def.component,
      features: Array.isArray(def.features) ? (def.features as string[]) : undefined,
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

  return { windows, transitions };
}
