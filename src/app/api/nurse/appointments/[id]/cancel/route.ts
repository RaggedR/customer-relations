/**
 * Nurse Portal — Cancel Appointment
 *
 * POST /api/nurse/appointments/[id]/cancel
 * Body: { reason: string }
 *
 * Only the assigned nurse can cancel their own appointments.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { parseIdParam } from "@/lib/route-factory";
import { logAuditEvent } from "@/lib/audit";
import { extractRequestContext } from "@/lib/request-context";
import { resolveNurse, verifyAppointmentOwnership } from "@/lib/nurse-helpers";
import { prisma } from "@/lib/prisma";

const MAX_REASON_LENGTH = 2000;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("POST /api/nurse/appointments/[id]/cancel", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "nurse") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = extractRequestContext(request, session);
    const idResult = await parseIdParam(params);
    if (idResult instanceof NextResponse) return idResult;
    const appointmentId = idResult;

    // Verify nurse identity and appointment ownership
    const nurse = await resolveNurse(session.userId);
    if (!nurse) {
      return NextResponse.json({ error: "No nurse profile linked to this account" }, { status: 403 });
    }

    const appointment = await verifyAppointmentOwnership(appointmentId, nurse.id);
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found or not assigned to you" }, { status: 404 });
    }

    const body = await request.json();
    const reason = typeof body.reason === "string"
      ? body.reason.slice(0, MAX_REASON_LENGTH)
      : "";

    // Direct Prisma: atomic ownership check prevents TOCTOU — repository.update() cannot express WHERE { id, nurseId }
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "cancelled",
        notes: reason || null,
      },
    });

    // Audit log — nurse cancelled appointment
    logAuditEvent({
      action: "cancel",
      entity: "appointment",
      entityId: String(appointmentId),
      details: `nurse ${nurse.name} cancelled appointment #${appointmentId}${reason ? ` reason: ${reason.slice(0, 200)}` : ""}`,
      context: ctx,
    });

    return NextResponse.json({ success: true });
  });
}
