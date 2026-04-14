/**
 * Nurse Portal — Single Appointment Detail
 *
 * GET /api/nurse/appointments/[id]
 *
 * Returns a single appointment's scheduling data if it belongs to the
 * logged-in nurse. No clinical data (notes, referrals) is included.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { resolveNurse } from "@/lib/nurse-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("GET /api/nurse/appointments/[id]", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "nurse") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const appointmentId = parseInt(id, 10);
    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const nurse = await resolveNurse(session.userId);
    if (!nurse) {
      return NextResponse.json({ error: "No nurse profile linked to this account" }, { status: 403 });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { id: true, name: true } },
      },
    });

    if (!appointment || appointment.nurseId !== nurse.id) {
      return NextResponse.json({ error: "Appointment not found or not assigned to you" }, { status: 404 });
    }

    return NextResponse.json({
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      location: appointment.location,
      specialty: appointment.specialty,
      status: appointment.status,
      patientName: appointment.patient?.name ?? "Unknown",
      patientId: appointment.patient?.id,
    });
  });
}
