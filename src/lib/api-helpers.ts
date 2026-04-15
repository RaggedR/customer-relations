/**
 * API Route Helpers
 *
 * Shared utilities for route handlers.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

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
    if (message.startsWith("Invalid sort field:")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === "CONFLICT") {
      return NextResponse.json(
        { error: "Record was modified by another request. Please reload and try again." },
        { status: 409 },
      );
    }
    logger.error({ err: error, label }, "Request handler error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
