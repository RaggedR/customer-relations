/**
 * Schema Engine Startup
 *
 * Flow: load YAML → generate Prisma schema → auto-migrate → generate client
 * Run this before starting the app.
 */

import { loadSchema } from "./schema-loader";
import { writePrismaSchema } from "./prisma-generator";
import { runMigration, generatePrismaClient } from "./migrate";

export function startupSchemaEngine(): void {
  console.log("[schema-engine] Starting up...");

  // 1. Load and validate schema.yaml
  const schema = loadSchema();
  const entityNames = Object.keys(schema.entities);
  console.log(`[schema-engine] Loaded schema with entities: ${entityNames.join(", ")}`);

  // 2. Generate prisma/schema.prisma
  writePrismaSchema(schema);
  console.log("[schema-engine] Generated prisma/schema.prisma");

  // 3. Auto-migrate database
  runMigration();

  // 4. Generate Prisma client
  generatePrismaClient();

  console.log("[schema-engine] Startup complete.");
}

// Allow running directly: npx ts-node src/engine/startup.ts
if (require.main === module) {
  startupSchemaEngine();
}
