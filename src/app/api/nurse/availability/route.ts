/**
 * Nurse Portal — Availability Management
 *
 * GET  /api/nurse/availability?week=2026-04-21  — get slots for a week
 * POST /api/nurse/availability                   — create a new availability slot
 *
 * Each slot is a 45-minute block. Recurring slots repeat every week
 * on the same day_of_week. The GET endpoint expands recurring slots
 * into concrete dates for the requested week.
 *
 * TIMEZONE: All dates are stored and compared as date-only strings
 * (YYYY-MM-DD) to avoid UTC/local timezone shifts. The Prisma DateTime
 * field stores noon UTC to avoid date boundary issues.
 */

import { NextResponse } from "next/server";
import { nurseRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

const SLOT_DURATION_MINUTES = 45;

/** Parse YYYY-MM-DD and return a Date at noon UTC (avoids timezone date shifts) */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Format a Date to YYYY-MM-DD using UTC (safe because we store at noon UTC) */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Get Monday of the week containing the given date string */
function getMonday(dateStr: string): string {
  const d = parseDate(dateStr);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return formatDate(d);
}

/** Add days to a date string */
function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export const GET = nurseRoute()
  .named("GET /api/nurse/availability")
  .handle(async (ctx) => {
    const { searchParams } = new URL(ctx.request.url);
    const weekParam = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const mondayStr = getMonday(weekParam);
    const sundayStr = addDays(mondayStr, 6);
    const weekEndStr = addDays(mondayStr, 7);

    const mondayDate = parseDate(mondayStr);
    const weekEndDate = parseDate(weekEndStr);

    // Get one-off slots for this week
    const oneOffSlots = await prisma.nurseAvailability.findMany({
      where: {
        nurseId: ctx.nurse.id,
        recurring: { not: true },
        date: { gte: mondayDate, lt: weekEndDate },
      },
      orderBy: [{ date: "asc" }, { start_time: "asc" }],
    });

    // Get recurring slots (any date — we'll map them to this week)
    const recurringSlots = await prisma.nurseAvailability.findMany({
      where: {
        nurseId: ctx.nurse.id,
        recurring: true,
      },
    });

    // Expand recurring slots to concrete dates for this week
    const expandedRecurring = recurringSlots.map((slot) => {
      const dayOfWeek = slot.day_of_week ?? 0;
      const concreteDate = addDays(mondayStr, dayOfWeek);
      return {
        id: slot.id,
        date: concreteDate,
        day_of_week: dayOfWeek,
        start_time: slot.start_time,
        end_time: slot.end_time,
        recurring: true,
      };
    });

    const oneOffMapped = oneOffSlots.map((slot) => ({
      id: slot.id,
      date: formatDate(slot.date),
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      recurring: false,
    }));

    // Get existing appointments for this week (for overlay)
    const appointments = await prisma.appointment.findMany({
      where: {
        nurseId: ctx.nurse.id,
        date: { gte: mondayDate, lt: weekEndDate },
        status: { notIn: ["cancelled"] },
      },
      select: { date: true, start_time: true, end_time: true },
    });

    const bookedSlots = appointments.map((a) => ({
      date: formatDate(a.date),
      start_time: a.start_time,
      end_time: a.end_time,
    }));

    return NextResponse.json({
      weekStart: mondayStr,
      slots: [...oneOffMapped, ...expandedRecurring],
      booked: bookedSlots,
    });
  });

export const POST = nurseRoute()
  .named("POST /api/nurse/availability")
  .handle(async (ctx) => {
    const body = await ctx.request.json();
    const { date, start_time, recurring } = body;

    if (!date || !start_time) {
      return NextResponse.json(
        { error: "date and start_time are required" },
        { status: 400 },
      );
    }

    // Store at noon UTC to avoid timezone date boundary issues
    const dateObj = parseDate(date);
    const dayOfWeek = dateObj.getUTCDay();
    // Convert Sun=0..Sat=6 to Mon=0..Sun=6
    const mondayBasedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Calculate end_time from start_time + 45 min
    const [hours, minutes] = start_time.split(":").map(Number);
    const endMinutes = hours * 60 + minutes + SLOT_DURATION_MINUTES;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const end_time = `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;

    // Check for duplicate
    const existing = await prisma.nurseAvailability.findFirst({
      where: {
        nurseId: ctx.nurse.id,
        start_time,
        ...(recurring
          ? { recurring: true, day_of_week: mondayBasedDay }
          : { recurring: { not: true }, date: dateObj }),
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Slot already exists" },
        { status: 409 },
      );
    }

    const slot = await prisma.nurseAvailability.create({
      data: {
        nurseId: ctx.nurse.id,
        date: dateObj,
        day_of_week: recurring ? mondayBasedDay : null,
        start_time,
        end_time,
        recurring: recurring ?? false,
      },
    });

    return NextResponse.json({
      id: slot.id,
      date: formatDate(slot.date),
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      recurring: slot.recurring,
    }, { status: 201 });
  });
