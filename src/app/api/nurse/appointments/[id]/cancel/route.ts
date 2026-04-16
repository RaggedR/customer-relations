/**
 * Nurse Portal — Cancel Appointment
 *
 * POST /api/nurse/appointments/[id]/cancel
 * Body: { reason: string }
 *
 * Only the assigned nurse can cancel their own appointments.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { verifyAppointmentOwnership } from "@/lib/nurse-helpers";
import { prisma } from "@/lib/prisma";

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

    // Direct Prisma: atomic ownership check prevents TOCTOU — repository.update() cannot express WHERE { id, nurseId }
    await prisma.appointment.update({
      where: { id: ctx.entityId },
      data: {
        status: "cancelled",
        notes: reason || null,
      },
    });

    ctx.audit({
      action: "cancel",
      entity: "appointment",
      entityId: String(ctx.entityId),
      details: `nurse ${ctx.nurse.name} cancelled appointment #${ctx.entityId}${reason ? ` reason: ${reason.slice(0, 200)}` : ""}`,
    });

    return NextResponse.json({ success: true });
  });
