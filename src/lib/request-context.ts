/**
 * Request Context
 *
 * Extracts common metadata from an incoming request — client IP,
 * user-agent, user identity, and a correlation ID — into a single
 * object that flows through the request lifecycle.
 */

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getClientIp } from "@/lib/api-helpers";

export interface RequestContext {
  userId: number | null;
  ip: string | undefined;
  userAgent: string | undefined;
  correlationId: string;
}

/**
 * Build a RequestContext from the incoming request.
 *
 * @param request - The Next.js request object
 * @param session - Optional session payload (if auth has been verified)
 */
export function extractRequestContext(
  request: NextRequest,
  session?: { userId: number } | null
): RequestContext {
  return {
    userId: session?.userId ?? null,
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
    correlationId: randomUUID(),
  };
}
