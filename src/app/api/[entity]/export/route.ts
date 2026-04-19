/**
 * Generic Export API
 *
 * GET /api/{entity}/export?format=xlsx|csv|json
 *
 * Schema-driven export for any entity. Column headers come from
 * representations.csv.headers in schema.yaml.
 *
 * Includes parent relation names (e.g. "Patient Name" for hearing aids).
 */

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSchema, getCsvRepresentation, isSensitive } from "@/lib/schema";
import { findAll } from "@/lib/repository";
import { adminRoute } from "@/lib/middleware";
import type { Row } from "@/lib/parsers";

/**
 * Build column definitions from the schema and CSV representation.
 * Returns { key, header } pairs for each field + parent relation names.
 */
/** Title-case a snake_case string: "hearing_aid" → "Hearing Aid" */
function toTitleCase(s: string): string {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function buildColumns(entityName: string) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  const csvRep = getCsvRepresentation(entityName);
  const headers = csvRep.headers ?? {};

  const columns: { key: string; header: string }[] = [];
  const relationKeys = new Set<string>();

  // Add parent relation ID + name columns (skip sensitive relations like user)
  if (entity.relations) {
    for (const [relName, rel] of Object.entries(entity.relations)) {
      if (isSensitive(rel.entity)) continue;
      const parentEntity = schema.entities[rel.entity];
      if (parentEntity?.fields.name) {
        const idKey = `${relName}_id`;
        const nameKey = `${relName}_name`;
        relationKeys.add(idKey);
        relationKeys.add(nameKey);
        // FK ID column — enables exact roundtrip (same-database reimport)
        columns.push({ key: idKey, header: toTitleCase(rel.entity) + " ID" });
        // Name column — human-readable, used as fallback for cross-database import
        columns.push({ key: nameKey, header: headers[relName] ?? toTitleCase(rel.entity) + " Name" });
      }
    }
  }

  // Add entity fields
  for (const fieldName of Object.keys(entity.fields)) {
    columns.push({
      key: fieldName,
      header: headers[fieldName] ?? toTitleCase(fieldName),
    });
  }

  return { columns, relationKeys };
}

/**
 * Flatten a hydrated record into a row with string values.
 */
function flattenRow(
  item: Row,
  entityName: string,
  columns: { key: string; header: string }[],
  relationKeys: Set<string>
): Record<string, string> {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  const row: Record<string, string> = {};

  for (const col of columns) {
    // Handle relation columns (ID and name) — identified by the Set built in buildColumns,
    // not by suffix pattern matching, to avoid collisions with fields like google_calendar_id
    if (relationKeys.has(col.key) && entity.relations) {
      const isId = col.key.endsWith("_id");
      const relName = col.key.replace(isId ? /_id$/ : /_name$/, "");
      const parent = item[relName] as Row | null;
      row[col.key] = parent
        ? String(isId ? (parent.id ?? "") : (parent.name ?? ""))
        : "";
      continue;
    }

    // Regular field
    const val = item[col.key];
    const fieldConfig = entity.fields[col.key];

    if (val === null || val === undefined) {
      row[col.key] = "";
    } else if (
      fieldConfig &&
      (fieldConfig.type === "date" || fieldConfig.type === "datetime") &&
      val
    ) {
      const d = new Date(val as string);
      row[col.key] = fieldConfig.type === "date"
        ? d.toISOString().split("T")[0]
        : d.toISOString();
    } else {
      row[col.key] = String(val);
    }
  }

  return row;
}

export const GET = adminRoute()
  .named("GET /api/[entity]/export")
  .handle(async (ctx) => {
    const routeParams = ctx._routeParams;
    const resolved = routeParams?.params ? await routeParams.params : null;
    const rawEntity = resolved?.entity;
    if (!rawEntity) {
      return NextResponse.json({ error: "Missing entity parameter" }, { status: 400 });
    }
    const entityName = rawEntity.replace(/-/g, "_");

    // Validate entity exists
    const schema = getSchema();
    if (!schema.entities[entityName]) {
      return NextResponse.json(
        { error: `Unknown entity: ${entityName}` },
        { status: 404 },
      );
    }

    if (isSensitive(entityName)) {
      return NextResponse.json(
        { error: `Export of ${entityName} is not allowed` },
        { status: 403 },
      );
    }

    const format =
      ctx.request.nextUrl.searchParams.get("format")?.toLowerCase() || "xlsx";

    if (!["xlsx", "csv", "json"].includes(format)) {
      return NextResponse.json(
        { error: "format must be xlsx, csv, or json" },
        { status: 400 },
      );
    }

    const slug = entityName.replace(/_/g, "-");
    const items = (await findAll(entityName)) as Row[];
    const { columns, relationKeys } = buildColumns(entityName);
    const rows = items.map((item) => flattenRow(item, entityName, columns, relationKeys));

    ctx.audit({
      action: "export",
      entity: entityName,
      entityId: "*",
      details: `Exported ${items.length} ${entityName} records as ${format}`,
    });

    // ── JSON ──────────────────────────────────────────────
    if (format === "json") {
      return NextResponse.json(rows, {
        headers: {
          "Content-Disposition": `attachment; filename="${slug}s.json"`,
        },
      });
    }

    // ── CSV ───────────────────────────────────────────────
    if (format === "csv") {
      const header = columns.map((c) => c.header).join(",");
      const lines = rows.map((row) =>
        columns
          .map((c) => {
            const val = row[c.key] ?? "";
            if (/[,"\n\r]/.test(val)) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(",")
      );
      const csv = [header, ...lines].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}s.csv"`,
        },
      });
    }

    // ── xlsx ──────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    const sheetName = entityName
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") + "s";
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: 20,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };

    for (const row of rows) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${slug}s.xlsx"`,
      },
    });
  });
