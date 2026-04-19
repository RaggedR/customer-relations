/**
 * Nurse Portal — Patient Hearing Aids (via Appointment)
 *
 * GET /api/nurse/appointments/[id]/hearing-aids
 *
 * Returns hearing aids for the patient associated with this appointment.
 * Nurse must be assigned to the appointment. Access is audit-logged.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const GET = nurseIdRoute()
  .named("GET /api/nurse/appointments/[id]/hearing-aids")
  .handle(async (ctx) => {
    const appointment = await prisma.appointment.findUnique({
      where: { id: ctx.entityId },
      select: { nurseId: true, patientId: true },
    });

    if (!appointment || appointment.nurseId !== ctx.nurse.id) {
      return NextResponse.json(
        { error: "Appointment not found or not assigned to you" },
        { status: 404 },
      );
    }

    if (!appointment.patientId) {
      return NextResponse.json([], { status: 200 });
    }

    const aids = await prisma.hearingAid.findMany({
      where: { patientId: appointment.patientId! },
      select: {
        id: true,
        ear: true,
        make: true,
        model: true,
        serial_number: true,
        battery_type: true,
        wax_filter: true,
        dome: true,
        warranty_end_date: true,
      },
      orderBy: { ear: "asc" },
    });

    ctx.audit({
      action: "view_patient_hearing_aids",
      entity: "hearing_aid",
      entityId: String(appointment.patientId),
      details: `Nurse ${ctx.nurse.name} viewed ${aids.length} hearing aid(s) for patient #${appointment.patientId} via appointment #${ctx.entityId}`,
    });

    return NextResponse.json(aids);
  });
