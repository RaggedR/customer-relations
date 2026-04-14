/**
 * Rate Limiting — Sliding Window Counter
 *
 * In-memory rate limiter for single-instance deployment.
 * Each limiter tracks requests per key (session token or IP)
 * within a sliding time window.
 */

import type { NextRequest } from "next/server";

interface Window {
  start: number;
  count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Create a rate limiter with a fixed window.
 *
 * @param limit   Maximum requests per window
 * @param windowMs Window duration in milliseconds
 */
export function createRateLimiter(
  limit: number,
  windowMs: number,
): (key: string) => RateLimitResult {
  const windows = new Map<string, Window>();

  return (key: string): RateLimitResult => {
    const now = Date.now();
    const entry = windows.get(key);

    if (!entry || now - entry.start >= windowMs) {
      // New window
      windows.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: limit - 1, resetMs: now + windowMs };
    }

    entry.count++;
    const resetMs = entry.start + windowMs;

    if (entry.count > limit) {
      return { allowed: false, remaining: 0, resetMs };
    }

    return { allowed: true, remaining: limit - entry.count, resetMs };
  };
}

/**
 * Extract a rate-limit key from a request.
 * Prefers session cookie (per-user); falls back to IP (per-origin).
 */
export function getRateLimitKey(request: NextRequest): string {
  const session = request.cookies.get("session")?.value;
  if (session) return `session:${session}`;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0].trim()}`;

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp}`;

  return "ip:unknown";
}
