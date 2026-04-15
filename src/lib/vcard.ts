/**
 * vCard Generation and Parsing
 *
 * Schema-driven: reads representations.vcard.mapping from schema.yaml.
 * Generates vCard 3.0 format for patient and nurse contacts.
 */

import { getVCardRepresentation, reverseMapping } from "@/lib/schema";
import { escapeText, unescapeText, unfoldLines } from "@/lib/text-codec";
import type { Row } from "@/lib/parsers";

/**
 * Generate a vCard 3.0 string for a record.
 *
 * The record should have all schema fields populated.
 * Which fields become which vCard properties is determined by
 * the representations.vcard.mapping in schema.yaml.
 */
export function generateVCard(entityName: string, record: Row): string {
  const vcard = getVCardRepresentation(entityName);
  if (!vcard?.mapping) {
    throw new Error(
      `Entity "${entityName}" has no vCard representation configured`
    );
  }

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
  ];

  for (const [fieldName, vcardProp] of Object.entries(vcard.mapping)) {
    const value = record[fieldName];
    if (value === null || value === undefined || value === "") continue;

    const stringVal = formatVCardValue(vcardProp, value);
    lines.push(`${vcardProp}:${stringVal}`);
  }

  // Add UID and REV
  const uid = `${entityName}-${record.id}@customer-relations`;
  lines.push(`UID:${uid}`);
  lines.push(`REV:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`);

  lines.push("END:VCARD");

  return lines.join("\r\n") + "\r\n";
}

/**
 * Generate multiple vCards as a single string.
 */
export function generateVCards(
  entityName: string,
  records: Row[]
): string {
  return records.map((r) => generateVCard(entityName, r)).join("");
}

/**
 * Parse a vCard string into entity field values.
 * Uses the reverse of the vCard mapping to map properties back to fields.
 */
export function parseVCard(
  entityName: string,
  vcardText: string
): Row {
  const vcard = getVCardRepresentation(entityName);
  if (!vcard?.mapping) {
    throw new Error(
      `Entity "${entityName}" has no vCard representation configured`
    );
  }

  const reverse = reverseMapping(vcard.mapping);
  const result: Row = {};

  const lines = unfoldLines(vcardText);

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    // Property name may have parameters (e.g. "TEL;TYPE=CELL:")
    const propPart = line.slice(0, colonIdx);
    const prop = propPart.split(";")[0].toUpperCase();
    const value = line.slice(colonIdx + 1).trim();

    if (prop === "UID") {
      const match = value.match(/^(\w+)-(\d+)@/);
      if (match) {
        result._entity = match[1];
        result.id = parseInt(match[2], 10);
      }
      continue;
    }

    const fieldName = reverse[prop];
    if (fieldName) {
      result[fieldName] = parseVCardValue(prop, value);
    }
  }

  return result;
}

/**
 * Parse multiple vCards from a single string.
 */
export function parseVCards(
  entityName: string,
  text: string
): Row[] {
  const cards = text
    .split("END:VCARD")
    .filter((c) => c.includes("BEGIN:VCARD"));

  return cards.map((card) =>
    parseVCard(entityName, card + "END:VCARD")
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatVCardValue(prop: string, value: unknown): string {
  const str = String(value);

  switch (prop.toUpperCase()) {
    case "ADR":
      // vCard ADR format: ;;street;city;state;zip;country
      // We store the full address as a single string
      return `;;${escapeText(str)};;;;`;
    case "BDAY":
      // Ensure YYYY-MM-DD format
      try {
        const d = new Date(str);
        return d.toISOString().slice(0, 10);
      } catch {
        return str;
      }
    default:
      return escapeText(str);
  }
}

function parseVCardValue(prop: string, value: string): string {
  switch (prop.toUpperCase()) {
    case "ADR": {
      // Extract the street part from ;;street;city;state;zip;country
      const parts = value.split(";");
      // Reconstruct a readable address
      return parts
        .filter((p) => p.trim())
        .map((p) => unescapeText(p))
        .join(", ");
    }
    default:
      return unescapeText(value);
  }
}

