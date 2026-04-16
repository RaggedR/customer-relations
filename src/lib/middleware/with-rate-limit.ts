/**
 * withRateLimit — Rate Limiting Layer
 *
 * Factory that returns a middleware applying a rate limiter.
 * Uses the shared getRateLimitKey() for consistent key derivation.
 * Short-circuits with 429 if the limit is exceeded.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRateLimitKey } from "@/lib/rate-limit";
import type { RateLimitResult } from "@/lib/rate-limit";
import type { TraceContext } from "./types";

export function withRateLimit(
  limiter: (key: string) => RateLimitResult,
) {
  return async <Ctx extends TraceContext>(
    ctx: Ctx,
  ): Promise<NextResponse | Ctx> => {
    const key = getRateLimitKey(ctx.request as NextRequest);
    const result = limiter(key);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((result.resetMs - Date.now()) / 1000),
            ),
          },
        },
      );
    }
    return ctx;
  };
}

/**
 * withCustomRateLimit — Rate limiting with a custom key derivation.
 *
 * For routes that need per-entity rate limiting (e.g., per-patient
 * correction requests) rather than per-session/IP.
 */
export function withCustomRateLimit<Ctx extends TraceContext>(
  limiter: (key: string) => RateLimitResult,
  getKey: (ctx: Ctx) => string,
) {
  return async (ctx: Ctx): Promise<NextResponse | Ctx> => {
    const key = getKey(ctx);
    const result = limiter(key);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((result.resetMs - Date.now()) / 1000),
            ),
          },
        },
      );
    }
    return ctx;
  };
}
