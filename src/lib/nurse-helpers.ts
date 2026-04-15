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
 * Delegates to resolveNurse to avoid redundant DB queries.
 */
export async function resolveNurseName(userId: number): Promise<string | null> {
  const nurse = await resolveNurse(userId);
  if (nurse) return nurse.name ?? null;
  // resolveNurse already fetched the user; if no nurse record, fall back to
  // the user's name by re-fetching only when necessary.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.name ?? null;
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
