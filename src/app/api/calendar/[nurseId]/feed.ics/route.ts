/**
 * iCal Feed — Read-only calendar subscription per nurse
 *
 * GET /api/calendar/{nurseId}/feed.ics?token=<raw-bearer-token>
 *
 * Calendar apps subscribe to this URL to see a nurse's appointments.
 * Requires a `token` query parameter: a per-nurse bearer token whose
 * SHA-256 hash is stored in the nurse.feed_token DB column.
 *
 * Tokens are generated via generateFeedToken() in src/lib/bearer-token.ts.
 * Each nurse has exactly one token at a time; call revokeFeedToken() to
 * invalidate it (e.g., before generating a replacement).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyFeedToken } from "@/lib/bearer-token";
import { findAll, findById } from "@/lib/repository";
import { generateCalendarFeed } from "@/lib/ical";
import { withErrorHandler } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/api-helpers";
import { randomUUID } from "crypto";
import type { Row } from "@/lib/parsers";

interface RouteParams {
  params: Promise<{ nurseId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { nurseId: nurseIdStr } = await params;
  const nurseId = parseInt(nurseIdStr, 10);

  if (isNaN(nurseId)) {
    return new NextResponse("Invalid nurse ID", { status: 400 });
  }

  // Validate DB-backed bearer token (calendar apps cannot send cookies)
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token parameter", { status: 401 });
  }

  const valid = await verifyFeedToken(nurseId, token);
  if (!valid) {
    logger.warn({ nurseId }, "iCal feed: rejected invalid token");
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

    // Audit: record each feed access for compliance tracing
    await logAuditEvent({
      action: "ical_feed_access",
      entity: "nurse",
      entityId: String(nurseId),
      details: `iCal feed served (${appointments.length} appointments)`,
      context: {
        userId: null,
        ip: getClientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
        correlationId: randomUUID(),
      },
    });

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
