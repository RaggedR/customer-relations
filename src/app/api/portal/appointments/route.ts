/**
 * Patient Portal — Appointments
 *
 * GET  /api/portal/appointments      — list patient's appointments
 * POST /api/portal/appointments      — book a new appointment
 *
 * GET returns appointments for the logged-in patient. Includes date, time,
 * location, specialty, and status. Does NOT include clinical notes or
 * detailed nurse information (privacy by design).
 *
 * POST creates an appointment with status "requested". Validates that
 * the selected slot is still available before booking.
 *
 * Query params (GET):
 *   ?from=2026-04-14&to=2026-04-30 — date range (defaults to past 30 days + next 90 days)
 */

import { NextResponse } from "next/server";
import { patientRoute } from "@/lib/middleware";
import { findAll } from "@/lib/repository";
import { prisma } from "@/lib/prisma";
import { sendAppointmentConfirmation } from "@/lib/email";

const SLOT_MINUTES = 45;

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

export const POST = patientRoute()
  .named("POST /api/portal/appointments")
  .handle(async (ctx) => {
    const body = await ctx.request.json();
    const { date, start_time, specialty } = body;
    const nurse_id = parseInt(body.nurse_id, 10);

    if (!date || !start_time || !nurse_id || !specialty) {
      return NextResponse.json(
        { error: "date, start_time, nurse_id, and specialty are required" },
        { status: 400 },
      );
    }

    if (isNaN(nurse_id)) {
      return NextResponse.json({ error: "nurse_id must be a valid integer" }, { status: 400 });
    }

    // Validate nurse exists and offers the requested specialty
    const nurseSpecialty = await prisma.nurseSpecialty.findFirst({
      where: { nurseId: nurse_id, specialty },
      include: { nurse: { select: { name: true } } },
    });

    if (!nurseSpecialty) {
      return NextResponse.json(
        { error: "Invalid nurse or specialty" },
        { status: 400 },
      );
    }

    const dateObj = new Date(date);

    // Calculate end_time
    const [hours, minutes] = start_time.split(":").map(Number);
    const endMinutes = hours * 60 + minutes + SLOT_MINUTES;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const end_time = `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;

    // Wrap conflict check + create in a serializable transaction to prevent double-booking
    let appointment;
    try {
      appointment = await prisma.$transaction(async (tx) => {
        const conflict = await tx.appointment.findFirst({
          where: {
            nurseId: nurse_id,
            date: dateObj,
            start_time,
            status: { notIn: ["cancelled"] },
          },
        });

        if (conflict) {
          throw Object.assign(new Error("SLOT_UNAVAILABLE"), { code: "SLOT_UNAVAILABLE" });
        }

        return tx.appointment.create({
          data: {
            date: dateObj,
            start_time,
            end_time,
            location: "TBC",
            specialty,
            status: "requested",
            patientId: ctx.patient.id,
            nurseId: nurse_id,
          },
        });
      }, { isolationLevel: "Serializable" });
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "SLOT_UNAVAILABLE") {
        return NextResponse.json(
          { error: "This slot is no longer available. Please choose another." },
          { status: 409 },
        );
      }
      throw err;
    }

    const nurse = nurseSpecialty.nurse;

    ctx.audit({
      action: "book_appointment",
      entity: "appointment",
      entityId: String(appointment.id),
      details: `Patient booked ${specialty} with ${nurse?.name ?? "unknown"} on ${date} at ${start_time}`,
    });

    // Confirmation email to patient (fire-and-forget)
    if (ctx.patient.email) {
      const dateStr = appointment.date.toLocaleDateString("en-AU", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
      sendAppointmentConfirmation({
        to: ctx.patient.email,
        patientName: ctx.patient.name ?? "Patient",
        date: dateStr,
        startTime: appointment.start_time,
        specialty: appointment.specialty,
        location: "TBC",
      });
    }

    return NextResponse.json({
      id: appointment.id,
      date: appointment.date,
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      specialty: appointment.specialty,
      status: appointment.status,
    }, { status: 201 });
  });
