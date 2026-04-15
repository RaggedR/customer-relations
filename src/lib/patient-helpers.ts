/**
 * Shared helpers for the patient portal API routes.
 *
 * Resolves the logged-in user to their patient record by matching email
 * (same pattern as resolveNurse in nurse-helpers.ts).
 */

import { prisma } from "@/lib/prisma";

/**
 * Resolve the logged-in user's patient record by matching email.
 * Returns null if the user is not linked to a patient entity.
 */
export async function resolvePatient(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return null;
  return prisma.patient.findFirst({ where: { email: user.email } });
}
