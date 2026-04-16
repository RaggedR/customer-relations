/**
 * Async Context — Request-Scoped Storage
 *
 * Uses AsyncLocalStorage to thread correlation IDs and user identity
 * through the entire request lifecycle without explicit parameter passing.
 *
 * This is the ReaderT monad transformer made concrete: any function
 * anywhere in the call stack can read the current request's context
 * via getCorrelationId() / getCurrentUserId().
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestStore {
  correlationId: string;
  userId: number | null;
}

export const requestStore = new AsyncLocalStorage<RequestStore>();

/** Get the current correlation ID, or generate a fresh one if outside a request. */
export function getCorrelationId(): string {
  return requestStore.getStore()?.correlationId ?? randomUUID();
}

/** Get the current user ID, or null if outside a request or unauthenticated. */
export function getCurrentUserId(): number | null {
  return requestStore.getStore()?.userId ?? null;
}
