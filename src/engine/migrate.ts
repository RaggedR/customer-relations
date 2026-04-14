/**
 * Auto-Migration
 *
 * Uses `prisma migrate diff` to detect schema changes and generate incremental
 * SQL migrations, then `prisma migrate deploy` to apply them.
 *
 * This avoids `prisma migrate dev` (which needs a shadow database) and
 * `prisma db push --accept-data-loss` (which can destroy data).
 *
 * Flow:
 * 1. Diff current migrations against the new schema
 * 2. If changes detected, create a new migration file
 * 3. Apply all pending migrations with `migrate deploy`
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export function runMigration(): void {
  console.log("[schema-engine] Checking for schema changes...");
  try {
    // Diff: what the DB currently is vs what the schema says it should be
    const diff = execSync(
      "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script",
      { cwd: process.cwd(), encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    if (!diff || diff === "-- This is an empty migration.") {
      console.log("[schema-engine] No schema changes detected.");
    } else {
      // Safety check: refuse to auto-apply destructive or data-sensitive migrations
      const destructivePatterns = /\bDROP\s+(TABLE|COLUMN)\b/i;
      const uniqueIndexPattern = /\bCREATE\s+UNIQUE\s+INDEX\b/i;
      if (destructivePatterns.test(diff) || uniqueIndexPattern.test(diff)) {
        const reason = destructivePatterns.test(diff)
          ? "DROP tables or columns"
          : "add UNIQUE constraints (verify no duplicate data exists before applying)";
        console.error("[schema-engine] MIGRATION REQUIRES REVIEW:");
        console.error(diff);
        console.error(
          `\n[schema-engine] This migration would ${reason}. ` +
          "It has been written to disk for review but NOT applied.\n" +
          "To apply it, run: npx prisma migrate deploy"
        );
        // Still write the file so it can be reviewed and applied manually
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:T]/g, "")
          .slice(0, 14);
        const migrationName = `${timestamp}_auto_REVIEW_REQUIRED`;
        const migrationDir = path.resolve(
          process.cwd(),
          "prisma/migrations",
          migrationName
        );
        fs.mkdirSync(migrationDir, { recursive: true });
        fs.writeFileSync(path.join(migrationDir, "migration.sql"), diff, "utf-8");
        console.log(`[schema-engine] Migration saved for review: ${migrationName}`);
        // Do NOT apply — return early
        return;
      }

      // Safe migration (ADD COLUMN, CREATE TABLE, etc.) — create and apply
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14);
      const migrationName = `${timestamp}_auto`;
      const migrationDir = path.resolve(
        process.cwd(),
        "prisma/migrations",
        migrationName
      );
      fs.mkdirSync(migrationDir, { recursive: true });
      fs.writeFileSync(path.join(migrationDir, "migration.sql"), diff, "utf-8");
      console.log(`[schema-engine] Created migration: ${migrationName}`);
    }

    // Apply any pending migrations (only safe ones reach here)
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    console.log("[schema-engine] Migration complete.");
  } catch (error) {
    console.error("[schema-engine] Migration failed:", error);
    throw error;
  }
}

export function generatePrismaClient(): void {
  console.log("[schema-engine] Generating Prisma client...");
  try {
    execSync("npx prisma generate", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    console.log("[schema-engine] Prisma client generated.");
  } catch (error) {
    console.error("[schema-engine] Client generation failed:", error);
    throw error;
  }
}
