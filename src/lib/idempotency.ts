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
  // If still over limit after expiry-based eviction (e.g. DoS of fresh keys),
  // evict oldest entries by insertion order (Map iterates in insertion order).
  if (store.size > MAX_ENTRIES) {
    const toEvict = store.size - MAX_ENTRIES;
    let evicted = 0;
    for (const key of store.keys()) {
      if (evicted >= toEvict) break;
      store.delete(key);
      evicted++;
    }
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
 * NOTE: This module is not yet wired into route-factory.ts — it is
 * infrastructure prepared for POST deduplication. When integrated,
 * the caller can fire-and-forget (no await needed) because store.set
 * runs synchronously after the internal await.
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
