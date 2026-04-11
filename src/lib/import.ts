/**
 * Generic Import Engine
 *
 * Schema-driven import for any entity. Accepts parsed row objects,
 * maps columns to fields, validates, and upserts.
 *
 * Key design decisions:
 * - Relations resolved by name (case-insensitive) — e.g. "patient_name" → patientId
 * - Upsert by configurable key fields (defaults to entity-specific logic)
 * - Unknown columns are skipped (logged but not rejected)
 */

import { getSchema, EntityConfig } from "../engine/schema-loader";
import { create, update, findAll } from "./repository";
import { normaliseRows, Row } from "./parsers";

export interface ImportOptions {
  /** Fields that uniquely identify a record for upsert. Default: entity-specific. */
  upsertKeys?: string[];
  /** If true, skip rows with validation errors instead of failing. Default: true. */
  skipInvalid?: boolean;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Default upsert keys per entity.
 * These determine when an existing record is updated vs a new one created.
 */
const DEFAULT_UPSERT_KEYS: Record<string, string[]> = {
  patient: ["name", "date_of_birth"],
  nurse: ["name"],
  hearing_aid: ["serial_number"],
  referral: ["referring_gp", "referral_date"],
  appointment: ["date", "start_time", "patient_name"],
  clinical_note: ["date", "content"],
  claim_item: ["item_number", "date_of_service"],
};

/**
 * Import entities from parsed data.
 *
 * Flow:
 * 1. Normalise column headers to schema field names
 * 2. Build relation lookup maps (name → id)
 * 3. For each row: resolve relations, coerce types, validate, upsert
 */
export async function importEntities(
  entityName: string,
  rawRows: Row[],
  options?: ImportOptions
): Promise<ImportResult> {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const skipInvalid = options?.skipInvalid ?? true;
  const upsertKeys = options?.upsertKeys ?? DEFAULT_UPSERT_KEYS[entityName] ?? [];

  // Normalise headers
  const rows = normaliseRows(rawRows, entityName);

  // Build relation lookup maps
  const relationMaps = await buildRelationMaps(entity);

  // Load existing records for upsert matching
  const existingRecords = await loadExistingRecords(entityName, entity);

  const result: ImportResult = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 for 1-indexed + header row
    const row = rows[i];

    try {
      // Resolve relations (e.g. patient_name → patient: id)
      const data = resolveRelations(row, entity, relationMaps, rowNum, result);
      if (!data) continue; // Relation resolution failed, error already logged

      // Coerce field types
      coerceTypes(data, entity);

      // Strip unknown fields
      const cleanData = stripUnknownFields(data, entity);

      // Find existing record for upsert
      const existingId = findExistingRecord(
        cleanData,
        existingRecords,
        upsertKeys,
        entity
      );

      if (existingId) {
        await update(entityName, existingId, cleanData);
        result.updated++;
      } else {
        const created = await create(entityName, cleanData);
        // Add to existing records so subsequent rows can upsert against it
        existingRecords.push({
          id: (created as Row).id as number,
          ...cleanData,
        });
        result.created++;
      }
    } catch (err) {
      const msg = `Row ${rowNum}: ${(err as Error).message}`;
      result.errors.push(msg);
      if (!skipInvalid) throw new Error(msg);
      result.skipped++;
    }
  }

  return result;
}

/**
 * Build name→id lookup maps for all belongs_to relations on an entity.
 */
async function buildRelationMaps(
  entity: EntityConfig
): Promise<Record<string, Map<string, number>>> {
  const maps: Record<string, Map<string, number>> = {};

  if (!entity.relations) return maps;

  for (const [relName, rel] of Object.entries(entity.relations)) {
    const records = (await findAll(rel.entity)) as Row[];
    const map = new Map<string, number>();
    for (const record of records) {
      const name = String(record.name ?? "").toLowerCase().trim();
      if (name) {
        map.set(name, record.id as number);
      }
    }
    maps[relName] = map;
  }

  return maps;
}

/**
 * Load all existing records for upsert matching.
 */
async function loadExistingRecords(
  entityName: string,
  entity: EntityConfig
): Promise<Row[]> {
  const records = (await findAll(entityName)) as Row[];
  return records.map((r) => {
    const flat: Row = { id: r.id };
    // Copy schema fields
    for (const fieldName of Object.keys(entity.fields)) {
      flat[fieldName] = r[fieldName];
    }
    // Copy relation IDs
    if (entity.relations) {
      for (const relName of Object.keys(entity.relations)) {
        const fkKey = `${relName}Id`;
        flat[fkKey] = r[fkKey];
        // Also store the parent name for matching
        const parent = r[relName] as Row | null;
        if (parent?.name) {
          flat[`${relName}_name`] = parent.name;
        }
      }
    }
    return flat;
  });
}

/**
 * Resolve relation references (e.g. patient_name → patient: id).
 * Returns the data with relation fields resolved, or null if resolution failed.
 */
function resolveRelations(
  row: Row,
  entity: EntityConfig,
  relationMaps: Record<string, Map<string, number>>,
  rowNum: number,
  result: ImportResult
): Row | null {
  const data: Row = { ...row };

  if (!entity.relations) return data;

  for (const [relName, rel] of Object.entries(entity.relations)) {
    const nameKey = `${relName}_name`;
    const rawName = data[nameKey] ?? data[relName];

    // Remove the name field — it's not a real schema field
    delete data[nameKey];

    if (rawName && typeof rawName === "string") {
      const map = relationMaps[relName];
      const name = rawName.toLowerCase().trim();
      const id = map?.get(name);

      if (!id) {
        result.errors.push(
          `Row ${rowNum}: ${rel.entity} "${rawName}" not found`
        );
        result.skipped++;
        return null;
      }
      data[relName] = id;
    } else if (rawName && typeof rawName === "number") {
      // Already an ID
      data[relName] = rawName;
    }
    // If no relation value at all, leave it unset (nullable FK)
  }

  return data;
}

/**
 * Coerce string values to the correct types based on schema field definitions.
 */
function coerceTypes(data: Row, entity: EntityConfig): void {
  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const value = data[fieldName];
    if (value === undefined || value === null || value === "") continue;

    switch (field.type) {
      case "number":
        data[fieldName] = Number(value);
        break;
      case "boolean":
        if (typeof value === "string") {
          data[fieldName] =
            value.toLowerCase() === "true" || value === "1";
        }
        break;
      case "date":
      case "datetime":
        // Keep as string — repository.transformInput handles Date conversion
        break;
      case "enum":
        // Normalise to lowercase to match enum values
        if (typeof value === "string" && field.values) {
          const lower = value.toLowerCase();
          const match = field.values.find((v) => v.toLowerCase() === lower);
          if (match) {
            data[fieldName] = match;
          }
          // If no match, leave as-is — validation will catch it
        }
        break;
    }
  }
}

/**
 * Remove fields that aren't in the schema (unknown columns).
 */
function stripUnknownFields(data: Row, entity: EntityConfig): Row {
  const clean: Row = {};
  const validKeys = new Set([
    ...Object.keys(entity.fields),
    ...Object.keys(entity.relations ?? {}),
  ]);

  for (const [key, value] of Object.entries(data)) {
    if (validKeys.has(key)) {
      // Skip empty strings — treat as null (don't overwrite existing data)
      if (value === "") continue;
      clean[key] = value;
    }
  }

  return clean;
}

/**
 * Find an existing record that matches the import row on the upsert keys.
 * Returns the record's ID if found, null otherwise.
 */
function findExistingRecord(
  data: Row,
  existing: Row[],
  upsertKeys: string[],
  entity: EntityConfig
): number | null {
  if (upsertKeys.length === 0) return null;

  for (const record of existing) {
    const allMatch = upsertKeys.every((key) => {
      let dataVal = data[key];
      let recVal = record[key];

      // For relation-based keys (e.g. "patient_name"), check the FK
      if (key.endsWith("_name") && entity.relations) {
        const relName = key.replace(/_name$/, "");
        if (entity.relations[relName]) {
          // Compare the resolved FK ID
          dataVal = data[relName];
          recVal = record[`${relName}Id`];
          return dataVal != null && recVal != null && Number(dataVal) === Number(recVal);
        }
      }

      if (dataVal == null || recVal == null) return false;

      // Case-insensitive string comparison
      if (typeof dataVal === "string" && typeof recVal === "string") {
        return dataVal.toLowerCase().trim() === recVal.toLowerCase().trim();
      }

      // Date comparison
      const fieldConfig = entity.fields[key];
      if (fieldConfig?.type === "date" || fieldConfig?.type === "datetime") {
        const d1 = new Date(dataVal as string).toISOString().slice(0, 10);
        const d2 = new Date(recVal as string).toISOString().slice(0, 10);
        return d1 === d2;
      }

      return String(dataVal) === String(recVal);
    });

    if (allMatch) return record.id as number;
  }

  return null;
}
