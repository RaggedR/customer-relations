/**
 * Schema Naming Conventions
 *
 * The contract between schema.yaml and every runtime layer.
 * These functions define how YAML entity/field/relation names
 * map to Prisma model names, DB column names, FK fields, and
 * reverse-relation keys.
 *
 * This is the single source of truth — used by the Prisma generator,
 * repository, import engine, and UI components (via re-exports in
 * the Schema Facade at lib/schema.ts).
 */

/** YAML entity name → Prisma model name (e.g. "clinical_note" → "ClinicalNote") */
export function toPascalCase(str: string): string {
  return str
    .split(/[_\-\s]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** YAML field/entity name → DB column name (e.g. "dateOfBirth" → "date_of_birth") */
export function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Compute the Prisma reverse-relation field name for an entity.
 * Prisma uses the plural form for one-to-many: "referrals", "clinical_notes", etc.
 *
 * Used by the Prisma generator, repository (include clauses), and UI detail panel.
 */
export function reverseRelationKey(entityName: string): string {
  return `${entityName}s`;
}

/**
 * Compute the foreign key column name for a belongs_to relation.
 * e.g. "patient" → "patientId", "clinical_note" → "clinical_noteId"
 *
 * Used by the Prisma generator, repository (input transforms),
 * import engine (relation resolution), and schema hierarchy (parent mapping).
 */
export function foreignKeyName(relationName: string): string {
  return `${relationName}Id`;
}
