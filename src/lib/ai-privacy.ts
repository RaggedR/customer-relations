/**
 * AI Privacy Utilities
 *
 * Functions for data minimisation and pseudonymisation before rows are sent to
 * an external LLM (Gemini), and for reversing pseudonymisation in the response.
 *
 * Australian Privacy Principles compliance:
 * - ai_visible: false fields are stripped (APP 11 — security of personal info)
 * - Patient/nurse names are replaced with opaque pseudonyms before disclosure
 *   to a third-party processor (APP 8 — cross-border disclosure)
 */

import { getSchema } from "@/lib/schema";

/**
 * Collect field names marked ai_visible: false in schema.yaml.
 * These columns are stripped from query results before sending to Gemini.
 * Normalised to lowercase without underscores for fuzzy column matching.
 */
export function getAiRedactedColumns(): Set<string> {
  const schema = getSchema();
  const redacted = new Set<string>();
  for (const entity of Object.values(schema.entities)) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (field.ai_visible === false) {
        redacted.add(fieldName.toLowerCase().replace(/[\s_]/g, ""));
      }
    }
  }
  return redacted;
}

/**
 * Strip AI-excluded columns from query result rows before sending to Gemini.
 * Defence-in-depth: even if the schema description excludes a field, the SQL
 * might still select it via aliasing or * expansion.
 */
export function redactForAi(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const redacted = getAiRedactedColumns();
  if (redacted.size === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!redacted.has(k.toLowerCase().replace(/[\s_]/g, ""))) {
        out[k] = v;
      }
    }
    return out;
  });
}

/**
 * Replace known patient/nurse names with pseudonyms in query result rows
 * before sending to Gemini. Only replaces exact string matches in values,
 * not inside free-text content fields (clinical note content is left as-is).
 */
export function pseudonymiseRows(
  rows: Record<string, unknown>[],
  pseudonymMap: Map<string, string>,
): Record<string, unknown>[] {
  if (pseudonymMap.size === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && pseudonymMap.has(v)) {
        out[k] = pseudonymMap.get(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

/**
 * Replace pseudonyms in Gemini's answer text back to real names for display.
 */
export function depseudonymiseAnswer(
  answer: string,
  inversePseudonymMap: Map<string, string>,
): string {
  let result = answer;
  for (const [pseudonym, realName] of inversePseudonymMap) {
    result = result.replaceAll(pseudonym, realName);
  }
  return result;
}
