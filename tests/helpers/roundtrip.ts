/**
 * Roundtrip Test Helpers
 *
 * Shared utilities for export -> import -> verify tests.
 * Handles field normalization (dates, numbers, nulls) so that
 * comparisons work across serialization boundaries.
 *
 * Also provides auth cookie generation for HTTP requests to the
 * dev server, which requires a valid session JWT.
 */

import { getSchema } from "@/lib/schema";
import { signSession } from "@/lib/auth";

const BASE_URL = "http://localhost:3000";

/**
 * Test session secret — must match the dev server's SESSION_SECRET env var.
 * Falls back to a well-known test value that test .env files should use.
 */
const TEST_SESSION_SECRET =
  process.env.SESSION_SECRET || "test-secret-for-integration-tests";

/**
 * Generate a valid session JWT for integration test HTTP requests.
 * Signs as admin (userId "1") so all API endpoints are accessible.
 */
async function getAuthCookie(): Promise<string> {
  const token = await signSession(
    { userId: "1", role: "admin" },
    TEST_SESSION_SECRET,
    "1h",
  );
  return `session=${token}`;
}

/**
 * Check whether the dev server is reachable.
 * Integration tests use this to skip gracefully when no server is running.
 *
 * Hits the login page (a public route) to avoid auth requirements.
 */
export async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/login`, {
      signal: AbortSignal.timeout(2000),
    });
    // Any response (including redirects) means the server is up
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Check whether the database is reachable by attempting a lightweight query.
 * Returns false if the DB connection fails (e.g., DB doesn't exist).
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize a date value to YYYY-MM-DD string.
 * Handles Date objects, ISO strings, and null/undefined.
 */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value as string | number);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Normalize a datetime value to ISO string truncated to seconds.
 */
export function normalizeDatetime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value as string | number);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19);
}

/**
 * Normalize a numeric value — both sides become Number.
 */
export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/**
 * Compare a single field value, applying normalization based on the schema field type.
 *
 * Returns { match: true } or { match: false, expected, actual } for diagnostics.
 */
export function compareField(
  fieldType: string,
  original: unknown,
  reimported: unknown
): { match: boolean; expected?: unknown; actual?: unknown } {
  // Null handling — both null/undefined should match
  const origNull = original === null || original === undefined;
  const reimNull = reimported === null || reimported === undefined;
  if (origNull && reimNull) return { match: true };
  if (origNull !== reimNull) {
    // Special case: empty string on one side, null on the other
    // This is a known asymmetry in CSV roundtrip (null -> "" -> null)
    if (
      (origNull && reimported === "") ||
      (reimNull && original === "")
    ) {
      return { match: true };
    }
    return { match: false, expected: original, actual: reimported };
  }

  switch (fieldType) {
    case "date": {
      const a = normalizeDate(original);
      const b = normalizeDate(reimported);
      return a === b
        ? { match: true }
        : { match: false, expected: a, actual: b };
    }
    case "datetime": {
      const a = normalizeDatetime(original);
      const b = normalizeDatetime(reimported);
      return a === b
        ? { match: true }
        : { match: false, expected: a, actual: b };
    }
    case "number": {
      const a = normalizeNumber(original);
      const b = normalizeNumber(reimported);
      return a === b
        ? { match: true }
        : { match: false, expected: a, actual: b };
    }
    case "time":
    case "string":
    case "text":
    case "email":
    case "phone":
    case "url":
    case "enum":
    case "boolean":
      return String(original) === String(reimported)
        ? { match: true }
        : { match: false, expected: original, actual: reimported };
    default:
      // Unknown field type — fall back to strict equality
      return original === reimported
        ? { match: true }
        : { match: false, expected: original, actual: reimported };
  }
}

/**
 * Assert that all schema-defined fields on an entity match between
 * the original record and the reimported record.
 *
 * Skips: id, createdAt, updatedAt, and relation objects.
 * Uses schema field types for normalization.
 */
export function assertFieldsMatch(
  entityName: string,
  original: Record<string, unknown>,
  reimported: Record<string, unknown>,
  options?: { skipFields?: string[] }
) {
  const schema = getSchema();
  const entity = schema.entities[entityName];
  if (!entity) throw new Error(`Unknown entity: ${entityName}`);

  const skipFields = new Set([
    "id",
    "createdAt",
    "updatedAt",
    ...(options?.skipFields ?? []),
  ]);

  const mismatches: string[] = [];

  for (const [fieldName, fieldConfig] of Object.entries(entity.fields)) {
    if (skipFields.has(fieldName)) continue;

    const result = compareField(
      fieldConfig.type,
      original[fieldName],
      reimported[fieldName]
    );

    if (!result.match) {
      mismatches.push(
        `  ${fieldName} (${fieldConfig.type}): expected ${JSON.stringify(result.expected)}, got ${JSON.stringify(result.actual)}`
      );
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Field mismatches in ${entityName} roundtrip:\n${mismatches.join("\n")}`
    );
  }
}

/**
 * POST a file to an import endpoint using multipart form data.
 * Includes auth cookie for the dev server's proxy auth check.
 */
export async function postImportFile(
  url: string,
  content: string | Buffer,
  filename: string,
  mimeType = "text/csv"
): Promise<Response> {
  const formData = new FormData();
  const blobContent = typeof content === "string" ? content : new Uint8Array(content);
  const blob = new Blob([blobContent], { type: mimeType });
  formData.append("file", blob, filename);

  const cookie = await getAuthCookie();
  return fetch(`${BASE_URL}${url}`, {
    method: "POST",
    body: formData,
    headers: { Cookie: cookie },
  });
}

/**
 * GET an export endpoint and return the response.
 * Includes auth cookie for the dev server's proxy auth check.
 */
export async function getExport(
  url: string,
  format: string
): Promise<Response> {
  const cookie = await getAuthCookie();
  return fetch(`${BASE_URL}${url}?format=${format}`, {
    headers: { Cookie: cookie },
  });
}
