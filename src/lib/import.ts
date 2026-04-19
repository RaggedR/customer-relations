/**
 * Generic Import Engine
 *
 * Schema-driven import for any entity. Accepts parsed row objects,
 * maps columns to fields, validates, and upserts.
 *
 * Key design decisions:
 * - Relations resolved by FK ID (exact, preferred) or name (case-insensitive, fallback)
 * - Sensitive relations (e.g. user) are never resolved by imported ID
 * - Upsert by configurable key fields (defaults to entity-specific logic)
 * - Unknown columns are skipped (logged but not rejected)
 */

import { getSchema, EntityConfig, foreignKeyName, toPascalCase, isSensitive } from "@/lib/schema";
import { create, update, findAll, validateEntity, transformInput } from "./repository";
import { prisma } from "./prisma";
import type { Row } from "./parsers";
import { getCsvRepresentation } from "@/lib/schema";

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

// ── Header Normalisation (moved from parsers.ts — import is the sole consumer) ──

/**
 * Build a header normalisation map for an entity.
 * Maps lowercased column headers → schema field names.
 */
function buildHeaderMap(entityName: string): Record<string, string> {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const map: Record<string, string> = {};

  for (const fieldName of Object.keys(entity.fields)) {
    map[fieldName.toLowerCase()] = fieldName;
    map[fieldName.replace(/_/g, " ").toLowerCase()] = fieldName;
  }

  if (entity.relations) {
    for (const relName of Object.keys(entity.relations)) {
      map[relName.toLowerCase()] = relName;
      map[`${relName} name`] = `${relName}_name`;
      map[`${relName}_name`] = `${relName}_name`;
      map[`${relName} id`] = `${relName}_id`;
      map[`${relName}_id`] = `${relName}_id`;
    }
  }

  const csvRep = getCsvRepresentation(entityName);
  if (csvRep.headers) {
    for (const [fieldName, header] of Object.entries(csvRep.headers)) {
      map[header.toLowerCase().trim()] = fieldName;
    }
  }

  return map;
}

function normaliseHeader(
  header: string,
  headerMap: Record<string, string>
): string {
  const key = header.toLowerCase().trim();
  return headerMap[key] || headerMap[key.replace(/[-_]/g, " ")] || key;
}

function normaliseRows(rows: Row[], entityName: string): Row[] {
  const headerMap = buildHeaderMap(entityName);
  return rows.map((row) => {
    const out: Row = {};
    for (const [key, val] of Object.entries(row)) {
      out[normaliseHeader(key, headerMap)] = val;
    }
    return out;
  });
}

/**
 * Import entities from parsed data.
 *
 * Flow:
 * 1. Normalise column headers to schema field names
 * 2. Build relation lookup maps (name → id)
 * 3. For each row: resolve relations, coerce types, validate, upsert
 */
/** A fully-resolved, validated row ready to be written to the database. */
interface PreparedRow {
  rowNum: number;
  cleanData: Row;
  existingId: number | null;
}

export async function importEntities(
  entityName: string,
  rawRows: Row[],
  options?: ImportOptions
): Promise<ImportResult> {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const skipInvalid = options?.skipInvalid ?? true;
  const upsertKeys = options?.upsertKeys ?? entity.upsert_keys ?? [];

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

  if (!skipInvalid) {
    // Strict mode: validate all rows first, then write all-or-nothing in a transaction.
    const prepared: PreparedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +2 for 1-indexed + header row
      const row = rows[i];

      // Resolve relations — a returned null means an error was logged and skipped count updated.
      // In strict mode, a relation failure is fatal.
      const tempResult: ImportResult = { ...result, errors: [...result.errors], skipped: 0 };
      const data = resolveRelations(row, entity, relationMaps, rowNum, tempResult);
      if (!data) {
        // Absorb errors from tempResult and abort
        result.errors.push(...tempResult.errors.slice(result.errors.length));
        throw new Error(tempResult.errors[tempResult.errors.length - 1] ?? `Row ${rowNum}: relation resolution failed`);
      }

      coerceTypes(data, entity);
      const cleanData = stripUnknownFields(data, entity);

      const validationErrors = validateEntity(entityName, cleanData);
      if (validationErrors.length > 0) {
        const msgs = validationErrors.map((e) => `Row ${rowNum}: ${e}`);
        result.errors.push(...msgs);
        throw new Error(msgs[0]);
      }

      const existingId = findExistingRecord(cleanData, existingRecords, upsertKeys, entity);
      prepared.push({ rowNum, cleanData, existingId });
    }

    // All rows valid — execute writes atomically.
    await prisma.$transaction(
      async (tx) => {
        const txClient = tx as unknown as Record<string, Record<string, Function>>;
        const modelKey = entityName.charAt(0).toLowerCase() + toPascalCase(entityName).slice(1);
        const model = txClient[modelKey];
        if (!model) throw new Error(`No Prisma model found for entity "${entityName}"`);

        for (const { cleanData, existingId } of prepared) {
          const transformed = transformInput(entityName, cleanData, entity);
          if (existingId) {
            await model.update({ where: { id: existingId }, data: transformed });
            result.updated++;
          } else {
            const created = await model.create({ data: transformed }) as Row;
            existingRecords.push({ id: created.id as number, ...cleanData });
            result.created++;
          }
        }
      },
      { timeout: 60_000 }
    );

    return result;
  }

  // Lenient mode (skipInvalid: true): process row by row, skip failures.
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

      // Validate against schema (previously missing — see security tests)
      const validationErrors = validateEntity(entityName, cleanData);
      if (validationErrors.length > 0) {
        for (const err of validationErrors) {
          result.errors.push(`Row ${rowNum}: ${err}`);
        }
        result.skipped++;
        continue;
      }

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
      result.skipped++;
    }
  }

  return result;
}

/**
 * Build name→id lookup maps for all belongs_to relations on an entity.
 */
interface RelationLookup {
  nameToId: Map<string, number>;
  validIds: Set<number>;
}

async function buildRelationMaps(
  entity: EntityConfig
): Promise<Record<string, RelationLookup>> {
  const maps: Record<string, RelationLookup> = {};

  if (!entity.relations) return maps;

  for (const [relName, rel] of Object.entries(entity.relations)) {
    const records = (await findAll(rel.entity)) as Row[];
    const nameToId = new Map<string, number>();
    const validIds = new Set<number>();
    for (const record of records) {
      const id = record.id as number;
      validIds.add(id);
      const name = String(record.name ?? "").toLowerCase().trim();
      if (name) {
        nameToId.set(name, id);
      }
    }
    maps[relName] = { nameToId, validIds };
  }

  return maps;
}

/**
 * Load existing records for upsert matching, using pagination to avoid
 * unbounded in-memory loads. Only fetches the fields needed for upsert
 * comparison (id, schema fields, and relation FKs).
 */
async function loadExistingRecords(
  entityName: string,
  entity: EntityConfig
): Promise<Row[]> {
  const PAGE_SIZE = 200;
  const allRecords: Row[] = [];
  let page = 1;

  while (true) {
    const result = await findAll(entityName, { page, pageSize: PAGE_SIZE }) as {
      items: Row[];
      totalCount: number;
      page: number;
      pageSize: number;
    };
    allRecords.push(...result.items);
    if (allRecords.length >= result.totalCount) break;
    page++;
  }

  return allRecords.map((r) => {
    const flat: Row = { id: r.id };
    // Copy schema fields
    for (const fieldName of Object.keys(entity.fields)) {
      flat[fieldName] = r[fieldName];
    }
    // Copy relation IDs
    if (entity.relations) {
      for (const relName of Object.keys(entity.relations)) {
        const fkKey = foreignKeyName(relName);
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
  relationMaps: Record<string, RelationLookup>,
  rowNum: number,
  result: ImportResult
): Row | null {
  const data: Row = { ...row };

  if (!entity.relations) return data;

  for (const [relName, rel] of Object.entries(entity.relations)) {
    const idKey = `${relName}_id`;
    const nameKey = `${relName}_name`;
    const rawId = data[idKey];
    const rawName = data[nameKey] ?? data[relName];

    // Remove synthetic fields — they're not real schema fields
    delete data[idKey];
    delete data[nameKey];

    const lookup = relationMaps[relName];

    // Prefer FK ID (exact pointer — same-database roundtrip)
    // Block ID-based resolution for sensitive relations (e.g. user)
    if (rawId && !isNaN(Number(rawId)) && !isSensitive(rel.entity)) {
      const numId = Number(rawId);
      if (!lookup?.validIds.has(numId)) {
        result.errors.push(
          `Row ${rowNum}: ${rel.entity} ID ${numId} does not exist`
        );
        result.skipped++;
        return null;
      }
      data[relName] = numId;
    } else if (rawName && typeof rawName === "string") {
      // Fall back to name resolution (cross-database import)
      const name = rawName.toLowerCase().trim();
      const id = lookup?.nameToId.get(name);

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
        // Stays as string here — field-type normalize() handles Date conversion
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
          recVal = record[foreignKeyName(relName)];
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
