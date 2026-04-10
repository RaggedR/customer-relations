/**
 * Hearing Aid Import API
 *
 * POST /api/hearing-aid/import
 * Content-Type: multipart/form-data
 *
 * Accepts an xlsx, csv, or json file. Each row must have a
 * "Patient Name" column to link to an existing patient.
 *
 * - If a hearing aid with the same serial_number already exists
 *   for that patient, it is updated (upsert).
 * - Otherwise, a new record is created.
 *
 * Returns a summary of created/updated/skipped rows.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { findAll, create, update } from "@/lib/repository";

/** Maps spreadsheet column headers to schema field names */
const HEADER_MAP: Record<string, string> = {
  "patient name": "patient_name",
  "ear": "ear",
  "make": "make",
  "model": "model",
  "serial number": "serial_number",
  "battery type": "battery_type",
  "wax filter": "wax_filter",
  "dome": "dome",
  "programming cable": "programming_cable",
  "programming software": "programming_software",
  "hsp code": "hsp_code",
  "warranty end date": "warranty_end_date",
  "last repair details": "last_repair_details",
  "repair address": "repair_address",
};

type Row = Record<string, unknown>;

async function getPatientMap(): Promise<Map<string, number>> {
  const patients = (await findAll("patient")) as Row[];
  const map = new Map<string, number>();
  for (const p of patients) {
    const name = String(p.name ?? "").toLowerCase().trim();
    if (name) map.set(name, p.id as number);
  }
  return map;
}

async function getExistingAids(): Promise<
  Map<string, { id: number; patientId: number }>
> {
  const aids = (await findAll("hearing_aid")) as Row[];
  const map = new Map<string, { id: number; patientId: number }>();
  for (const a of aids) {
    const serial = String(a.serial_number ?? "").trim();
    const pid = (a.patientId ?? a.patient_id) as number;
    if (serial && pid) {
      map.set(`${pid}:${serial}`, { id: a.id as number, patientId: pid });
    }
  }
  return map;
}

function normaliseHeader(h: string): string {
  return HEADER_MAP[h.toLowerCase().trim()] || h.toLowerCase().trim();
}

function parseRows(raw: Row[]): Row[] {
  return raw.map((row) => {
    const out: Row = {};
    for (const [key, val] of Object.entries(row)) {
      out[normaliseHeader(key)] = val;
    }
    return out;
  });
}

async function parseXlsx(buffer: Buffer): Promise<Row[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNum) => {
    headers[colNum] = String(cell.value ?? "");
  });

  const rows: Row[] = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Row = {};
    row.eachCell((cell, colNum) => {
      const header = headers[colNum];
      if (header) obj[header] = cell.value;
    });
    rows.push(obj);
  });

  return parseRows(rows);
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const obj: Row = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });
    rows.push(obj);
  }
  return parseRows(rows);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseJson(text: string): Row[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  return parseRows(arr);
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  let rows: Row[];
  try {
    if (ext === "xlsx" || ext === "xls") {
      rows = await parseXlsx(buffer);
    } else if (ext === "csv") {
      rows = parseCsv(buffer.toString("utf-8"));
    } else if (ext === "json") {
      rows = parseJson(buffer.toString("utf-8"));
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use .xlsx, .csv, or .json" },
        { status: 400 }
      );
    }
  } catch (parseError) {
    return NextResponse.json(
      { error: `Failed to parse file: ${(parseError as Error).message}` },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "File contains no data rows" },
      { status: 400 }
    );
  }

  const patientMap = await getPatientMap();
  const existingAids = await getExistingAids();

  const results = {
    created: 0,
    updated: 0,
    skipped: [] as string[],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const patientName = String(row.patient_name ?? "")
      .toLowerCase()
      .trim();

    if (!patientName) {
      results.skipped.push(`Row ${i + 2}: missing Patient Name`);
      continue;
    }

    const patientId = patientMap.get(patientName);
    if (!patientId) {
      results.skipped.push(
        `Row ${i + 2}: patient "${row.patient_name}" not found`
      );
      continue;
    }

    const data: Row = { patient: patientId };
    for (const field of [
      "ear",
      "make",
      "model",
      "serial_number",
      "battery_type",
      "wax_filter",
      "dome",
      "programming_cable",
      "programming_software",
      "hsp_code",
      "warranty_end_date",
      "last_repair_details",
      "repair_address",
    ]) {
      const val = row[field];
      if (val !== undefined && val !== null && val !== "") {
        data[field] = val;
      }
    }

    // Upsert by serial_number + patientId
    const serial = String(data.serial_number ?? "").trim();
    const existingKey = serial ? `${patientId}:${serial}` : "";
    const existing = existingKey ? existingAids.get(existingKey) : null;

    try {
      if (existing) {
        await update("hearing_aid", existing.id, data);
        results.updated++;
      } else {
        await create("hearing_aid", data);
        results.created++;
      }
    } catch (err) {
      results.skipped.push(
        `Row ${i + 2}: ${(err as Error).message}`
      );
    }
  }

  return NextResponse.json({
    total: rows.length,
    created: results.created,
    updated: results.updated,
    skipped: results.skipped.length,
    errors: results.skipped,
  });
}
