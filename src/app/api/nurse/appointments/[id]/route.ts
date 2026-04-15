/**
 * Nurse Portal — Single Appointment Detail
 *
 * GET /api/nurse/appointments/[id]
 *
 * Returns a single appointment's scheduling data if it belongs to the
 * logged-in nurse. No clinical data (notes, referrals) is included.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { parseIdParam } from "@/lib/route-factory";
import { resolveNurse, requireAupAcknowledgement } from "@/lib/nurse-helpers";
import { findById } from "@/lib/repository";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("GET /api/nurse/appointments/[id]", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "nurse") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idResult = await parseIdParam(params);
    if (idResult instanceof NextResponse) return idResult;
    const appointmentId = idResult;

    const nurse = await resolveNurse(session.userId);
    if (!nurse) {
      return NextResponse.json({ error: "No nurse profile linked to this account" }, { status: 403 });
    }

    const aupError = requireAupAcknowledgement(nurse);
    if (aupError) return aupError;

    const appointment = await findById("appointment", appointmentId) as Record<string, unknown> | null;

    if (!appointment || appointment.nurseId !== nurse.id) {
      return NextResponse.json({ error: "Appointment not found or not assigned to you" }, { status: 404 });
    }

    const patient = appointment.patient as Record<string, unknown> | null | undefined;
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
}
