/**
 * Fuzzy Name Resolution
 *
 * Resolves person names in natural language questions against the database.
 * Uses Levenshtein distance for typo tolerance:
 * - Distance 0–1: confident match, auto-resolve
 * - Distance 2–3: uncertain, ask the user to confirm
 *
 * Extracted from the AI route to separate name-matching concerns
 * from LLM orchestration. Uses the repository (not direct Prisma)
 * to respect the architectural boundary.
 */

import { findAll } from "./repository";

// ── Types ────────────────────────────────────────────────

export interface NameResolution {
  question: string;
  clarify?: string; // if set, ask the user this instead of querying
}

// ── Constants ────────────────────────────────────────────

/** Distance 0–1: confident match, auto-resolve */
const CONFIDENT_DISTANCE = 1;
/** Distance 2–3: uncertain, ask the user to confirm */
const MAX_DISTANCE = 3;

/** Common words to skip when scanning questions for names */
const SKIP_WORDS = new Set([
  "the", "about", "tell", "what", "when", "does", "has", "have",
  "are", "for", "from", "with", "how", "many", "show", "get",
  "all", "list", "plan", "date", "last", "next", "hearing",
  "aids", "aid", "notes", "note", "claim", "items", "referral",
  // Calendar-related words
  "free", "busy", "available", "times", "slots", "appointments",
  "appointment", "schedule", "calendar", "week", "today", "tomorrow",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "morning", "afternoon", "evening", "which", "nurse", "most", "least",
]);

// ── Name Sanitisation ────────────────────────────────────

const MAX_NAME_LENGTH = 100;

/**
 * Sanitise a database name before interpolating it into an LLM prompt.
 * Strips control characters and structural chars that could be used
 * for prompt injection.
 */
export function sanitiseName(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f\u0080-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/[[\]{}"]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

// ── Levenshtein ──────────────────────────────────────────

/**
 * Levenshtein distance — number of single-character edits
 * (insertions, deletions, substitutions) to transform a into b.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Name Resolution ────────────────────────────────────���─

import type { Row } from "@/lib/parsers";

/**
 * Resolve fuzzy names before sending to the LLM.
 *
 * Loads all patient and nurse names via the repository, splits them
 * into parts, and compares each word in the question using Levenshtein
 * distance. If the closest match is within MAX_DISTANCE edits, appends
 * the exact name to the question so the LLM generates clean SQL.
 */
export async function resolveNames(question: string): Promise<NameResolution> {
  try {
    // Load all names via repository (not direct Prisma)
    const [patients, nurses] = await Promise.all([
      findAll("patient") as Promise<Row[]>,
      findAll("nurse") as Promise<Row[]>,
    ]);

    const allNames: { name: string; type: string; parts: string[] }[] = [];
    for (const p of patients) {
      const name = String(p.name ?? "");
      if (name) {
        allNames.push({
          name,
          type: "patient",
          parts: name.toLowerCase().replace(/'/g, "").split(/\s+/),
        });
      }
    }
    for (const n of nurses) {
      const name = String(n.name ?? "");
      if (name) {
        allNames.push({
          name,
          type: "nurse",
          parts: name.toLowerCase().replace(/'/g, "").split(/\s+/),
        });
      }
    }

    // Extract words from question (3+ chars, skip common words)
    const words = question
      .toLowerCase()
      .replace(/['']/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !SKIP_WORDS.has(w));

    let bestMatch: { name: string; type: string; distance: number } | null = null;

    for (const word of words) {
      for (const entry of allNames) {
        // Check against each part of the name (first name, last name)
        for (const part of entry.parts) {
          const dist = levenshtein(word, part);
          if (dist <= MAX_DISTANCE && (!bestMatch || dist < bestMatch.distance)) {
            bestMatch = { name: entry.name, type: entry.type, distance: dist };
          }
        }
        // Also check against the full name (stripped of apostrophes)
        const fullName = entry.parts.join("");
        const distFull = levenshtein(word, fullName);
        if (distFull <= MAX_DISTANCE && (!bestMatch || distFull < bestMatch.distance)) {
          bestMatch = { name: entry.name, type: entry.type, distance: distFull };
        }
      }
    }

    if (bestMatch) {
      const safeName = sanitiseName(bestMatch.name);
      if (bestMatch.distance <= CONFIDENT_DISTANCE) {
        // Confident — auto-resolve (JSON-encoded to prevent prompt injection)
        const resolved = JSON.stringify({ type: bestMatch.type, name: safeName });
        return {
          question: question + `\n\n[CRM_RESOLVED]${resolved}[/CRM_RESOLVED]`,
        };
      } else {
        // Uncertain — ask the user to confirm
        return {
          question,
          clarify: `Did you mean ${safeName}?`,
        };
      }
    }
  } catch (err) {
    console.warn("Name resolution failed:", err);
  }
  return { question };
}
