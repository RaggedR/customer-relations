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

// --- Representation types (external format mappings) ---

export interface VCardRepresentation {
  mapping: Record<string, string>; // our field → vCard property (FN, TEL, EMAIL, etc.)
}

export interface ICalRepresentation {
  mapping: Record<string, string>; // our field → iCal property (DTSTART_DATE, DTEND_TIME, etc.)
  summary_template?: string; // e.g. "{patient.name} — {specialty}"
}

export interface CsvRepresentation {
  headers?: Record<string, string>; // our field → column header (defaults to field name)
}

export interface JsonRepresentation {
  include_relations?: string[]; // which relations to include in export
  groups?: Record<string, string[]>; // group fields into sub-objects
}

export interface RepresentationsConfig {
  vcard?: VCardRepresentation;
  ical?: ICalRepresentation;
  csv?: CsvRepresentation;
  json?: JsonRepresentation;
}

export interface DisplayAction {
  label: string;                   // button text (e.g. "Download")
  href: string;                    // URL template with {field} interpolation
}

export interface DisplayConfig {
  title?: string;                  // field name or "{field} — {field}" template
  subtitle?: string | string[];   // field name(s) to show below title
  badge?: string;                 // enum field name → rendered as colored pill
  summary?: string;               // text field for truncated preview
  summary_max?: number;           // truncation length (default 80)
  actions?: DisplayAction[];       // URL-based actions with template interpolation
}

export interface EntityConfig {
  label?: string;
  label_singular?: string;
  fields: Record<string, FieldConfig>;
  relations?: Record<string, RelationConfig>;
  representations?: RepresentationsConfig;
  upsert_keys?: string[];
  display?: DisplayConfig;
  sidebar_addable?: boolean;
  exportable?: boolean;
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
