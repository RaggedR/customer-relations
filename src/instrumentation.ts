/**
 * Next.js Instrumentation
 *
 * Runs once when the server starts. Registers process-level exception
 * handlers so unhandled errors are logged before the process exits.
 * Also emits warnings for missing optional env vars in production.
 */

import { logger } from "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      logger.fatal({ err }, "FATAL uncaughtException");
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      logger.fatal({ reason }, "FATAL unhandledRejection");
      process.exit(1);
    });

    process.on("SIGTERM", () => {
      logger.info("[shutdown] SIGTERM received, draining connections...");
      // Dynamic import avoids pulling prisma into the instrumentation module at load time
      import("@/lib/prisma").then(({ prisma }) =>
        Promise.race([
          prisma.$disconnect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("disconnect timeout")), 5000)),
        ])
      ).catch(() => {}).finally(() => process.exit(0));
    });

    // Production startup checks
    if (process.env.NODE_ENV === "production") {
      // Hard requirement: TOKEN_ENCRYPTION_KEY must be set for OAuth token security
      if (!process.env.TOKEN_ENCRYPTION_KEY) {
        logger.error("TOKEN_ENCRYPTION_KEY not set — refusing to start with plaintext OAuth tokens in production");
        process.exit(1);
      }

      // Hard requirement: DATABASE_URL_READONLY must be set so AI queries use a restricted connection
      if (!process.env.DATABASE_URL_READONLY) {
        logger.error("DATABASE_URL_READONLY not set — refusing to start without a read-only connection for AI queries in production");
        process.exit(1);
      }

      if (!process.env.CARDDAV_PASSWORD) {
        logger.warn("CARDDAV_PASSWORD not set — CardDAV endpoints are disabled");
      }
    } else {
      // Development: warn but don't hard-fail
      if (!process.env.DATABASE_URL_READONLY) {
        logger.warn("DATABASE_URL_READONLY not set — AI queries use read-write connection");
      }
    }
  }
}
