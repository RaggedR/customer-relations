/**
 * API Route Helpers
 *
 * Shared utilities for route handlers.
 */

import { NextResponse } from "next/server";

/**
 * Entities containing sensitive fields (tokens, passwords, credentials) that
 * must not be accessible via the generic CRUD API, export, import, or backups.
 * - calendar_connection: contains OAuth tokens (excluded from AI schema + exports)
 * - user/session: password hashes and live session tokens
 * - audit_log: tamper-evident log — must not be writable or exportable
 */
export const SENSITIVE_ENTITIES = [
  "calendar_connection",
  "user",
  "session",
  "audit_log",
] as const;

/**
 * Extract the client IP address from standard proxy headers.
 *
 * Takes the first entry from X-Forwarded-For (the originating client IP),
 * then falls back to X-Real-IP. Assumes the app is deployed behind a trusted
 * reverse proxy that sets these headers correctly — if not, the first
 * X-Forwarded-For entry can be spoofed by a client.
 */
export function getClientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? undefined;
}

/**
 * Wrap a route handler with standardised error handling.
 * Catches unhandled errors and returns a 500 JSON response.
 *
 * Special cases:
 * - "Unknown entity" / "No Prisma model" errors → 404 (so route handlers
 *   don't need to validate entity names themselves — the repository does it)
 *
 * Inner try/catch blocks for specific errors (400s, etc.) should stay
 * within the handler — this only replaces the outermost catch-all.
 */
export async function withErrorHandler(
  label: string,
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (
      message.startsWith("Unknown entity:") ||
      message.startsWith("No Prisma model found for entity")
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error(`${label} error:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
