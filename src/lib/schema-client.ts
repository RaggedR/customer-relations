/**
 * Schema Client — coKleisli Arrows (Pure Analysis)
 *
 * The Right adjoint (R) of the schema adjunction: analysis and projection.
 * Every function here is a coKleisli arrow — it computes a result from
 * schema context without side effects. No fs, no Node.js dependencies.
 * Safe to import in client bundles.
 *
 * The dual module is schema.ts (the Left adjoint, L — synthesis),
 * which loads schema from disk and populates the cache. Server-only
 * code imports from schema.ts; client code imports from here.
 *
 * Together they form the adjunction L ⊣ R:
 *   L (schema.ts):        fs → YAML → SchemaConfig  (synthesis)
 *   R (schema-client.ts): SchemaConfig → derived views (analysis)
 *
 * The comonadic structure:
 *   extract  = getSchema() (in schema.ts — returns the focused value)
 *   extend   = deriveHierarchy, entityLabel, etc. (here — context-dependent computations)
 *   duplicate = deriveHierarchy specifically (computes all possible focus positions)
 */

// ─── Re-exports: Types ──────────────────────────────────

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
} from "@/engine/schema-types";

// ─── Re-exports: Field types ────────────────────────────

export { fieldTypes, getFieldType, validateFieldValue } from "@/engine/field-types";
export type { FieldTypeDefinition } from "@/engine/field-types";

// ─── Re-exports: Naming conventions ─────────────────────

export { reverseRelationKey, foreignKeyName } from "@/engine/naming";
export { toPascalCase, toSnakeCase } from "@/engine/naming";

// ─── Schema Hierarchy (coKleisli: extend) ───────────────

import type { SchemaConfig } from "@/engine/schema-types";
import { foreignKeyName, reverseRelationKey } from "@/engine/naming";

export interface SchemaHierarchy {
  /** Entity names with no belongs_to (e.g. ["patient", "nurse"]) */
  firstOrder: string[];
  /** Map from first-order entity → its property entity names */
  propertiesOf: Record<string, string[]>;
  /** Map from property entity → all parents [{ parentEntity, foreignKey }] */
  parentOf: Record<string, { entity: string; foreignKey: string }[]>;
}

/**
 * coKleisli arrow: (SchemaConfig) → SchemaHierarchy
 *
 * This is `extend` on the schema comonad — it takes the full schema
 * context and computes the hierarchy by examining all entities'
 * belongs_to relations. Pure function, no side effects.
 */
export function deriveHierarchy(schema: SchemaConfig): SchemaHierarchy {
  // Exclude sensitive entities (user, session, audit_log, etc.) — they are
  // internal system entities, not navigable in the UI.
  const allEntities = Object.keys(schema.entities).filter(
    (name) => !schema.entities[name].sensitive
  );

  const firstOrder = allEntities.filter((name) => {
    const entity = schema.entities[name];
    // An entity is first-order if it has no relations, or all its
    // belongs_to targets are sensitive (e.g. patient → user).
    if (!entity.relations) return true;
    const belongsToTargets = Object.values(entity.relations)
      .filter((r) => r.type === "belongs_to")
      .map((r) => r.entity);
    if (belongsToTargets.length === 0) return true;
    // If the target is missing from the schema (filtered out as sensitive)
    // or explicitly marked sensitive, ignore that relation for hierarchy purposes.
    return belongsToTargets.every(
      (target) => !schema.entities[target] || schema.entities[target].sensitive
    );
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

// ─── Label Helpers (coKleisli arrows) ───────────────────

/**
 * coKleisli arrow: (name, schema?) → plural display label
 *
 * Reads the label from the schema when provided; falls back to
 * auto-generation from snake_case. The optional schema parameter
 * is the comonadic context — when absent, the function degrades
 * to a pure string transform.
 */
export function entityLabel(name: string, schema?: SchemaConfig): string {
  const entity = schema?.entities[name];
  if (entity?.label) return entity.label;
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1) + "s";
}

/** coKleisli arrow: (name, schema?) → singular display label */
export function entityLabelSingular(name: string, schema?: SchemaConfig): string {
  const entity = schema?.entities[name];
  if (entity?.label_singular) return entity.label_singular;
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Reverse Mapping (pure) ─────────────────────────────

/**
 * Build a reverse lookup: external property → our field name.
 * e.g. { "FN": "name", "TEL": "phone", "EMAIL": "email" }
 *
 * Pure function — no schema context needed.
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

// ─── Reverse Relation Key Resolution ────────────────────

/**
 * coKleisli arrow: (record, propertyEntity) → key name | null
 *
 * Find the key on an API response record that holds the child entity array.
 * Tries deterministic candidates first, then falls back to a substring scan.
 */
export function findReverseRelationKey(
  record: Record<string, unknown>,
  propertyEntity: string
): string | null {
  const candidates = [
    reverseRelationKey(propertyEntity),
    propertyEntity.replace(/_/g, "") + "s",
    propertyEntity,
  ];
  for (const key of candidates) {
    if (Array.isArray(record[key])) return key;
  }

  const normalised = propertyEntity.replace(/_/g, "").toLowerCase();
  for (const [key, val] of Object.entries(record)) {
    if (Array.isArray(val) && key.toLowerCase().includes(normalised)) {
      return key;
    }
  }

  return null;
}
