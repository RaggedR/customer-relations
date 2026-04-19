/**
 * Shared helpers for the nurse portal API routes.
 *
 * Resolves the logged-in user to their nurse record and verifies
 * appointment ownership (the nurse is assigned to the appointment).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Resolve the logged-in user's nurse record.
 *
 * Strategy:
 * 1. Try the FK relation (Nurse.userId == userId) — O(1) index lookup.
 * 2. Fall back to email match for legacy records created before the FK
 *    column was added (Nurse.userId IS NULL).
 *
 * Returns null if the user is not linked to a nurse entity.
 */
export async function resolveNurse(userId: number) {
  const include = { user: { select: { must_change_password: true } } };

  // 1. FK-first: fast path for records with the userId column populated.
  const byFk = await prisma.nurse.findFirst({ where: { userId }, include });
  if (byFk) return byFk;

  // 2. Legacy fallback: email match for records that pre-date the FK.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return null;
  return prisma.nurse.findFirst({ where: { email: user.email, userId: null }, include });
}

/**
 * Check that the nurse's user account does not require a password change.
 *
 * Returns a 403 NextResponse if must_change_password is true, or null if
 * the password is current. Checked before AUP — password change takes priority.
 */
export function requirePasswordChanged(
  nurse: { user?: { must_change_password: boolean | null } | null },
): NextResponse | null {
  if (nurse.user?.must_change_password) {
    return NextResponse.json(
      {
        error: "password_change_required",
        message: "You must change your password before accessing the nurse portal.",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Check that a nurse has acknowledged the Acceptable Use Policy.
 *
 * Returns a 403 NextResponse if `aup_acknowledged_at` is null, or null if
 * the nurse has acknowledged. Call this after resolveNurse() in every nurse
 * portal route.
 *
 * Usage:
 *   const aupError = requireAupAcknowledgement(nurse);
 *   if (aupError) return aupError;
 */
export function requireAupAcknowledgement(
  nurse: { aup_acknowledged_at: Date | null },
): NextResponse | null {
  if (!nurse.aup_acknowledged_at) {
    return NextResponse.json(
      {
        error: "aup_required",
        message:
          "You must acknowledge the Acceptable Use Policy before accessing the nurse portal.",
      },
      { status: 403 },
    );
  }
  return null;
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
    select: { id: true, nurseId: true, patientId: true, date: true, start_time: true, specialty: true },
  });
  if (!appointment || appointment.nurseId !== nurseId) return null;
  return appointment;
}
