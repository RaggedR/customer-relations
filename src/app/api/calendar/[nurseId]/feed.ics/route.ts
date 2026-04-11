/**
 * iCal Feed — Read-only calendar subscription per nurse
 *
 * GET /api/calendar/{nurseId}/feed.ics
 *
 * Any calendar app can subscribe to this URL to see a nurse's
 * appointments. Simpler than full CalDAV — just a GET that
 * returns all events as a VCALENDAR.
 */

import { NextRequest, NextResponse } from "next/server";
import { findAll, findById } from "@/lib/repository";
import { generateCalendarFeed } from "@/lib/ical";

interface RouteParams {
  params: Promise<{ nurseId: string }>;
}

type Row = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { nurseId: nurseIdStr } = await params;
  const nurseId = parseInt(nurseIdStr, 10);

  if (isNaN(nurseId)) {
    return new NextResponse("Invalid nurse ID", { status: 400 });
  }

  try {
    const nurse = (await findById("nurse", nurseId)) as Row | null;
    if (!nurse) {
      return new NextResponse("Nurse not found", { status: 404 });
    }

    const appointments = (await findAll("appointment", {
      filterBy: { nurseId },
      sortBy: "date",
      sortOrder: "asc",
    })) as Row[];

    const calName = `${nurse.name} — Customer Relations`;
    const ical = generateCalendarFeed(appointments, calName);

    return new NextResponse(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="nurse-${nurseId}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error(`iCal feed error for nurse ${nurseId}:`, error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
