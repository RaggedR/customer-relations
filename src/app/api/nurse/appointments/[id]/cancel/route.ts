/**
 * Nurse Portal — Cancel Appointment
 *
 * POST /api/nurse/appointments/[id]/cancel
 * Body: { reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("POST /api/nurse/appointments/[id]/cancel", async () => {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const appointmentId = parseInt(id, 10);
    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const reason = body.reason ?? "";

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "cancelled",
        notes: reason || null,
      },
    });

    return NextResponse.json({ success: true });
  });
}
