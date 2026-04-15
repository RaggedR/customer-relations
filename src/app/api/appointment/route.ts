/**
 * Appointment API — List & Create
 *
 * GET  /api/appointment?dateFrom=...&dateTo=...&nurseId=...
 * POST /api/appointment
 *
 * Shadows the generic [entity] catch-all to add date range filtering
 * and CalDAV push on create.
 */

import { NextRequest, NextResponse } from "next/server";
import { findAll, create, validateEntity } from "@/lib/repository";
import { pushAppointment } from "@/lib/caldav-client";
import { withErrorHandler } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const nurseId = searchParams.get("nurseId");
  const search = searchParams.get("search") || undefined;
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");

  const filterBy: Record<string, unknown> = {};
  if (nurseId) filterBy.nurseId = parseInt(nurseId, 10);

  return withErrorHandler("GET /api/appointment", async () => {
    const items = await findAll("appointment", {
      search,
      filterBy: Object.keys(filterBy).length > 0 ? filterBy : undefined,
      dateRange: dateFrom && dateTo
        ? { field: "date", from: dateFrom, to: dateTo }
        : undefined,
      sortBy: "date",
      sortOrder: "asc",
      page: pageParam ? parseInt(pageParam, 10) : undefined,
      pageSize: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
      shallow: !!pageParam,
    });
    return NextResponse.json(items);
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandler("POST /api/appointment", async () => {
    const body = await request.json();
    const errors = validateEntity("appointment", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await create("appointment", body);

    // CalDAV push (fire-and-forget, don't block the response)
    pushAppointment(item as Record<string, unknown>).catch((err) =>
      logger.error({ err }, "CalDAV push failed")
    );

    return NextResponse.json(item, { status: 201 });
  });
}
