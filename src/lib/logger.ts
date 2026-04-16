/**
 * Structured Logger
 *
 * JSON-formatted logging via Pino. All log lines include a timestamp
 * and consistent field names for log aggregation (CloudWatch, Datadog, etc.).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ entity: "patient", action: "create", id: 42 }, "Patient created");
 *   logger.error({ err, sql }, "AI SQL execution failed");
 */

import pino from "pino";
import { getCorrelationId } from "@/lib/middleware/async-context";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Auto-include correlationId from AsyncLocalStorage in every log line.
  // Falls back to a fresh UUID if called outside a request context.
  mixin() {
    return { correlationId: getCorrelationId() };
  },
  // Pino defaults to JSON on stdout — no transport needed.
  // For human-readable dev logs, pipe through pino-pretty:
  //   npm run dev | npx pino-pretty
});
