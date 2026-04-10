/**
 * Generic Repository (Repository pattern)
 *
 * Abstracts Prisma operations behind a generic interface.
 * Each entity gets the same CRUD operations, driven by schema config.
 */

import { prisma } from "./prisma";
import { getSchema, EntityConfig } from "../engine/schema-loader";
import { validateFieldValue } from "../engine/field-types";

function toPascalCase(str: string): string {
  return str
    .split(/[_\-\s]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

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
        includes[`${otherName}s`] = true;
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
      const fkName = `${toSnakeCase(key)}Id`;
      result[fkName] = value ? Number(value) : null;
      continue;
    }

    // Regular field
    const snakeKey = toSnakeCase(key);
    const fieldConfig = entity.fields[key] || entity.fields[snakeKey];
    if (fieldConfig) {
      if (fieldConfig.type === "number" && value !== null && value !== undefined) {
        result[snakeKey] = Number(value);
      } else if (
        (fieldConfig.type === "date" || fieldConfig.type === "datetime") &&
        value
      ) {
        result[snakeKey] = new Date(value as string);
      } else {
        result[snakeKey] = value;
      }
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

export async function findAll(
  entityName: string,
  options?: {
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    filterBy?: Record<string, unknown>;
  }
) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);
  const includes = buildIncludes(entityName, entity);

  const args: Record<string, unknown> = {};
  if (Object.keys(includes).length > 0) {
    args.include = includes;
  }

  const whereConditions: Record<string, unknown>[] = [];

  // Exact-match filters (e.g. patientId=5)
  if (options?.filterBy) {
    for (const [key, value] of Object.entries(options.filterBy)) {
      whereConditions.push({ [key]: value });
    }
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

  // Sorting
  if (options?.sortBy) {
    args.orderBy = { [toSnakeCase(options.sortBy)]: options.sortOrder || "asc" };
  } else {
    args.orderBy = { createdAt: "desc" };
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
  data: Record<string, unknown>
) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const model = getModelDelegate(entityName);
  const transformed = transformInput(entityName, data, entity);
  const includes = buildIncludes(entityName, entity);

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
