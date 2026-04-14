/**
 * App Configuration Hook
 *
 * Fetches schema and navigation config on mount, derives the entity hierarchy.
 * Extracted from dashboard-shell.tsx to separate data loading from rendering.
 */

import { useState, useEffect, useMemo } from "react";
import { deriveHierarchy, type SchemaConfig, type SchemaHierarchy } from "@/lib/schema";
import type { NavigationConfig } from "@/lib/navigation";

export interface AppConfig {
  schema: SchemaConfig | null;
  nav: NavigationConfig | null;
  hierarchy: SchemaHierarchy | null;
}

export function useAppConfig(): AppConfig {
  const [schema, setSchema] = useState<SchemaConfig | null>(null);
  const [nav, setNav] = useState<NavigationConfig | null>(null);

  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then(setSchema)
      .catch((err) => console.error("Failed to load schema:", err));
    fetch("/api/navigation")
      .then((r) => r.json())
      .then(setNav)
      .catch((err) => console.error("Failed to load navigation:", err));
  }, []);

  const hierarchy = useMemo(
    () => (schema ? deriveHierarchy(schema) : null),
    [schema]
  );

  return { schema, nav, hierarchy };
}
