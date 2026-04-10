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

// --- Types ---

export interface FieldConfig {
  type: string;
  required?: boolean;
  values?: string[]; // For enum type
}

export interface RelationConfig {
  type: "belongs_to";
  entity: string;
}

export interface CardDAVMapping {
  [fieldName: string]: string; // our field → vCard property
}

export interface CardDAVConfig {
  enabled: boolean;
  mapping: CardDAVMapping;
}

export interface EntityConfig {
  fields: Record<string, FieldConfig>;
  relations?: Record<string, RelationConfig>;
  carddav?: CardDAVConfig;
}

export interface SchemaConfig {
  entities: Record<string, EntityConfig>;
}

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

    // Validate CardDAV config
    if (entity.carddav) {
      if (typeof entity.carddav.enabled !== "boolean") {
        throw new Error(`Entity "${entityName}" carddav.enabled must be a boolean`);
      }
      if (entity.carddav.enabled && !entity.carddav.mapping) {
        throw new Error(
          `Entity "${entityName}" has carddav enabled but no mapping defined`
        );
      }
      if (entity.carddav.mapping) {
        for (const fieldName of Object.keys(entity.carddav.mapping)) {
          if (!entity.fields[fieldName] && !entity.relations?.[fieldName]) {
            throw new Error(
              `Entity "${entityName}" carddav mapping references unknown field "${fieldName}"`
            );
          }
        }
      }
    }
  }
}
