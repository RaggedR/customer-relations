/**
 * Shared helpers for the patient portal API routes.
 *
 * Resolves the logged-in user to their patient record. Prefers the FK
 * relation (Patient.userId) and falls back to email-matching for legacy
 * records that pre-date the FK column.
 */

import { prisma } from "@/lib/prisma";

/**
 * Resolve the logged-in user's patient record.
 *
 * Strategy:
 * 1. Try the FK relation (Patient.userId == userId) — O(1) index lookup.
 * 2. Fall back to email match for legacy records created before the FK
 *    column was added (Patient.userId IS NULL).
 *
 * Returns null if the user is not linked to a patient entity.
 */
export async function resolvePatient(userId: number) {
  // 1. FK-first: fast path for records with the userId column populated.
  const byFk = await prisma.patient.findFirst({ where: { userId } });
  if (byFk) return byFk;

  // 2. Legacy fallback: email match for records that pre-date the FK.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return null;
  return prisma.patient.findFirst({ where: { email: user.email, userId: null } });
}
