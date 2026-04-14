/**
 * Schema Loader
 *
 * Reads and validates schema.yaml, exposing a typed configuration
 * that the rest of the app consumes.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import { fieldTypes } from "./field-types";

// --- Types (canonical definitions in schema-types.ts) ---

// Re-export all types so existing imports from schema-loader continue to work
export type {
  FieldConfig, RelationConfig, EntityConfig, SchemaConfig,
  RepresentationsConfig, VCardRepresentation, ICalRepresentation,
  CsvRepresentation, JsonRepresentation, DisplayConfig, DisplayAction,
} from "./schema-types";

// Import for local use in this file
import type {
  FieldConfig, EntityConfig, SchemaConfig,
} from "./schema-types";

// --- Loader ---

const SCHEMA_PATH = path.resolve(process.cwd(), "schema.yaml");

let cachedSchema: SchemaConfig | null = null;

export function loadSchema(schemaPath?: string): SchemaConfig {
  const filePath = schemaPath || SCHEMA_PATH;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(raw) as SchemaConfig;

  validateSchema(parsed);

  cachedSchema = parsed;
  return parsed;
}

export function getSchema(): SchemaConfig {
  if (!cachedSchema) {
    return loadSchema();
  }
  return cachedSchema;
}

// --- Validation ---

function validateSchema(schema: SchemaConfig): void {
  if (!schema.entities || typeof schema.entities !== "object") {
    throw new Error("schema.yaml must have an 'entities' object at the root");
  }

  const entityNames = Object.keys(schema.entities);

  for (const [entityName, entity] of Object.entries(schema.entities)) {
    if (!entity.fields || typeof entity.fields !== "object") {
      throw new Error(`Entity "${entityName}" must have a 'fields' object`);
    }

    // Validate fields
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (!field.type) {
        throw new Error(`Field "${entityName}.${fieldName}" must have a 'type'`);
      }
      if (!fieldTypes[field.type]) {
        throw new Error(
          `Field "${entityName}.${fieldName}" has unknown type "${field.type}". ` +
            `Available: ${Object.keys(fieldTypes).join(", ")}`
        );
      }
      if (field.type === "enum" && (!field.values || !Array.isArray(field.values))) {
        throw new Error(
          `Field "${entityName}.${fieldName}" is type "enum" but missing "values" array`
        );
      }

      // Validate new field properties
      if (field.unique !== undefined && typeof field.unique !== "boolean") {
        throw new Error(
          `Field "${entityName}.${fieldName}" property "unique" must be boolean`
        );
      }
      if (field.indexed !== undefined && typeof field.indexed !== "boolean") {
        throw new Error(
          `Field "${entityName}.${fieldName}" property "indexed" must be boolean`
        );
      }
      if (field.default !== undefined) {
        const expectedType = field.type === "boolean" ? "boolean" : field.type === "number" ? "number" : "string";
        if (typeof field.default !== expectedType && !(field.type === "enum" && typeof field.default === "string")) {
          throw new Error(
            `Field "${entityName}.${fieldName}" default value type mismatch: expected ${expectedType}, got ${typeof field.default}`
          );
        }
      }
    }

    // Validate relations
    if (entity.relations) {
      for (const [relName, rel] of Object.entries(entity.relations)) {
        if (rel.type !== "belongs_to") {
          throw new Error(
            `Relation "${entityName}.${relName}" has unsupported type "${rel.type}". ` +
              `Currently supported: belongs_to`
          );
        }
        if (!entityNames.includes(rel.entity)) {
          throw new Error(
            `Relation "${entityName}.${relName}" references unknown entity "${rel.entity}"`
          );
        }
      }
    }

    // Validate compound indexes
    if (entity.indexes) {
      if (!Array.isArray(entity.indexes)) {
        throw new Error(`Entity "${entityName}" indexes must be an array of arrays`);
      }
      for (const cols of entity.indexes) {
        if (!Array.isArray(cols) || cols.length < 2) {
          throw new Error(
            `Entity "${entityName}" each index must be an array of at least 2 column names`
          );
        }
        for (const col of cols) {
          // Column can be a field name or a relation FK name (e.g. "nurseId")
          const isField = !!entity.fields[col];
          const isRelFk = col.endsWith("Id") && !!entity.relations?.[col.replace(/Id$/, "")];
          if (!isField && !isRelFk) {
            throw new Error(
              `Entity "${entityName}" index references unknown column "${col}"`
            );
          }
        }
      }
    }

    // Validate representations
    if (entity.representations) {
      const reps = entity.representations;

      // Validate vcard mapping
      if (reps.vcard?.mapping) {
        for (const fieldName of Object.keys(reps.vcard.mapping)) {
          if (!entity.fields[fieldName] && !entity.relations?.[fieldName]) {
            throw new Error(
              `Entity "${entityName}" representations.vcard mapping references unknown field "${fieldName}"`
            );
          }
        }
      }

      // Validate ical mapping
      if (reps.ical?.mapping) {
        for (const fieldName of Object.keys(reps.ical.mapping)) {
          if (!entity.fields[fieldName] && !entity.relations?.[fieldName]) {
            throw new Error(
              `Entity "${entityName}" representations.ical mapping references unknown field "${fieldName}"`
            );
          }
        }
      }

      // Validate csv headers reference real fields
      if (reps.csv?.headers) {
        for (const fieldName of Object.keys(reps.csv.headers)) {
          if (!entity.fields[fieldName]) {
            throw new Error(
              `Entity "${entityName}" representations.csv headers references unknown field "${fieldName}"`
            );
          }
        }
      }

      // Validate json include_relations reference real relations
      if (reps.json?.include_relations) {
        for (const relName of reps.json.include_relations) {
          // Check both forward and reverse relations
          const hasForward = entity.relations?.[relName];
          const hasReverse = Object.entries(schema.entities).some(
            ([name, e]) =>
              name === relName ||
              (e.relations &&
                Object.values(e.relations).some(
                  (r) => r.entity === entityName
                ) &&
                name === relName)
          );
          if (!hasForward && !hasReverse) {
            throw new Error(
              `Entity "${entityName}" representations.json.include_relations references unknown relation "${relName}"`
            );
          }
        }
      }

      // Validate json groups reference real fields
      if (reps.json?.groups) {
        for (const [groupName, fields] of Object.entries(reps.json.groups)) {
          for (const fieldName of fields) {
            if (!entity.fields[fieldName]) {
              throw new Error(
                `Entity "${entityName}" representations.json.groups.${groupName} references unknown field "${fieldName}"`
              );
            }
          }
        }
      }
    }

    // Validate display block
    if (entity.display) {
      const d = entity.display;
      // Validate title field reference (plain field or template)
      if (d.title && !d.title.includes("{") && !entity.fields[d.title]) {
        throw new Error(
          `Entity "${entityName}" display.title references unknown field "${d.title}"`
        );
      }
      // Validate subtitle field references
      if (d.subtitle) {
        const subs = Array.isArray(d.subtitle) ? d.subtitle : [d.subtitle];
        for (const s of subs) {
          if (!s.includes("{") && !entity.fields[s]) {
            throw new Error(
              `Entity "${entityName}" display.subtitle references unknown field "${s}"`
            );
          }
        }
      }
      // Validate badge field reference
      if (d.badge && !entity.fields[d.badge]) {
        throw new Error(
          `Entity "${entityName}" display.badge references unknown field "${d.badge}"`
        );
      }
      // Validate summary field reference
      if (d.summary && !entity.fields[d.summary]) {
        throw new Error(
          `Entity "${entityName}" display.summary references unknown field "${d.summary}"`
        );
      }
      // Validate actions
      if (d.actions) {
        if (!Array.isArray(d.actions)) {
          throw new Error(
            `Entity "${entityName}" display.actions must be an array`
          );
        }
        for (const action of d.actions) {
          if (!action.label || typeof action.label !== "string") {
            throw new Error(
              `Entity "${entityName}" display.actions entries must have a "label" string`
            );
          }
          if (!action.href || typeof action.href !== "string") {
            throw new Error(
              `Entity "${entityName}" display.actions entries must have an "href" string`
            );
          }
        }
      }
    }

    // Validate upsert keys
    if (entity.upsert_keys) {
      if (!Array.isArray(entity.upsert_keys)) {
        throw new Error(`Entity "${entityName}" upsert_keys must be an array`);
      }
      for (const key of entity.upsert_keys) {
        const isField = !!entity.fields[key];
        const isRelName = key.endsWith("_name") &&
          !!entity.relations?.[key.replace(/_name$/, "")];
        if (!isField && !isRelName) {
          throw new Error(
            `Entity "${entityName}" upsert_keys references unknown field "${key}"`
          );
        }
      }
    }

  }
}
