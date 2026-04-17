/**
 * Template Engine — Unified {field} Interpolation
 *
 * Single implementation of the DSL's template interpolation syntax.
 * Replaces three ad-hoc parsers that had different capabilities:
 *   - renderers.tsx: {field} only (flat)
 *   - ical.ts: {field} + {relation.field} (two-pass regex)
 *   - navigation.ts: {entity}, {id}, etc. (fixed vocabulary)
 *
 * Grammar:
 *   {field}           → record[field]
 *   {relation.field}  → record[relation][field]  (dot notation for hydrated relations)
 *
 * Unknown tokens resolve to "" (empty string) — never left as literal "{...}".
 * This is intentional: partial data should produce partial output, not broken templates.
 */

type Row = Record<string, unknown>;

/**
 * Interpolate a template string against a record.
 *
 * Supports both flat ({field}) and dot-notation ({relation.field}) tokens.
 * Dot notation requires the record to have a nested object at the relation key
 * (i.e., a hydrated/included relation from Prisma).
 *
 * @param template — e.g. "{patient.name} — {specialty}"
 * @param record — e.g. { specialty: "Audiology", patient: { name: "John" } }
 * @returns — e.g. "John — Audiology"
 */
export function interpolateTemplate(
  template: string,
  record: Row,
): string {
  // Single regex handles both {field} and {relation.field}
  return template.replace(/\{(\w+)(?:\.(\w+))?\}/g, (_match, key, subKey) => {
    if (subKey) {
      // Dot notation: {relation.field}
      const parent = record[key];
      if (parent != null && typeof parent === "object") {
        const val = (parent as Row)[subKey];
        return val != null && val !== "" ? String(val) : "";
      }
      return "";
    }
    // Flat: {field}
    const val = record[key];
    return val != null && val !== "" ? String(val) : "";
  });
}

/**
 * Extract all token references from a template string.
 *
 * @returns Array of { field, relation? } — relation is present for dot-notation tokens.
 *
 * NOTE: A duplicate of this function exists in engine/schema-loader.ts for
 * build-time validation (the engine cannot import from lib/).
 * If you change the regex here, update schema-loader.ts to match.
 */
export function extractTemplateTokens(
  template: string,
): Array<{ field: string; relation?: string }> {
  const tokens: Array<{ field: string; relation?: string }> = [];
  const regex = /\{(\w+)(?:\.(\w+))?\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (match[2]) {
      // {relation.field} — match[1] is the relation, match[2] is the field
      tokens.push({ field: match[2], relation: match[1] });
    } else {
      // {field}
      tokens.push({ field: match[1] });
    }
  }
  return tokens;
}

// Note: Template validation at schema load time lives in engine/schema-loader.ts
// (validateTemplateTokens). The engine cannot import from lib/, so the validation
// logic is co-located with the schema validator. This module provides only runtime
// interpolation and token extraction.
