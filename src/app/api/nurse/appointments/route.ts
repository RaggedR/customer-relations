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

import { NextResponse } from "next/server";
import { nurseRoute } from "@/lib/middleware";
import { findAll } from "@/lib/repository";

export const GET = nurseRoute()
  .named("GET /api/nurse/appointments")
  .handle(async (ctx) => {
    // Date range: default to today + 7 days
    const { searchParams } = new URL(ctx.request.url);
    const now = new Date();
    const fromStr = searchParams.get("from") ?? now.toISOString().split("T")[0];
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() + 7);
    const toStr = searchParams.get("to") ?? toDate.toISOString().split("T")[0];

    const appointments = await findAll("appointment", {
      filterBy: { nurseId: ctx.nurse.id },
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

    // Audit: nurse viewed patient scheduling data (names exposed)
    ctx.audit({
      action: "view_schedule",
      entity: "appointment",
      entityId: "list",
      details: `Viewed ${result.length} appointments (${fromStr} to ${toStr})`,
    });

    return NextResponse.json(result);
  });
