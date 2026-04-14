/**
 * Auto-Generate AI Schema Description from schema.yaml
 *
 * Produces a PostgreSQL DDL string that describes the database schema
 * for the AI query endpoint. This replaces the hardcoded SCHEMA_DESCRIPTION
 * constant, ensuring the AI always sees the current schema.
 *
 * Sensitive entities (calendar_connection, user, session, audit_log) are
 * excluded by default — they contain OAuth tokens, credentials, or audit
 * records that the AI must never see. The excluded set is the single source
 * of truth in SENSITIVE_ENTITIES (api-helpers.ts).
 */

import { getSchema, fieldTypes, toPascalCase } from "@/lib/schema";
import { SENSITIVE_ENTITIES } from "@/lib/api-helpers";

/** Map Prisma types to SQL types for the DDL */
const PRISMA_TO_SQL: Record<string, string> = {
  String: "TEXT",
  Float: "FLOAT",
  Int: "INT",
  DateTime: "TIMESTAMP",
  Boolean: "BOOLEAN",
  Json: "JSONB",
};

export function generateSchemaDescription(
  exclude: readonly string[] = SENSITIVE_ENTITIES
): string {
  const schema = getSchema();
  const lines: string[] = [
    "PostgreSQL database with these tables:",
  ];

  for (const [entityName, entity] of Object.entries(schema.entities)) {
    if (exclude.includes(entityName)) continue;

    const modelName = toPascalCase(entityName);
    lines.push("");
    lines.push(`"${modelName}" (`);
    lines.push(`  id SERIAL PRIMARY KEY,`);
    lines.push(`  "createdAt" TIMESTAMP DEFAULT now(),`);
    lines.push(`  "updatedAt" TIMESTAMP,`);

    const fieldEntries = Object.entries(entity.fields);
    const relationEntries = entity.relations
      ? Object.entries(entity.relations).filter(
          ([, rel]) => !exclude.includes(rel.entity)
        )
      : [];

    // Filter out fields marked ai_visible: false (e.g. medicare_number)
    const visibleFields = fieldEntries.filter(([, f]) => f.ai_visible !== false);

    for (let i = 0; i < visibleFields.length; i++) {
      const [fieldName, field] = visibleFields[i];
      const ft = fieldTypes[field.type];
      const sqlType = PRISMA_TO_SQL[ft.prismaType] || "TEXT";
      const notNull = field.required ? " NOT NULL" : "";

      let comment = "";
      if (field.type === "enum" && field.values) {
        comment = ` -- values: ${field.values.map((v) => `'${v}'`).join(", ")}`;
      }

      const isLast = i === visibleFields.length - 1 && relationEntries.length === 0;
      const comma = isLast ? "" : ",";
      lines.push(`  ${fieldName} ${sqlType}${notNull}${comma}${comment}`);
    }

    // Foreign keys from relations
    for (let i = 0; i < relationEntries.length; i++) {
      const [relName, rel] = relationEntries[i];
      const refModel = toPascalCase(rel.entity);
      const isLast = i === relationEntries.length - 1;
      const comma = isLast ? "" : ",";
      lines.push(`  "${relName}Id" INT REFERENCES "${refModel}"(id)${comma}`);
    }

    lines.push(")");
  }

  return lines.join("\n");
}
