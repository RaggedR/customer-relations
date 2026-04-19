/**
 * Available Appointment Slots
 *
 * GET /api/slots?specialty=Audiology&from=2026-04-20&to=2026-05-20
 *
 * Computes available appointment slots by:
 * 1. Finding nurses with the requested specialty
 * 2. Reading each nurse's availability (from NurseAvailability table)
 * 3. Subtracting existing appointments
 * 4. Returning remaining slots with nurse name
 *
 * Architecture: The availability source is the NurseAvailability table.
 * A future CalDAV adapter could also write to this table from Google
 * Calendar free/busy data, making external calendars transparent.
 *
 * This is a public endpoint (no auth required) so patients can browse
 * slots before logging in. No clinical data is exposed.
 */

import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

const SLOT_MINUTES = 45;

export const GET = publicRoute()
  .named("GET /api/slots")
  .handle(async (ctx) => {
    const { searchParams } = new URL(ctx.request.url);
    const specialty = searchParams.get("specialty");
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    if (!specialty) {
      return NextResponse.json({ error: "specialty is required" }, { status: 400 });
    }

    const now = new Date();
    const from = fromStr ? new Date(fromStr) : now;
    const toDefault = new Date(now);
    toDefault.setDate(toDefault.getDate() + 30);
    const to = toStr ? new Date(toStr) : toDefault;

    // Validate dates and clamp range (public endpoint — prevent resource exhaustion)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    const MAX_RANGE_DAYS = 60;
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 },
      );
    }

    // 1. Find nurses with the requested specialty
    const nurseSpecialties = await prisma.nurseSpecialty.findMany({
      where: { specialty: { equals: specialty, mode: "insensitive" } },
      select: { nurseId: true },
    });

    const nurseIds = nurseSpecialties
      .map((ns) => ns.nurseId)
      .filter((id): id is number => id !== null);

    if (nurseIds.length === 0) {
      return NextResponse.json({ slots: [] });
    }

    // Load nurse names
    const nurses = await prisma.nurse.findMany({
      where: { id: { in: nurseIds } },
      select: { id: true, name: true },
    });
    const nurseMap = new Map(nurses.map((n) => [n.id, n.name]));

    // 2. Read availability for these nurses
    const [oneOffSlots, recurringSlots] = await Promise.all([
      prisma.nurseAvailability.findMany({
        where: {
          nurseId: { in: nurseIds },
          recurring: { not: true },
          date: { gte: from, lte: to },
        },
      }),
      prisma.nurseAvailability.findMany({
        where: {
          nurseId: { in: nurseIds },
          recurring: true,
        },
      }),
    ]);

    // 3. Read existing appointments to subtract
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        nurseId: { in: nurseIds },
        date: { gte: from, lte: to },
        status: { notIn: ["cancelled"] },
      },
      select: { nurseId: true, date: true, start_time: true },
    });

    // Build a set of booked slots: "nurseId:date:startTime"
    const bookedSet = new Set(
      existingAppointments.map((a) =>
        `${a.nurseId}:${a.date.toISOString().split("T")[0]}:${a.start_time}`
      ),
    );

    // 4. Expand all availability into concrete date slots
    const availableSlots: Array<{
      date: string;
      start_time: string;
      end_time: string;
      nurse_name: string;
      nurse_id: number;
    }> = [];

    // One-off slots
    for (const slot of oneOffSlots) {
      const dateStr = slot.date.toISOString().split("T")[0];
      const key = `${slot.nurseId}:${dateStr}:${slot.start_time}`;
      if (!bookedSet.has(key) && new Date(dateStr) >= now) {
        availableSlots.push({
          date: dateStr,
          start_time: slot.start_time,
          end_time: slot.end_time,
          nurse_name: nurseMap.get(slot.nurseId) ?? "Unknown",
          nurse_id: slot.nurseId,
        });
      }
    }

    // Recurring slots — expand to each matching day in the date range
    for (const slot of recurringSlots) {
      const dayOfWeek = slot.day_of_week ?? 0;
      // Find the first occurrence of this day_of_week at or after `from`
      const d = new Date(from);
      const currentDay = (d.getDay() + 6) % 7; // Mon=0
      let daysUntil = dayOfWeek - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      d.setDate(d.getDate() + daysUntil);

      while (d <= to) {
        const dateStr = d.toISOString().split("T")[0];
        const key = `${slot.nurseId}:${dateStr}:${slot.start_time}`;
        if (!bookedSet.has(key) && d >= now) {
          availableSlots.push({
            date: dateStr,
            start_time: slot.start_time,
            end_time: slot.end_time,
            nurse_name: nurseMap.get(slot.nurseId) ?? "Unknown",
            nurse_id: slot.nurseId,
          });
        }
        d.setDate(d.getDate() + 7);
      }
    }

    // Sort by date then time
    availableSlots.sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.start_time.localeCompare(b.start_time);
    });

    return NextResponse.json({ slots: availableSlots });
  });
