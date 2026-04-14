/**
 * API Route Helpers
 *
 * Shared utilities for route handlers.
 */

import { NextResponse } from "next/server";

/**
 * Entities containing sensitive fields (tokens, credentials) that must not
 * be exported, imported, or included in backups.
 */
export const SENSITIVE_ENTITIES = ["calendar_connection"] as const;

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
