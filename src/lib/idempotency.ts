/**
 * Idempotency Key Store
 *
 * In-memory store for POST request deduplication. Clients send an
 * `Idempotency-Key` header; if we've already processed that key,
 * we return the cached response instead of creating a duplicate.
 *
 * Keys expire after 24 hours. Single-instance only (same limitation
 * as the rate limiter).
 */

import { NextResponse } from "next/server";

interface CachedResponse {
  body: string;
  status: number;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 10_000;
const MAX_KEY_LENGTH = 128;
const store = new Map<string, CachedResponse>();

function evictIfOverLimit() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

/**
 * Check if a request with this idempotency key was already processed.
 * Returns the cached response if found, null otherwise.
 */
export function getIdempotentResponse(key: string): NextResponse | null {
  const safeKey = key.slice(0, MAX_KEY_LENGTH);
  const cached = store.get(safeKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    store.delete(safeKey);
    return null;
  }
  return new NextResponse(cached.body, {
    status: cached.status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Cache a response for an idempotency key.
 *
 * The caller (route-factory.ts) fires this without await, which is fine —
 * the key fix is that store.set happens synchronously after the await,
 * not in a detached .then() microtask that could lose the race.
 */
export async function cacheIdempotentResponse(
  key: string,
  response: NextResponse,
): Promise<void> {
  evictIfOverLimit();
  const safeKey = key.slice(0, MAX_KEY_LENGTH);
  const body = await response.clone().text();
  store.set(safeKey, {
    body,
    status: response.status,
    expiresAt: Date.now() + TTL_MS,
  });
}
