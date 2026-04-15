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
import { parseVCards as parseVCardsFromVCard } from "@/lib/vcard";

export type Row = Record<string, unknown>;

/** Maximum import file size (10 MB) — prevents OOM on oversized uploads */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

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

/** Maximum rows allowed in an xlsx import — guards against zip bombs */
const MAX_XLSX_ROWS = 100_000;
/**
 * Maximum compressed XLSX buffer size (5 MB) — blocks zip bombs before decompression.
 * Tighter than MAX_IMPORT_BYTES (10 MB) because XLSX zip compression ratios
 * mean a 5 MB archive can decompress to hundreds of MB in memory.
 */
const MAX_XLSX_BUFFER = 5 * 1024 * 1024;

/**
 * Parse an xlsx buffer into row objects.
 */
async function parseXlsx(buffer: Buffer): Promise<Row[]> {
  // Guard against zip bombs: check compressed size before ExcelJS decompresses
  if (buffer.length > MAX_XLSX_BUFFER) {
    throw new Error(
      `XLSX file too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB compressed (max 5 MB)`
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err) {
    throw new Error("Failed to parse XLSX file: possibly corrupted or too large", { cause: err });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  if (sheet.rowCount > MAX_XLSX_ROWS) {
    throw new Error(
      `XLSX file has ${sheet.rowCount} rows (max ${MAX_XLSX_ROWS}). ` +
      `Split the file or use a smaller dataset.`
    );
  }

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
 * Delegates to the canonical parser in vcard.ts which handles
 * line unfolding, escaping, and ADR decomposition.
 */
function parseVCards(text: string, entityName: string): Row[] {
  return parseVCardsFromVCard(entityName, text);
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
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new Error(
      `Import file too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 10 MB)`,
    );
  }

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
