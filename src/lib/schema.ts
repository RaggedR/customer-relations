/**
 * Schema Facade — Left Adjoint (L) + Bridge
 *
 * The synthesis side of the schema adjunction. This module provides:
 * 1. getSchema() — the comonadic extract: loads schema from cache (or disk as fallback)
 * 2. Effectful projections — isSensitive(), get*Representation() — coKleisli arrows
 *    that call extract internally
 * 3. Re-exports of everything from schema-client.ts (the Right adjoint, R)
 *
 * The adjunction L ⊣ R:
 *   L (this file):       fs → YAML → SchemaConfig  (synthesis, server-only)
 *   R (schema-client.ts): SchemaConfig → derived views (analysis, client-safe)
 *
 * Server-side code imports from here (gets both L and R).
 * Client-side code imports from schema-client.ts (gets only R — no fs).
 *
 * This is the GoF Facade pattern: the single public interface for all
 * schema-related functionality outside src/engine/. No file in lib/,
 * app/api/, or components/ should import directly from @/engine/.
 */

import {
  getSchema as getSchemaFromCache,
  type SchemaConfig,
  type RepresentationsConfig,
  type VCardRepresentation,
  type ICalRepresentation,
  type CsvRepresentation,
  type JsonRepresentation,
} from "@/engine/schema-types";

// ─── Re-export everything from the Right adjoint (client-safe) ──

export {
  // Types
  type SchemaConfig,
  type EntityConfig,
  type FieldConfig,
  type RelationConfig,
  type DisplayConfig,
  type DisplayAction,
  type RepresentationsConfig,
  type VCardRepresentation,
  type ICalRepresentation,
  type CsvRepresentation,
  type JsonRepresentation,
  type FieldTypeDefinition,
  // Field types
  fieldTypes,
  getFieldType,
  validateFieldValue,
  // Naming conventions
  reverseRelationKey,
  foreignKeyName,
  toPascalCase,
  toSnakeCase,
  // coKleisli arrows (pure analysis)
  type SchemaHierarchy,
  deriveHierarchy,
  entityLabel,
  entityLabelSingular,
  reverseMapping,
  findReverseRelationKey,
} from "./schema-client";

// ─── Left Adjoint: Schema Access (extract) ──────────────

/**
 * Comonadic extract: get the loaded schema.
 *
 * Falls through to loadSchema() if the cache is empty (build time,
 * first request, or tests). Uses dynamic require() to avoid pulling
 * fs into client bundles statically.
 *
 * Server-only — client code should never call this directly.
 * Client components receive the schema via fetch("/api/schema").
 */
export function getSchema(): SchemaConfig {
  try {
    return getSchemaFromCache();
  } catch {
    // Cache empty — lazy-load from disk (server-only path).
    const loader = require("@/engine/schema-loader") as { loadSchema: () => SchemaConfig };
    return loader.loadSchema();
  }
}

// ─── Effectful coKleisli Arrows (call extract internally) ───

/**
 * Check whether an entity is marked as sensitive in the schema.
 * Sensitive entities (user, session, audit_log, calendar_connection) must not
 * be accessible via generic CRUD, export, import, or backup endpoints.
 */
export function isSensitive(entityName: string): boolean {
  const schema = getSchema();
  return schema.entities[entityName]?.sensitive === true;
}

// ─── Representations (effectful coKleisli arrows) ───────

/**
 * Get the full representations config for an entity.
 * Returns undefined if the entity has no representations block.
 */
export function getRepresentations(
  entityName: string
): RepresentationsConfig | undefined {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);
  return entity.representations;
}

/**
 * Get the vCard representation for an entity.
 * Returns undefined if no vCard mapping is configured.
 */
export function getVCardRepresentation(
  entityName: string
): VCardRepresentation | undefined {
  return getRepresentations(entityName)?.vcard;
}

/**
 * Get the iCal representation for an entity.
 * Returns undefined if no iCal mapping is configured.
 */
export function getICalRepresentation(
  entityName: string
): ICalRepresentation | undefined {
  return getRepresentations(entityName)?.ical;
}

/**
 * Get the CSV representation for an entity.
 *
 * If no explicit csv.headers block is configured in schema.yaml,
 * auto-generates Title Case headers from snake_case field names.
 * Always returns a valid CsvRepresentation with a headers map.
 */
export function getCsvRepresentation(entityName: string): CsvRepresentation {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const configured = entity.representations?.csv;
  if (configured?.headers) return configured;

  const headers: Record<string, string> = {};
  for (const fieldName of Object.keys(entity.fields)) {
    headers[fieldName] = fieldName
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return { headers };
}

/**
 * Get the JSON representation for an entity.
 * Returns undefined if no JSON config is set.
 */
export function getJsonRepresentation(
  entityName: string
): JsonRepresentation | undefined {
  return getRepresentations(entityName)?.json;
}
