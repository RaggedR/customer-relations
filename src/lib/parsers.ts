/**
 * File Format Parsers
 *
 * Parse any input format into an array of row objects.
 * Schema-driven: uses representations.csv.headers for column mapping.
 *
 * Supported: xlsx/xls, csv, json, vcf (vCard)
 */

import ExcelJS from "exceljs";
import { getCsvRepresentation } from "./representations";
import { getSchema } from "../engine/schema-loader";

export type Row = Record<string, unknown>;

/**
 * Build a header normalisation map for an entity.
 * Maps lowercased column headers → schema field names.
 *
 * Sources:
 * 1. representations.csv.headers (explicit mapping)
 * 2. Field names themselves (snake_case and space-separated)
 * 3. Relation names (e.g. "patient" → "patient")
 */
export function buildHeaderMap(entityName: string): Record<string, string> {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const map: Record<string, string> = {};

  // Add field names as-is (both snake_case and space-separated)
  for (const fieldName of Object.keys(entity.fields)) {
    map[fieldName.toLowerCase()] = fieldName;
    map[fieldName.replace(/_/g, " ").toLowerCase()] = fieldName;
  }

  // Add relation names
  if (entity.relations) {
    for (const relName of Object.keys(entity.relations)) {
      map[relName.toLowerCase()] = relName;
      // Also map "Patient Name" → relation name for parent resolution
      map[`${relName} name`] = `${relName}_name`;
      map[`${relName}_name`] = `${relName}_name`;
    }
  }

  // Add CSV header mappings (these take priority)
  const csvRep = getCsvRepresentation(entityName);
  if (csvRep.headers) {
    for (const [fieldName, header] of Object.entries(csvRep.headers)) {
      map[header.toLowerCase().trim()] = fieldName;
    }
  }

  return map;
}

/**
 * Normalise a header string: lowercase, trim, strip underscores/dashes.
 */
function normaliseHeader(
  header: string,
  headerMap: Record<string, string>
): string {
  const key = header.toLowerCase().trim();
  return headerMap[key] || headerMap[key.replace(/[-_]/g, " ")] || key;
}

/**
 * Apply header normalisation to all keys in an array of row objects.
 */
export function normaliseRows(
  rows: Row[],
  entityName: string
): Row[] {
  const headerMap = buildHeaderMap(entityName);
  return rows.map((row) => {
    const out: Row = {};
    for (const [key, val] of Object.entries(row)) {
      out[normaliseHeader(key, headerMap)] = val;
    }
    return out;
  });
}

// ── CSV Parser ──────────────────────────────────────────────

/**
 * Parse a CSV string into row objects.
 * Handles quoted fields with commas, quotes, and newlines.
 */
export function parseCsv(text: string): Row[] {
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
export async function parseXlsx(buffer: Buffer): Promise<Row[]> {
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
export function parseJson(text: string): Row[] {
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
export function parseVCards(
  text: string,
  entityName: string
): Row[] {
  const { getVCardRepresentation, reverseMapping } = require("./representations");
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
