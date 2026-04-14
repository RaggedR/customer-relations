/**
 * Read-Only Prisma Client
 *
 * Used exclusively for AI endpoint queries. Connects as crm_ai_user
 * (crm_readonly role) which can only execute SELECT statements.
 *
 * Defence-in-depth: even if validateAiSql() has a bypass, the DB user
 * physically cannot write, drop, or alter tables.
 *
 * Falls back to the primary DATABASE_URL if DATABASE_URL_READONLY is
 * not configured (development convenience).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "@/lib/logger";

const connectionString =
  process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL || "";

if (!process.env.DATABASE_URL_READONLY) {
  logger.warn(
    "prisma-readonly: DATABASE_URL_READONLY not set — AI queries using read-write DATABASE_URL. " +
    "Set DATABASE_URL_READONLY to the crm_ai_user connection string for write protection.",
  );
}

const globalForReadonly = globalThis as unknown as {
  prismaReadonly: PrismaClient | undefined;
};

function createReadonlyClient() {
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

export const prismaReadonly =
  globalForReadonly.prismaReadonly ?? createReadonlyClient();

if (process.env.NODE_ENV !== "production") {
  globalForReadonly.prismaReadonly = prismaReadonly;
}
