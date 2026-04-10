/**
 * Auto-Migration
 *
 * Runs `prisma db push` to sync the generated Prisma schema with the database.
 * Used during development — pushes schema changes without creating migration files.
 */

import { execSync } from "child_process";

export function runMigration(): void {
  console.log("[schema-engine] Running auto-migration (prisma db push)...");
  try {
    execSync("npx prisma db push --accept-data-loss", {
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
