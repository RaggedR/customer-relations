/**
 * Shared helpers for the nurse portal API routes.
 *
 * Resolves the logged-in user to their nurse record and verifies
 * appointment ownership (the nurse is assigned to the appointment).
 */

import { prisma } from "@/lib/prisma";

/**
 * Resolve the logged-in user's nurse record by matching email.
 * Returns null if the user is not linked to a nurse entity.
 */
export async function resolveNurse(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return null;
  return prisma.nurse.findFirst({ where: { email: user.email } });
}

/**
 * Resolve the nurse's display name from their userId.
 */
export async function resolveNurseName(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return user?.name ?? null;
  const nurse = await prisma.nurse.findFirst({ where: { email: user.email } });
  return nurse?.name ?? user.name ?? null;
}

/**
 * Verify the appointment belongs to the given nurse.
 * Returns the appointment (with nurseId and patientId) or null.
 */
export async function verifyAppointmentOwnership(
  appointmentId: number,
  nurseId: number,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, nurseId: true, patientId: true },
  });
  if (!appointment || appointment.nurseId !== nurseId) return null;
  return appointment;
}
