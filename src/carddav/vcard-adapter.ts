/**
 * vCard Adapter (Adapter pattern)
 *
 * Converts between our entity data and vCard format,
 * using the carddav.mapping from schema.yaml.
 */

import { v4 as uuidv4 } from "uuid";
import type { CardDAVMapping } from "@/engine/schema-loader";

/**
 * Convert an entity record to a vCard string.
 */
export function entityToVCard(
  entity: Record<string, unknown>,
  mapping: CardDAVMapping,
  uid?: string
): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const vcardUid = uid || (entity.vcardUid as string) || uuidv4();
  lines.push(`UID:${vcardUid}`);

  for (const [fieldName, vcardProp] of Object.entries(mapping)) {
    const value = entity[fieldName] ?? entity[fieldName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()];
    if (value === null || value === undefined || value === "") continue;

    switch (vcardProp.toUpperCase()) {
      case "FN":
        lines.push(`FN:${escapeVCard(String(value))}`);
        // Also add N (structured name) — required in vCard 3.0
        lines.push(`N:${escapeVCard(String(value))};;;;`);
        break;
      case "EMAIL":
        lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(String(value))}`);
        break;
      case "TEL":
        lines.push(`TEL;TYPE=VOICE:${escapeVCard(String(value))}`);
        break;
      case "ORG":
        // For org, the value might be a related entity
        if (typeof value === "object" && value !== null) {
          const name = (value as Record<string, unknown>).name;
          if (name) lines.push(`ORG:${escapeVCard(String(name))}`);
        } else {
          lines.push(`ORG:${escapeVCard(String(value))}`);
        }
        break;
      default:
        lines.push(`${vcardProp.toUpperCase()}:${escapeVCard(String(value))}`);
    }
  }

  lines.push(`REV:${new Date().toISOString()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/**
 * Parse a vCard string into entity field data.
 */
export function vCardToEntity(
  vcard: string,
  mapping: CardDAVMapping
): { data: Record<string, unknown>; uid: string } {
  const lines = vcard.replace(/\r\n /g, "").split(/\r?\n/);
  const data: Record<string, unknown> = {};
  let uid = "";

  // Reverse the mapping: vCard prop → field name
  const reverseMap: Record<string, string> = {};
  for (const [fieldName, vcardProp] of Object.entries(mapping)) {
    reverseMap[vcardProp.toUpperCase()] = fieldName;
  }

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const propPart = line.substring(0, colonIndex);
    const value = unescapeVCard(line.substring(colonIndex + 1));

    // Strip parameters (e.g., EMAIL;TYPE=INTERNET → EMAIL)
    const propName = propPart.split(";")[0].toUpperCase();

    if (propName === "UID") {
      uid = value;
      continue;
    }

    if (propName === "FN" && reverseMap["FN"]) {
      data[reverseMap["FN"]] = value;
    } else if (propName === "EMAIL" && reverseMap["EMAIL"]) {
      data[reverseMap["EMAIL"]] = value;
    } else if (propName === "TEL" && reverseMap["TEL"]) {
      data[reverseMap["TEL"]] = value;
    } else if (propName === "ORG" && reverseMap["ORG"]) {
      data[reverseMap["ORG"]] = value;
    } else if (propName === "N" && !data[reverseMap["FN"] || ""]) {
      // Use N as fallback for FN
      const parts = value.split(";");
      const fullName = [parts[1], parts[0]].filter(Boolean).join(" ").trim();
      if (fullName && reverseMap["FN"]) {
        data[reverseMap["FN"]] = fullName;
      }
    }
  }

  return { data, uid: uid || uuidv4() };
}

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function unescapeVCard(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}
