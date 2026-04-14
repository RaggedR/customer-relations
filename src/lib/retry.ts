/**
 * Retry with Exponential Backoff
 *
 * Retries a function on transient failures (network errors, 503s, rate limits).
 * Used for CalDAV operations and Gemini API calls.
 */

import { logger } from "./logger";

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms (doubled each retry). Default: 500. */
  baseDelayMs?: number;
  /** Label for log messages. */
  label?: string;
}

function isTransient(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("socket hang up") ||
      msg.includes("503") ||
      msg.includes("429") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 500;
  const label = options?.label ?? "operation";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts || !isTransient(err)) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        { attempt, maxAttempts, delay, err: (err as Error).message },
        `${label} failed, retrying`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
