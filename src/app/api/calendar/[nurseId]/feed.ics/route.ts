/**
 * iCal Feed — Read-only calendar subscription per nurse
 *
 * GET /api/calendar/{nurseId}/feed.ics?token=HMAC
 *
 * Calendar apps subscribe to this URL to see a nurse's appointments.
 * Requires a `token` query parameter: an HMAC-SHA256 of the nurseId
 * signed with SESSION_SECRET. This allows calendar apps (which cannot
 * send cookies) to authenticate without storing credentials.
 *
 * The admin generates feed URLs containing the token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { findAll, findById } from "@/lib/repository";
import { generateCalendarFeed } from "@/lib/ical";
import { withErrorHandler } from "@/lib/api-helpers";
import { getSecret } from "@/lib/session";
import type { Row } from "@/lib/parsers";

interface RouteParams {
  params: Promise<{ nurseId: string }>;
}

function validateFeedToken(nurseId: string, token: string): boolean {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(nurseId)
    .digest("hex");
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { nurseId: nurseIdStr } = await params;
  const nurseId = parseInt(nurseIdStr, 10);

  if (isNaN(nurseId)) {
    return new NextResponse("Invalid nurse ID", { status: 400 });
  }

  // Validate HMAC token from query string (calendar apps can't send cookies)
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token parameter", { status: 401 });
  }
  if (!validateFeedToken(nurseIdStr, token)) {
    return new NextResponse("Invalid token", { status: 401 });
  }

  return withErrorHandler(`GET /api/calendar/${nurseId}/feed.ics`, async () => {
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
  });
}
