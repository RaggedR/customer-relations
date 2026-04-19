/**
 * Patient Portal — Single Appointment Detail
 *
 * GET /api/portal/appointments/:id
 *
 * Returns a single appointment belonging to the logged-in patient.
 * Only scheduling fields are exposed — no clinical notes or detailed
 * nurse information (privacy by design).
 */

import { NextResponse } from "next/server";
import { patientIdRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const GET = patientIdRoute()
  .named("GET /api/portal/appointments/[id]")
  .handle(async (ctx) => {
    const appointment = await prisma.appointment.findUnique({
      where: { id: ctx.entityId },
    });

    if (!appointment || appointment.patientId !== ctx.patient.id) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      location: appointment.location,
      specialty: appointment.specialty,
      status: appointment.status,
      notes: appointment.notes,
    });
  });
