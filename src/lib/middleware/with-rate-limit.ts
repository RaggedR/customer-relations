/**
 * withRateLimit — Rate Limiting Layer
 *
 * Factory that returns a middleware applying a rate limiter.
 * Short-circuits with 429 if the limit is exceeded.
 *
 * Two forms:
 * - withRateLimit(limiter) — uses default session/IP key derivation
 * - withRateLimit(limiter, getKey) — custom key (e.g., per-patient)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRateLimitKey } from "@/lib/rate-limit";
import type { RateLimitResult } from "@/lib/rate-limit";
import type { TraceContext } from "./types";

/**
 * Create a rate-limiting middleware.
 *
 * @param limiter - Rate limiter function (from createRateLimiter)
 * @param getKey  - Optional custom key derivation. Defaults to session/IP via getRateLimitKey.
 */
export function withRateLimit<Ctx extends TraceContext>(
  limiter: (key: string) => RateLimitResult,
  getKey?: (ctx: Ctx) => string,
) {
  return async (ctx: Ctx): Promise<NextResponse | Ctx> => {
    const key = getKey
      ? getKey(ctx)
      : getRateLimitKey(ctx.request as NextRequest);
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
