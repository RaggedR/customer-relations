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
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { resolveNurse, requireAupAcknowledgement } from "@/lib/nurse-helpers";
import { findAll } from "@/lib/repository";

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

    const aupError = requireAupAcknowledgement(nurse);
    if (aupError) return aupError;

    // Date range: default to today + 7 days
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const fromStr = searchParams.get("from") ?? now.toISOString().split("T")[0];
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() + 7);
    const toStr = searchParams.get("to") ?? toDate.toISOString().split("T")[0];

    // findAll supports single-field sort only. The original query used a compound
    // sort [date asc, start_time asc] for stable same-day ordering.
    // Compound sort support is tracked in issue #17 — until then, appointments
    // on the same calendar day may arrive in Postgres heap order.
    const appointments = await findAll("appointment", {
      filterBy: { nurseId: nurse.id },
      dateRange: { field: "date", from: fromStr, to: toStr + "T23:59:59" },
      sortBy: "date",
      sortOrder: "asc",
    }) as Record<string, unknown>[];

    // Return scheduling data only — no clinical content
    const result = appointments.map((appt) => {
      const patient = appt.patient as Record<string, unknown> | null | undefined;
      return {
        id: appt.id,
        date: appt.date,
        startTime: appt.start_time,
        endTime: appt.end_time,
        location: appt.location,
        specialty: appt.specialty,
        status: appt.status,
        patientName: (patient?.name as string) ?? "Unknown",
        patientId: patient?.id,
      };
    });

    return NextResponse.json(result);
  });
}
