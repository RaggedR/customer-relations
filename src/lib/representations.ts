/**
 * Representations Reader
 *
 * Reads external format mappings (vCard, iCal, CSV, JSON) from the
 * cached schema. Used by vcard.ts, ical.ts, parsers.ts, and export routes.
 */

import {
  getSchema,
  RepresentationsConfig,
  VCardRepresentation,
  ICalRepresentation,
  CsvRepresentation,
  JsonRepresentation,
} from "../engine/schema-loader";

/**
 * Get the full representations config for an entity.
 * Returns undefined if the entity has no representations block.
 */
export function getRepresentations(
  entityName: string
): RepresentationsConfig | undefined {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);
  return entity.representations;
}

/**
 * Get the vCard representation for an entity.
 * Returns undefined if no vCard mapping is configured.
 */
export function getVCardRepresentation(
  entityName: string
): VCardRepresentation | undefined {
  return getRepresentations(entityName)?.vcard;
}

/**
 * Get the iCal representation for an entity.
 * Returns undefined if no iCal mapping is configured.
 */
export function getICalRepresentation(
  entityName: string
): ICalRepresentation | undefined {
  return getRepresentations(entityName)?.ical;
}

/**
 * Get the CSV representation for an entity.
 * If no explicit headers are configured, generates default headers
 * from the entity's field names (snake_case → Title Case).
 */
export function getCsvRepresentation(
  entityName: string
): CsvRepresentation {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const configured = entity.representations?.csv;
  if (configured?.headers) return configured;

  // Generate default headers from field names
  const headers: Record<string, string> = {};
  for (const fieldName of Object.keys(entity.fields)) {
    headers[fieldName] = fieldName
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return { headers };
}

/**
 * Get the JSON representation for an entity.
 * Returns undefined if no JSON config is set.
 */
export function getJsonRepresentation(
  entityName: string
): JsonRepresentation | undefined {
  return getRepresentations(entityName)?.json;
}

/**
 * Build a reverse lookup: external property → our field name.
 * Useful for parsing vCard/iCal back into entity data.
 *
 * e.g. { "FN": "name", "TEL": "phone", "EMAIL": "email" }
 */
export function reverseMapping(
  mapping: Record<string, string>
): Record<string, string> {
  const reversed: Record<string, string> = {};
  for (const [field, prop] of Object.entries(mapping)) {
    reversed[prop] = field;
  }
  return reversed;
}
