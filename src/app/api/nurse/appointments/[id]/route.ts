/**
 * Nurse Portal — Single Appointment Detail
 *
 * GET /api/nurse/appointments/[id]
 *
 * Returns a single appointment's scheduling data if it belongs to the
 * logged-in nurse. No clinical data (notes, referrals) is included.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { findById } from "@/lib/repository";

export const GET = nurseIdRoute()
  .named("GET /api/nurse/appointments/[id]")
  .handle(async (ctx) => {
    const appointment = await findById("appointment", ctx.entityId) as Record<string, unknown> | null;

    if (!appointment || appointment.nurseId !== ctx.nurse.id) {
      return NextResponse.json(
        { error: "Appointment not found or not assigned to you" },
        { status: 404 },
      );
    }

    // Audit: nurse viewed specific appointment (patient name exposed)
    const patient = appointment.patient as Record<string, unknown> | null | undefined;
    ctx.audit({
      action: "view_appointment",
      entity: "appointment",
      entityId: String(ctx.entityId),
      details: `Patient #${patient?.id ?? "unknown"}`,
    });

    return NextResponse.json({
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      location: appointment.location,
      specialty: appointment.specialty,
      status: appointment.status,
      patientName: (patient?.name as string) ?? "Unknown",
      patientId: patient?.id,
    });
  });
