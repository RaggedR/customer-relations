/**
 * File Format Parsers
 *
 * Parse any input format into an array of row objects.
 *
 * Public API: parseFile, Row, detectFormat
 * Internal: parseCsv, parseXlsx, parseJson, parseVCards
 *
 * Supported: xlsx/xls, csv, json, vcf (vCard)
 */

import ExcelJS from "exceljs";
import { getVCardRepresentation, reverseMapping } from "@/lib/schema";

export type Row = Record<string, unknown>;

// ── CSV Parser ──────────────────────────────────────────────

/**
 * Parse a CSV string into row objects.
 * Handles quoted fields with commas, quotes, and newlines.
 */
function parseCsv(text: string): Row[] {
  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    const obj: Row = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Split CSV text into logical lines, respecting quoted fields
 * that may contain newlines.
 */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      // Inside quotes: pass everything through unchanged.
      // Only track "" (escaped quote) to avoid exiting quote mode early.
      // Do NOT consume the second " — parseCsvLine handles unescaping.
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote — pass both through, stay in quote mode
          current += '""';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
          current += ch;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        current += ch;
      } else if (ch === "\n") {
        lines.push(current);
        current = "";
      } else if (ch === "\r") {
        // Skip \r, handle \r\n
        if (text[i + 1] === "\n") i++;
        lines.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

/**
 * Parse a single CSV line into field values.
 */
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

// ── xlsx Parser ─────────────────────────────────────────────

/**
 * Parse an xlsx buffer into row objects.
 */
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
    if (Object.keys(obj).length > 0) {
      rows.push(obj);
    }
  });

  return rows;
}

// ── JSON Parser ─────────────────────────────────────────────

/**
 * Parse a JSON string into row objects.
 * Handles arrays, { entities: { ... } } format, and single objects.
 */
function parseJson(text: string): Row[] {
  const data = JSON.parse(text);

  // Array of rows
  if (Array.isArray(data)) return data;

  // { entities: { entityName: [...] } } backup format
  if (data.entities && typeof data.entities === "object") {
    // Return the first entity array found
    for (const rows of Object.values(data.entities)) {
      if (Array.isArray(rows)) return rows as Row[];
    }
    return [];
  }

  // Single object
  return [data];
}

// ── vCard Parser ────────────────────────────────────────────

/**
 * Parse a vCard string (one or more vCards) into row objects.
 * Uses the reverse of the vCard mapping from schema.yaml.
 */
function parseVCards(
  text: string,
  entityName: string
): Row[] {
  const vcard = getVCardRepresentation(entityName);
  if (!vcard?.mapping) return [];

  const reverse = reverseMapping(vcard.mapping);
  const cards = text.split("END:VCARD").filter((c) => c.includes("BEGIN:VCARD"));
  const rows: Row[] = [];

  for (const card of cards) {
    const row: Row = {};
    const lines = card.split(/\r?\n/);
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const prop = line.slice(0, colonIdx).split(";")[0].toUpperCase();
      const value = line.slice(colonIdx + 1).trim();
      if (reverse[prop]) {
        row[reverse[prop]] = value;
      }
    }
    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

// ── Format Detection ────────────────────────────────────────

/**
 * Detect file format from extension.
 */
export function detectFormat(
  filename: string
): "xlsx" | "csv" | "json" | "vcf" | null {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "xlsx":
    case "xls":
      return "xlsx";
    case "csv":
      return "csv";
    case "json":
      return "json";
    case "vcf":
      return "vcf";
    default:
      return null;
  }
}

/**
 * Parse a file buffer into row objects, auto-detecting format.
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  entityName?: string
): Promise<Row[]> {
  const format = detectFormat(filename);
  if (!format) {
    throw new Error(`Unsupported file type: ${filename}. Use .xlsx, .csv, .json, or .vcf`);
  }

  switch (format) {
    case "xlsx":
      return parseXlsx(buffer);
    case "csv":
      return parseCsv(buffer.toString("utf-8"));
    case "json":
      return parseJson(buffer.toString("utf-8"));
    case "vcf":
      if (!entityName) throw new Error("entityName required for vCard parsing");
      return parseVCards(buffer.toString("utf-8"), entityName);
  }
}
