/**
 * Nurse Portal — Appointment List
 *
 * GET /api/nurse/appointments
 *
 * Returns appointments for the logged-in nurse. Includes patient name
 * (scheduling context) but NO clinical data (notes, referrals).
 *
 * Query params:
 *   ?from=2026-04-14&to=2026-04-21  — date range (defaults to today + 7 days)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { resolveNurse } from "@/lib/nurse-helpers";

export async function GET(request: NextRequest) {
  return withErrorHandler("GET /api/nurse/appointments", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "nurse") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nurse = await resolveNurse(session.userId);
    if (!nurse) {
      return NextResponse.json(
        { error: "No nurse profile linked to this account" },
        { status: 403 },
      );
    }

    // Date range: default to today + 7 days
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const fromStr = searchParams.get("from") ?? now.toISOString().split("T")[0];
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() + 7);
    const toStr = searchParams.get("to") ?? toDate.toISOString().split("T")[0];

    const appointments = await prisma.appointment.findMany({
      where: {
        nurseId: nurse.id,
        date: {
          gte: new Date(fromStr),
          lte: new Date(toStr + "T23:59:59"),
        },
      },
      include: {
        patient: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { start_time: "asc" }],
    });

    // Return scheduling data only — no clinical content
    const result = appointments.map((appt) => ({
      id: appt.id,
      date: appt.date,
      startTime: appt.start_time,
      endTime: appt.end_time,
      location: appt.location,
      specialty: appt.specialty,
      status: appt.status,
      patientName: appt.patient?.name ?? "Unknown",
      patientId: appt.patient?.id,
    }));

    return NextResponse.json(result);
  });
}
