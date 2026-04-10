/**
 * Hearing Aid Export API
 *
 * GET /api/hearing-aid/export?format=xlsx|csv|json
 *
 * Exports all hearing aid records with the patient name included.
 * Defaults to xlsx if no format specified.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { findAll } from "@/lib/repository";

const COLUMNS = [
  { key: "patient_name", header: "Patient Name" },
  { key: "ear", header: "Ear" },
  { key: "make", header: "Make" },
  { key: "model", header: "Model" },
  { key: "serial_number", header: "Serial Number" },
  { key: "battery_type", header: "Battery Type" },
  { key: "wax_filter", header: "Wax Filter" },
  { key: "dome", header: "Dome" },
  { key: "programming_cable", header: "Programming Cable" },
  { key: "programming_software", header: "Programming Software" },
  { key: "hsp_code", header: "HSP Code" },
  { key: "warranty_end_date", header: "Warranty End Date" },
  { key: "last_repair_details", header: "Last Repair Details" },
  { key: "repair_address", header: "Repair Address" },
] as const;

type Row = Record<string, unknown>;

function flattenRow(item: Row): Record<string, string> {
  const patient = item.patient as Row | null;
  const row: Record<string, string> = {};
  row.patient_name = patient ? String(patient.name ?? "") : "";
  for (const col of COLUMNS) {
    if (col.key === "patient_name") continue;
    const val = item[col.key];
    if (val === null || val === undefined) {
      row[col.key] = "";
    } else if (col.key === "warranty_end_date" && val) {
      row[col.key] = new Date(val as string).toISOString().split("T")[0];
    } else {
      row[col.key] = String(val);
    }
  }
  return row;
}

export async function GET(request: NextRequest) {
  const format =
    request.nextUrl.searchParams.get("format")?.toLowerCase() || "xlsx";

  if (!["xlsx", "csv", "json"].includes(format)) {
    return NextResponse.json(
      { error: "format must be xlsx, csv, or json" },
      { status: 400 }
    );
  }

  try {
    const items = (await findAll("hearing_aid")) as Row[];
    const rows = items.map(flattenRow);

    if (format === "json") {
      return NextResponse.json(rows, {
        headers: {
          "Content-Disposition":
            'attachment; filename="hearing-aids.json"',
        },
      });
    }

    if (format === "csv") {
      const header = COLUMNS.map((c) => c.header).join(",");
      const lines = rows.map((row) =>
        COLUMNS.map((c) => {
          const val = row[c.key] ?? "";
          // Quote fields that contain commas, quotes, or newlines
          if (/[,"\n\r]/.test(val)) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(",")
      );
      const csv = [header, ...lines].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="hearing-aids.csv"',
        },
      });
    }

    // xlsx
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Hearing Aids");

    sheet.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.key === "last_repair_details" || c.key === "repair_address"
        ? 30
        : c.key === "patient_name"
          ? 25
          : 18,
    }));

    // Style the header row
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
        "Content-Disposition":
          'attachment; filename="hearing-aids.xlsx"',
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export hearing aids" },
      { status: 500 }
    );
  }
}
