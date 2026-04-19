/**
 * Nurse Portal — Patient Hearing Aids (via Records)
 *
 * GET /api/nurse/records/[patientId]/hearing-aids
 *
 * Returns hearing aids for a patient the nurse is assigned to.
 * Access is audit-logged.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const GET = nurseIdRoute()
  .named("GET /api/nurse/records/[patientId]/hearing-aids")
  .handle(async (ctx) => {
    const patientId = ctx.entityId;

    // Verify the nurse has at least one appointment with this patient
    const hasAppointment = await prisma.appointment.findFirst({
      where: { nurseId: ctx.nurse.id, patientId },
      select: { id: true },
    });

    if (!hasAppointment) {
      ctx.audit({
        action: "access_denied",
        entity: "patient",
        entityId: String(patientId),
        details: `Nurse ${ctx.nurse.name} attempted to view hearing aids for non-assigned patient #${patientId}`,
      });
      return NextResponse.json(
        { error: "Patient not found or not assigned to you" },
        { status: 404 },
      );
    }

    const aids = await prisma.hearingAid.findMany({
      where: { patientId },
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
      entityId: String(patientId),
      details: `Nurse ${ctx.nurse.name} viewed ${aids.length} hearing aid(s) for patient #${patientId}`,
    });

    return NextResponse.json(aids);
  });
