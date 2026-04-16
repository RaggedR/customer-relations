/**
 * Patient Portal — Appointments
 *
 * GET /api/portal/appointments
 *
 * Returns appointments for the logged-in patient. Includes date, time,
 * location, specialty, and status. Does NOT include clinical notes or
 * detailed nurse information (privacy by design).
 *
 * Query params:
 *   ?from=2026-04-14&to=2026-04-30 — date range (defaults to past 30 days + next 90 days)
 */

import { NextResponse } from "next/server";
import { patientRoute } from "@/lib/middleware";
import { findAll } from "@/lib/repository";

export const GET = patientRoute()
  .named("GET /api/portal/appointments")
  .handle(async (ctx) => {
    // Default: past 30 days to next 90 days
    const { searchParams } = new URL(ctx.request.url);
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - 30);
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 90);

    const fromStr = searchParams.get("from") ?? pastDate.toISOString().split("T")[0];
    const toStr = searchParams.get("to") ?? futureDate.toISOString().split("T")[0];

    const appointments = await findAll("appointment", {
      filterBy: { patient: ctx.patient.id },
      dateRange: { field: "date", from: fromStr, to: toStr + "T23:59:59" },
      sortBy: "date",
      sortOrder: "asc",
    }) as Record<string, unknown>[];

    // Return scheduling data only — no clinical content, minimal nurse info
    const result = appointments.map((appt) => ({
      id: appt.id,
      date: appt.date,
      startTime: appt.start_time,
      endTime: appt.end_time,
      location: appt.location,
      specialty: appt.specialty,
      status: appt.status,
    }));

    return NextResponse.json(result);
  });
