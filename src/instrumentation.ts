/**
 * Next.js Instrumentation
 *
 * Runs once when the server starts. Registers process-level exception
 * handlers so unhandled errors are logged before the process exits.
 * Also emits warnings for missing optional env vars in production.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("uncaughtException", (err) => {
      console.error("FATAL uncaughtException:", err);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("FATAL unhandledRejection:", reason);
      process.exit(1);
    });

    // Production startup checks: warn about missing optional env vars
    if (process.env.NODE_ENV === "production") {
      const warnings: string[] = [];
      if (!process.env.TOKEN_ENCRYPTION_KEY) warnings.push("TOKEN_ENCRYPTION_KEY not set — OAuth tokens stored in plaintext");
      if (!process.env.DATABASE_URL_READONLY) warnings.push("DATABASE_URL_READONLY not set — AI queries use read-write connection");
      if (!process.env.CARDDAV_PASSWORD) warnings.push("CARDDAV_PASSWORD not set — CardDAV endpoints are disabled");
      for (const w of warnings) console.warn(`[STARTUP WARNING] ${w}`);
    }
  }
}
