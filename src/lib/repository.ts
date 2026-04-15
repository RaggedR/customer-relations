/**
 * Generic Repository (Repository pattern)
 *
 * Abstracts Prisma operations behind a generic interface.
 * Each entity gets the same CRUD operations, driven by schema config.
 */

import { prisma } from "./prisma";
import { getSchema, EntityConfig, validateFieldValue, toSnakeCase, toPascalCase, reverseRelationKey, foreignKeyName, getFieldType } from "@/lib/schema";

/**
 * Get the Prisma model delegate for an entity name.
 * e.g., "contact" → prisma.contact
 */
function getModelDelegate(entityName: string) {
  const key = entityName.charAt(0).toLowerCase() + toPascalCase(entityName).slice(1);
  const delegate = (prisma as unknown as Record<string, unknown>)[key];
  if (!delegate) {
    throw new Error(`No Prisma model found for entity "${entityName}"`);
  }
  return delegate as Record<string, Function>;
}

/**
 * Build the Prisma `include` clause for relations.
 * Includes both forward relations (belongs_to) and reverse relations
 * (other entities that belong_to this one).
 */
function buildIncludes(
  entityName: string,
  entity: EntityConfig
): Record<string, boolean> {
  const schema = getSchema();
  const includes: Record<string, boolean> = {};

  // Forward relations (belongs_to)
  if (entity.relations) {
    for (const relName of Object.keys(entity.relations)) {
      includes[relName] = true;
    }
  }

  // Reverse relations (other entities that belong_to this one)
  for (const [otherName, otherEntity] of Object.entries(schema.entities)) {
    if (otherName === entityName || !otherEntity.relations) continue;
    for (const rel of Object.values(otherEntity.relations)) {
      if (rel.entity === entityName) {
        // Prisma uses the plural form: "referrals", "clinical_notes", etc.
        includes[reverseRelationKey(otherName)] = true;
        break;
      }
    }
  }

  return includes;
}

/**
 * Convert incoming data keys to snake_case for Prisma,
 * and map relation references to foreign key IDs.
 */
function transformInput(
  entityName: string,
  data: Record<string, unknown>,
  entity: EntityConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip id, createdAt, updatedAt
    if (["id", "createdAt", "updatedAt"].includes(key)) continue;

    // Check if this is a relation field
    if (entity.relations && entity.relations[key]) {
      result[foreignKeyName(toSnakeCase(key))] = value ? Number(value) : null;
      continue;
    }

    // Regular field — normalize via field-type registry
    const snakeKey = toSnakeCase(key);
    const fieldConfig = entity.fields[key] || entity.fields[snakeKey];
    if (fieldConfig) {
      const ft = getFieldType(fieldConfig.type);
      result[snakeKey] = ft.normalize && value !== null && value !== undefined
        ? ft.normalize(value)
        : value;
    }
  }

  return result;
}

/**
 * Validate incoming data against the schema.
 */
export function validateEntity(
  entityName: string,
  data: Record<string, unknown>
): string[] {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) return [`Unknown entity: ${entityName}`];

  const errors: string[] = [];

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const value = data[fieldName] ?? data[toSnakeCase(fieldName)];

    // Required check
    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`${fieldName} is required`);
      continue;
    }

    // Type validation (skip if optional and empty)
    if (value !== undefined && value !== null && value !== "") {
      if (!validateFieldValue(field.type, value, { values: field.values })) {
        errors.push(`${fieldName} must be a valid ${field.type}`);
      }
    }
  }

  return errors;
}

// --- CRUD Operations ---

/**
 * Find all records for an entity, with optional search, sort, filter, and date range.
 *
 * @param options.search — Full-text search across all string/text/email/phone/url fields (case-insensitive)
 * @param options.sortBy — Schema field name to sort by (converted to snake_case for Prisma)
 * @param options.filterBy — Exact-match filters. Accepts both schema relation names (e.g. `{ patient: 5 }`)
 *   and Prisma FK keys (e.g. `{ patientId: 5 }`). Relation names are auto-mapped to FK keys.
 * @param options.dateRange — Filter by date range; `field` is a schema field name (e.g. "date", not "date_of_birth")
 */
export async function findAll(
  entityName: string,
  options?: {
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    filterBy?: Record<string, unknown>;
    dateRange?: { field: string; from: string; to: string };
    page?: number;      // 1-based page number — when set, returns { items, totalCount, page, pageSize }
    pageSize?: number;  // default 50
    shallow?: boolean;  // skip relation includes (for list views that only need top-level fields)
  }
) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);

  const args: Record<string, unknown> = {};

  // Include relations unless shallow mode is requested (list views don't need nested data)
  if (!options?.shallow) {
    const includes = buildIncludes(entityName, entity);
    if (Object.keys(includes).length > 0) {
      args.include = includes;
    }
  }

  const whereConditions: Record<string, unknown>[] = [];

  // Exact-match filters — resolve relation names to FK keys (e.g. patient → patientId)
  if (options?.filterBy) {
    for (const [key, value] of Object.entries(options.filterBy)) {
      const fkKey = entity.relations?.[key] ? foreignKeyName(key) : key;
      whereConditions.push({ [fkKey]: value });
    }
  }

  // Date range filter (e.g. calendar view: dateFrom/dateTo)
  if (options?.dateRange) {
    const { field, from, to } = options.dateRange;
    whereConditions.push({
      [toSnakeCase(field)]: {
        gte: new Date(from),
        lte: new Date(to),
      },
    });
  }

  // Search across string fields
  if (options?.search) {
    const orConditions = Object.entries(entity.fields)
      .filter(([, f]) => ["string", "text", "email", "phone", "url"].includes(f.type))
      .map(([fieldName]) => ({
        [toSnakeCase(fieldName)]: {
          contains: options.search,
          mode: "insensitive",
        },
      }));
    if (orConditions.length > 0) {
      whereConditions.push({ OR: orConditions });
    }
  }

  if (whereConditions.length > 0) {
    args.where =
      whereConditions.length === 1
        ? whereConditions[0]
        : { AND: whereConditions };
  }

  // Sorting — validate sortBy against known schema fields
  if (options?.sortBy) {
    const validSortFields = new Set([...Object.keys(entity.fields), "createdAt", "updatedAt"]);
    if (!validSortFields.has(options.sortBy)) {
      throw new Error(`Invalid sort field: ${options.sortBy}`);
    }
    args.orderBy = { [toSnakeCase(options.sortBy)]: options.sortOrder || "asc" };
  } else {
    args.orderBy = { createdAt: "desc" };
  }

  // Pagination — when page is provided, return { items, totalCount, page, pageSize }
  if (options?.page) {
    const MAX_PAGE_SIZE = 200;
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? 50));
    const page = Math.max(1, options.page);
    args.take = pageSize;
    args.skip = (page - 1) * pageSize;

    const [items, totalCount] = await Promise.all([
      model.findMany(args),
      model.count(args.where ? { where: args.where } : {}),
    ]);

    return { items, totalCount, page, pageSize };
  }

  // No pagination — cap to 1000 rows to prevent unbounded queries.
  // Callers that need more should use the page parameter.
  if (args.take === undefined) {
    args.take = 1000;
  }

  return model.findMany(args);
}

export async function findById(entityName: string, id: number) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);
  const includes = buildIncludes(entityName, entity);

  const args: Record<string, unknown> = { where: { id } };
  if (Object.keys(includes).length > 0) {
    args.include = includes;
  }

  return model.findUnique(args);
}

export async function create(
  entityName: string,
  data: Record<string, unknown>
) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);
  const transformed = transformInput(entityName, data, entity);
  const includes = buildIncludes(entityName, entity);

  const args: Record<string, unknown> = { data: transformed };
  if (Object.keys(includes).length > 0) {
    args.include = includes;
  }

  return model.create(args);
}

export async function update(
  entityName: string,
  id: number,
  data: Record<string, unknown>,
  options?: { expectedUpdatedAt?: string }
) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);
  const transformed = transformInput(entityName, data, entity);
  const includes = buildIncludes(entityName, entity);

  // Optimistic locking: if the caller provides an expected updatedAt, use
  // updateMany with a WHERE clause that includes updated_at. This is atomic
  // at the DB level — a single UPDATE ... WHERE id = ? AND updated_at = ?.
  if (options?.expectedUpdatedAt) {
    const result = await model.updateMany({
      where: { id, updated_at: new Date(options.expectedUpdatedAt) },
      data: transformed,
    });
    if (result.count === 0) {
      const existing = await model.findUnique({ where: { id } });
      if (!existing) throw new Error(`Record not found: ${entityName}#${id}`);
      throw new Error("CONFLICT");
    }
    // Fetch the updated record with includes for the response
    const args: Record<string, unknown> = { where: { id } };
    if (Object.keys(includes).length > 0) {
      args.include = includes;
    }
    return model.findUnique(args);
  }

  const args: Record<string, unknown> = {
    where: { id },
    data: transformed,
  };
  if (Object.keys(includes).length > 0) {
    args.include = includes;
  }

  return model.update(args);
}

export async function remove(entityName: string, id: number) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);
  return model.delete({ where: { id } });
}
