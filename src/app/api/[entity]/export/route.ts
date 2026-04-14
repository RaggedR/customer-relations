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

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSchema, getCsvRepresentation } from "@/lib/schema";
import { findAll } from "@/lib/repository";
import { withErrorHandler, SENSITIVE_ENTITIES } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/session";
import type { Row } from "@/lib/parsers";

interface RouteParams {
  params: Promise<{ entity: string }>;
}

/**
 * Build column definitions from the schema and CSV representation.
 * Returns { key, header } pairs for each field + parent relation names.
 */
function buildColumns(entityName: string) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  const csvRep = getCsvRepresentation(entityName);
  const headers = csvRep.headers ?? {};

  const columns: { key: string; header: string }[] = [];

  // Add parent relation name columns first
  if (entity.relations) {
    for (const [relName, rel] of Object.entries(entity.relations)) {
      const parentEntity = schema.entities[rel.entity];
      if (parentEntity?.fields.name) {
        const headerLabel = headers[relName] ??
          rel.entity.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + " Name";
        columns.push({
          key: `${relName}_name`,
          header: headerLabel,
        });
      }
    }
  }

  // Add entity fields
  for (const fieldName of Object.keys(entity.fields)) {
    columns.push({
      key: fieldName,
      header: headers[fieldName] ??
        fieldName.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    });
  }

  return columns;
}

/**
 * Flatten a hydrated record into a row with string values.
 */
function flattenRow(
  item: Row,
  entityName: string,
  columns: { key: string; header: string }[]
): Record<string, string> {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  const row: Record<string, string> = {};

  for (const col of columns) {
    // Handle parent relation name columns
    if (col.key.endsWith("_name") && entity.relations) {
      const relName = col.key.replace(/_name$/, "");
      if (entity.relations[relName]) {
        const parent = item[relName] as Row | null;
        row[col.key] = parent ? String(parent.name ?? "") : "";
        continue;
      }
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { entity: rawEntity } = await params;
  const entityName = rawEntity.replace(/-/g, "_");

  // Validate entity exists
  const schema = getSchema();
  if (!schema.entities[entityName]) {
    return NextResponse.json(
      { error: `Unknown entity: ${entityName}` },
      { status: 404 }
    );
  }

  if (SENSITIVE_ENTITIES.includes(entityName as typeof SENSITIVE_ENTITIES[number])) {
    return NextResponse.json(
      { error: `Export of ${entityName} is not allowed` },
      { status: 403 }
    );
  }

  const format =
    request.nextUrl.searchParams.get("format")?.toLowerCase() || "xlsx";

  if (!["xlsx", "csv", "json"].includes(format)) {
    return NextResponse.json(
      { error: "format must be xlsx, csv, or json" },
      { status: 400 }
    );
  }

  const slug = entityName.replace(/_/g, "-");

  return withErrorHandler(`GET /api/${entityName}/export`, async () => {
    const items = (await findAll(entityName)) as Row[];
    const columns = buildColumns(entityName);
    const rows = items.map((item) => flattenRow(item, entityName, columns));

    const session = await getSessionUser(request);
    logAuditEvent({
      userId: session?.userId ?? null,
      action: "export",
      entity: entityName,
      entityId: "*",
      details: `Exported ${items.length} ${entityName} records as ${format}`,
      ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
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
}
