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

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino/file", options: { destination: 1 } },
  }),
});
