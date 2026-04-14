/**
 * Field Type Registry (Abstract Factory pattern)
 *
 * Each field type defines:
 * - prismaType: The Prisma scalar type for DB column generation
 * - validate: Runtime validation function
 * - htmlInputType: HTML input type for auto-generated forms
 *
 * Design decision: DB types and UI types live together deliberately.
 * The coupling is one field (htmlInputType) and keeps the registry as
 * a single lookup for all three concerns. Splitting would add a file
 * and import chain for minimal gain. See docs/ARCHITECTURE-REVIEW.md.
 */

export interface FieldTypeDefinition {
  prismaType: string;
  validate: (value: unknown) => boolean;
  htmlInputType: string;
  /** Normalize a value for persistence. Converts any accepted input representation
   *  to the canonical form expected by Prisma. Called by repository.transformInput. */
  normalize?: (value: unknown) => unknown;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[+]?[\d\s\-().]+$/;
const urlRegex = /^https?:\/\/.+/;

export const fieldTypes: Record<string, FieldTypeDefinition> = {
  string: {
    prismaType: "String",
    validate: (v) => typeof v === "string",
    htmlInputType: "text",
  },
  text: {
    prismaType: "String",
    validate: (v) => typeof v === "string",
    htmlInputType: "textarea",
  },
  email: {
    prismaType: "String",
    validate: (v) => typeof v === "string" && emailRegex.test(v as string),
    htmlInputType: "email",
  },
  phone: {
    prismaType: "String",
    validate: (v) => typeof v === "string" && phoneRegex.test(v as string),
    htmlInputType: "tel",
  },
  url: {
    prismaType: "String",
    validate: (v) => typeof v === "string" && urlRegex.test(v as string),
    htmlInputType: "url",
  },
  number: {
    prismaType: "Float",
    validate: (v) => typeof v === "number" && !isNaN(v as number),
    htmlInputType: "number",
    normalize: (v) => (v !== null && v !== undefined ? Number(v) : null),
  },
  date: {
    prismaType: "DateTime",
    validate: (v) => typeof v === "string" && !isNaN(Date.parse(v as string)),
    htmlInputType: "date",
    normalize: (v) => (v instanceof Date ? v : v ? new Date(v as string) : null),
  },
  datetime: {
    prismaType: "DateTime",
    validate: (v) => typeof v === "string" && !isNaN(Date.parse(v as string)),
    htmlInputType: "datetime-local",
    normalize: (v) => (v instanceof Date ? v : v ? new Date(v as string) : null),
  },
  enum: {
    prismaType: "String",
    validate: (v) => typeof v === "string",
    htmlInputType: "select",
  },
  boolean: {
    prismaType: "Boolean",
    validate: (v) => typeof v === "boolean",
    htmlInputType: "checkbox",
  },
  time: {
    prismaType: "String",
    validate: (v) => typeof v === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(v as string),
    htmlInputType: "time",
  },
  json: {
    prismaType: "Json",
    validate: (v) => v !== undefined,
    htmlInputType: "textarea",
  },
};

export function getFieldType(typeName: string): FieldTypeDefinition {
  const ft = fieldTypes[typeName];
  if (!ft) {
    throw new Error(`Unknown field type: "${typeName}". Available types: ${Object.keys(fieldTypes).join(", ")}`);
  }
  return ft;
}

export function validateFieldValue(
  typeName: string,
  value: unknown,
  options?: { values?: string[] }
): boolean {
  const ft = getFieldType(typeName);
  if (!ft.validate(value)) return false;

  // Enum: check against allowed values
  if (typeName === "enum" && options?.values) {
    return options.values.includes(value as string);
  }

  return true;
}
