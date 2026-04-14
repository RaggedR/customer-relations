/**
 * AI SQL Safety Validator
 *
 * Validates LLM-generated SQL before execution via $queryRawUnsafe.
 * Defence in depth — this complements (not replaces) a read-only DB role.
 *
 * Strategy:
 * 1. Block SQL comments (LLM has no legitimate reason to generate them)
 * 2. Block multi-statement queries (semicolons outside string literals)
 * 3. Strip string literals, then scan for DML/DDL keywords at word boundaries
 * 4. Block system catalog access (pg_catalog, information_schema, pg_*)
 */

export interface SqlValidationResult {
  safe: boolean;
  reason?: string;
}

/** DML/DDL keywords that must not appear anywhere in the query (outside string literals). */
const BLOCKED_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "EXECUTE",
  "CALL",
];

/** System catalog patterns — block reads of PostgreSQL internals. */
const SYSTEM_CATALOG_PATTERNS = [
  /\binformation_schema\b/i,
  /\bpg_catalog\b/i,
  /\bpg_stat_/i,
  /\bpg_shadow\b/i,
  /\bpg_authid\b/i,
  /\bpg_roles\b/i,
  /\bpg_user\b/i,
  /\bpg_class\b/i,
  /\bpg_proc\b/i,
  /\bpg_tables\b/i,
  /\bpg_largeobject\b/i,
];

/**
 * Strip single-quoted string literals from SQL so that keywords inside
 * strings (e.g. WHERE notes ILIKE '%delete%') don't trigger false positives.
 *
 * Handles escaped quotes ('') inside strings per SQL standard.
 */
function stripStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "'__LITERAL__'");
}

/**
 * Check for semicolons outside string literals (multi-statement attack).
 */
function containsMultipleStatements(sql: string): boolean {
  const stripped = stripStringLiterals(sql);
  // Remove trailing semicolons + whitespace (harmless)
  const trimmed = stripped.replace(/;\s*$/, "");
  return trimmed.includes(";");
}

/**
 * Check for SQL comments (block-style and line-style --).
 * Strips string literals first so '--' inside strings doesn't false-positive.
 */
function containsComments(sql: string): boolean {
  // Strip string literals first so '--' inside strings doesn't false-positive
  const stripped = stripStringLiterals(sql);
  return stripped.includes("--") || /\/\*/.test(stripped);
}

export function validateAiSql(sql: string): SqlValidationResult {
  if (!sql || !sql.trim()) {
    return { safe: false, reason: "Empty query" };
  }

  // 1. Block comments — LLM-generated SQL should never need them
  if (containsComments(sql)) {
    return { safe: false, reason: "Query contains SQL comment (-- or /* */)" };
  }

  // 2. Block multi-statement queries
  if (containsMultipleStatements(sql)) {
    return { safe: false, reason: "Query contains multiple statements (;)" };
  }

  // 3. Must start with SELECT or WITH
  const normalised = sql.trim().toUpperCase();
  if (!normalised.startsWith("SELECT") && !normalised.startsWith("WITH")) {
    return { safe: false, reason: "Query must start with SELECT or WITH" };
  }

  // 4. Strip string literals, then scan for blocked keywords at word boundaries
  const stripped = stripStringLiterals(sql);
  for (const keyword of BLOCKED_KEYWORDS) {
    // Word boundary match — avoids false positives on "updatedAt", "createdAt"
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(stripped)) {
      return { safe: false, reason: `Query contains blocked keyword: ${keyword}` };
    }
  }

  // 5. Block system catalog access
  for (const pattern of SYSTEM_CATALOG_PATTERNS) {
    if (pattern.test(stripped)) {
      return { safe: false, reason: "Query accesses system catalog tables" };
    }
  }

  return { safe: true };
}
