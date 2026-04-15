/**
 * Schema Types & Cache
 *
 * Types and the schema cache, separated from the file-loading code
 * in schema-loader.ts. This module is safe to import in client bundles
 * because it has no Node.js dependencies (fs, path).
 *
 * schema-loader.ts imports from here and populates the cache.
 * Client code imports types and getSchema() from here (via the
 * @/lib/schema facade) without pulling in fs.
 */

// --- Types ---

export interface FieldConfig {
  type: string;
  required?: boolean;
  unique?: boolean; // Emits @unique constraint in Prisma schema
  indexed?: boolean;  // Emits @@index in Prisma schema
  default?: string | number | boolean;  // Emits @default(...) in Prisma schema (literal values only, not Prisma functions)
  values?: string[]; // For enum type
  ai_visible?: boolean; // false = excluded from AI schema description and result redaction
}

export interface RelationConfig {
  type: "belongs_to";
  entity: string;
  required?: boolean;
  on_delete?: "cascade" | "restrict" | "set_null";
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
  sensitive?: boolean;
  label?: string;
  label_singular?: string;
  fields: Record<string, FieldConfig>;
  relations?: Record<string, RelationConfig>;
  representations?: RepresentationsConfig;
  upsert_keys?: string[];
  display?: DisplayConfig;
  sidebar_addable?: boolean;
  exportable?: boolean;
  immutable?: boolean;
  indexes?: string[][]; // Compound indexes, e.g. [["nurseId", "date"]]
}

export interface SchemaConfig {
  entities: Record<string, EntityConfig>;
}

// --- Cache ---

let cachedSchema: SchemaConfig | null = null;

/**
 * Get the cached schema. Throws if the cache is empty.
 *
 * The schema is loaded at server startup (predev hook calls loadSchema)
 * and cached via setSchemaCache(). By the time any component calls
 * getSchema(), the cache is always populated.
 */
export function getSchema(): SchemaConfig {
  if (!cachedSchema) {
    throw new Error(
      "Schema not loaded. Ensure loadSchema() runs during server startup (predev hook)."
    );
  }
  return cachedSchema;
}

/** Called by loadSchema() to populate the cache. */
export function setSchemaCache(schema: SchemaConfig): void {
  cachedSchema = schema;
}
