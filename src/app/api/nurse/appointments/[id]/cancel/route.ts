/**
 * Nurse Portal — Cancel Appointment
 *
 * POST /api/nurse/appointments/[id]/cancel
 * Body: { reason: string }
 *
 * Only the assigned nurse can cancel their own appointments.
 * Sends cancellation notifications to the patient (to reschedule)
 * and to the admin (Clare) for visibility.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { verifyAppointmentOwnership } from "@/lib/nurse-helpers";
import { prisma } from "@/lib/prisma";
import { sendCancellationToPatient, sendCancellationToAdmin } from "@/lib/email";

const MAX_REASON_LENGTH = 2000;

export const POST = nurseIdRoute()
  .named("POST /api/nurse/appointments/[id]/cancel")
  .handle(async (ctx) => {
    const appointment = await verifyAppointmentOwnership(ctx.entityId, ctx.nurse.id);
    if (!appointment) {
      return NextResponse.json(
        { error: "Appointment not found or not assigned to you" },
        { status: 404 },
      );
    }

    const body = await ctx.request.json();
    const reason = typeof body.reason === "string"
      ? body.reason.slice(0, MAX_REASON_LENGTH)
      : "";

    // Look up patient details for notification emails
    const patient = appointment.patientId
      ? await prisma.patient.findUnique({
          where: { id: appointment.patientId },
          select: { name: true, email: true },
        })
      : null;

    // Include nurseId in the WHERE clause so the UPDATE itself is atomic — no
    // separate ownership check can race with this write.
    try {
      await prisma.appointment.update({
        where: { id: ctx.entityId, nurseId: ctx.nurse.id },
        data: {
          status: "cancelled",
          notes: reason || null,
        },
      });
    } catch (err) {
      // P2025: record not found (either deleted or reassigned between read and write)
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        return NextResponse.json(
          { error: "Appointment not found or not assigned to you" },
          { status: 404 },
        );
      }
      throw err;
    }

    ctx.audit({
      action: "cancel",
      entity: "appointment",
      entityId: String(ctx.entityId),
      details: `nurse ${ctx.nurse.name} cancelled appointment #${ctx.entityId}${reason ? ` reason: ${reason.slice(0, 200)}` : ""}`,
    });

    // Fire-and-forget: email failures must not block the cancellation response
    const dateStr = new Date(appointment.date).toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    if (patient?.email) {
      sendCancellationToPatient({
        to: patient.email,
        patientName: patient.name ?? "Patient",
        date: dateStr,
        startTime: appointment.start_time ?? "",
        specialty: appointment.specialty ?? "Appointment",
        reason: reason || undefined,
      });
    }

    sendCancellationToAdmin({
      nurseName: ctx.nurse.name ?? "Unknown Nurse",
      patientName: patient?.name ?? `Patient #${appointment.patientId}`,
      date: dateStr,
      startTime: appointment.start_time ?? "",
      specialty: appointment.specialty ?? "Appointment",
      reason: reason || undefined,
      appointmentId: ctx.entityId,
    });

    return NextResponse.json({ success: true });
  });
