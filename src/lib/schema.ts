/**
 * Schema Facade (GoF Facade pattern)
 *
 * The single public interface for all schema-related functionality
 * outside src/engine/. Files in lib/, app/api/, and components/
 * should import schema types, functions, and representations from
 * here — never directly from @/engine/.
 *
 * The engine is an internal subsystem (YAML loading, Prisma generation,
 * migrations). This module exposes only what consumers need, hiding
 * the engine's internal structure.
 *
 * Consolidates the former schema-hierarchy.ts and representations.ts.
 */

import {
  getSchema,
  type SchemaConfig,
  type RepresentationsConfig,
  type VCardRepresentation,
  type ICalRepresentation,
  type CsvRepresentation,
  type JsonRepresentation,
} from "@/engine/schema-loader";
import { reverseRelationKey, foreignKeyName } from "@/engine/naming";

// ─── Re-exports: Schema access & types ─────────────────────────

export { getSchema };
export { loadSchema } from "@/engine/schema-loader";
export type {
  SchemaConfig,
  EntityConfig,
  FieldConfig,
  RelationConfig,
  DisplayConfig,
  DisplayAction,
  RepresentationsConfig,
  VCardRepresentation,
  ICalRepresentation,
  CsvRepresentation,
  JsonRepresentation,
} from "@/engine/schema-loader";

// ─── Re-exports: Field types ───────────────────────────────────

export { fieldTypes, getFieldType, validateFieldValue } from "@/engine/field-types";
export type { FieldTypeDefinition } from "@/engine/field-types";

// ─── Re-exports: Naming conventions ────────────────────────────

export { reverseRelationKey, foreignKeyName };
export { toPascalCase, toSnakeCase } from "@/engine/naming";

// ─── Sensitive Entity Check ────────────────────────────────────

/**
 * Check whether an entity is marked as sensitive in the schema.
 * Sensitive entities (user, session, audit_log, calendar_connection) must not
 * be accessible via generic CRUD, export, import, or backup endpoints.
 */
export function isSensitive(entityName: string): boolean {
  const schema = getSchema();
  return schema.entities[entityName]?.sensitive === true;
}

// ─── Schema Hierarchy ──────────────────────────────────────────

export interface SchemaHierarchy {
  /** Entity names with no belongs_to (e.g. ["patient", "nurse"]) */
  firstOrder: string[];
  /** Map from first-order entity → its property entity names */
  propertiesOf: Record<string, string[]>;
  /** Map from property entity → all parents [{ parentEntity, foreignKey }] */
  parentOf: Record<string, { entity: string; foreignKey: string }[]>;
}

export function deriveHierarchy(schema: SchemaConfig): SchemaHierarchy {
  const allEntities = Object.keys(schema.entities);

  const firstOrder = allEntities.filter((name) => {
    const entity = schema.entities[name];
    return !entity.relations || Object.keys(entity.relations).length === 0;
  });

  const propertiesOf: Record<string, string[]> = {};
  const parentOf: Record<string, { entity: string; foreignKey: string }[]> = {};

  for (const fo of firstOrder) {
    propertiesOf[fo] = [];
  }

  for (const name of allEntities) {
    if (firstOrder.includes(name)) continue;
    const entity = schema.entities[name];
    if (!entity.relations) continue;

    if (!parentOf[name]) parentOf[name] = [];

    for (const [relName, rel] of Object.entries(entity.relations)) {
      if (rel.type === "belongs_to" && firstOrder.includes(rel.entity)) {
        if (!propertiesOf[rel.entity].includes(name)) {
          propertiesOf[rel.entity].push(name);
        }
        parentOf[name].push({
          entity: rel.entity,
          foreignKey: foreignKeyName(relName),
        });
      }
    }
  }

  return { firstOrder, propertiesOf, parentOf };
}

// ─── Label Helpers ─────────────────────────────────────────────

/**
 * Convert snake_case entity name to plural display label.
 * Reads the label from the schema when provided; falls back to auto-generation.
 */
export function entityLabel(name: string, schema?: SchemaConfig): string {
  const entity = schema?.entities[name];
  if (entity?.label) return entity.label;
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1) + "s";
}

/** Singular display label */
export function entityLabelSingular(name: string, schema?: SchemaConfig): string {
  const entity = schema?.entities[name];
  if (entity?.label_singular) return entity.label_singular;
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Representations ───────────────────────────────────────────

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

/**
 * Build a reverse lookup: external property → our field name.
 * e.g. { "FN": "name", "TEL": "phone", "EMAIL": "email" }
 */
export function reverseMapping(
  mapping: Record<string, string>
): Record<string, string> {
  const reversed: Record<string, string> = {};
  for (const [field, prop] of Object.entries(mapping)) {
    reversed[prop] = field;
  }
  return reversed;
}

// ─── Reverse Relation Key Resolution ──────────────────────────

/**
 * Find the key on an API response record that holds the child entity array.
 *
 * Prisma may return the reverse relation under different key conventions
 * (snake_case, camelCase, with/without trailing 's'). This function tries
 * deterministic candidates first, then falls back to a substring scan.
 *
 * Previously duplicated in entity-detail-panel.tsx — centralised here
 * because it's fundamentally about the naming conventions that this
 * Facade owns.
 */
export function findReverseRelationKey(
  record: Record<string, unknown>,
  propertyEntity: string
): string | null {
  // Deterministic candidates
  const candidates = [
    reverseRelationKey(propertyEntity),
    propertyEntity.replace(/_/g, "") + "s",
    propertyEntity,
  ];
  for (const key of candidates) {
    if (Array.isArray(record[key])) return key;
  }

  // Substring fallback — defensive code that never triggers for current entities
  // because prisma-generator.ts uses the same reverseRelationKey() function.
  // It would activate if a Prisma field name diverged from `${entityName}s`
  // (e.g., if someone hand-corrected "nurse_specialtys" to "nurse_specialties").
  const normalised = propertyEntity.replace(/_/g, "").toLowerCase();
  for (const [key, val] of Object.entries(record)) {
    if (Array.isArray(val) && key.toLowerCase().includes(normalised)) {
      return key;
    }
  }

  return null;
}
