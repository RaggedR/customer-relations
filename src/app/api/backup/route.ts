/**
 * Backup API — JSON Full Export
 *
 * GET /api/backup
 *
 * Exports all entities as a single JSON file. More portable than
 * pg_dump — can be imported into a different database engine or
 * even a different system entirely.
 *
 * The import engine (POST /api/{entity}/import) can re-import each
 * entity from this backup. Import order matters due to FK dependencies:
 * nurse → patient → children → appointment → attachment
 */

import { NextResponse } from "next/server";
import { getSchema } from "@/engine/schema-loader";
import { findAll } from "@/lib/repository";

type Row = Record<string, unknown>;

/**
 * Determine the correct import order based on FK dependencies.
 * Entities with no relations come first, then entities that depend on them.
 */
function getImportOrder(schema: ReturnType<typeof getSchema>): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);

    const entity = schema.entities[name];
    if (entity?.relations) {
      for (const rel of Object.values(entity.relations)) {
        visit(rel.entity);
      }
    }
    ordered.push(name);
  }

  for (const name of Object.keys(schema.entities)) {
    visit(name);
  }

  return ordered;
}

export async function GET() {
  try {
    const schema = getSchema();
    const importOrder = getImportOrder(schema);

    const entities: Record<string, Row[]> = {};

    // Entities with credentials — skip entirely (tokens must be re-authorized after restore)
    const SENSITIVE_ENTITIES = ["calendar_connection"];

    for (const entityName of importOrder) {
      if (SENSITIVE_ENTITIES.includes(entityName)) continue;

      const records = (await findAll(entityName)) as Row[];
      // Strip nested relation objects — just keep flat fields + FK IDs
      entities[entityName] = records.map((record) => {
        const flat: Row = {};
        const entity = schema.entities[entityName];

        // Core fields
        flat.id = record.id;
        flat.createdAt = record.createdAt;
        flat.updatedAt = record.updatedAt;

        // Schema fields
        for (const fieldName of Object.keys(entity.fields)) {
          flat[fieldName] = record[fieldName] ?? null;
        }

        // FK IDs (not nested objects)
        if (entity.relations) {
          for (const relName of Object.keys(entity.relations)) {
            const fkKey = `${relName}Id`;
            flat[fkKey] = record[fkKey] ?? null;

            // Also include parent name for human readability + re-import
            const parent = record[relName] as Row | null;
            if (parent?.name) {
              flat[`${relName}_name`] = parent.name;
            }
          }
        }

        return flat;
      });
    }

    const backup = {
      exported_at: new Date().toISOString(),
      version: "1.0",
      import_order: importOrder,
      entity_counts: Object.fromEntries(
        Object.entries(entities).map(([name, rows]) => [name, rows.length])
      ),
      entities,
    };

    const dateStr = new Date().toISOString().split("T")[0];

    return NextResponse.json(backup, {
      headers: {
        "Content-Disposition": `attachment; filename="backup-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error("Backup error:", error);
    return NextResponse.json(
      { error: "Backup failed" },
      { status: 500 }
    );
  }
}
