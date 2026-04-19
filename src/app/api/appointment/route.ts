/**
 * Appointment API — List & Create
 *
 * GET  /api/appointment?dateFrom=...&dateTo=...&nurseId=...
 * POST /api/appointment
 *
 * Shadows the generic [entity] catch-all to add date range filtering
 * and CalDAV push on create.
 *
 * Uses the composable middleware stack (adminRoute) for auth, tracing,
 * and audit logging — same as the route factory.
 */

import { NextResponse } from "next/server";
import { findAll, create, validateEntity } from "@/lib/repository";
import { pushAppointment } from "@/lib/caldav-client";
import { getIdempotentResponse, cacheIdempotentResponse, MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/idempotency";
import { adminRoute } from "@/lib/middleware";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendAppointmentConfirmation } from "@/lib/email";

export const GET = adminRoute()
  .named("GET /api/appointment")
  .handle(async (ctx) => {
    const { searchParams } = new URL(ctx.request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const nurseId = searchParams.get("nurseId");
    const search = searchParams.get("search") || undefined;
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");

    const filterBy: Record<string, unknown> = {};
    if (nurseId) filterBy.nurseId = parseInt(nurseId, 10);

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

export const POST = adminRoute()
  .named("POST /api/appointment")
  .handle(async (ctx) => {
    // Idempotency: prevent duplicate appointments from network retries / double-clicks
    const rawKey = ctx.request.headers.get("idempotency-key");
    if (rawKey && rawKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return NextResponse.json(
        { error: `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters` },
        { status: 400 },
      );
    }
    const idempotencyKey = rawKey ? `appointment:${ctx.userId}:${rawKey}` : null;
    if (idempotencyKey) {
      const cached = getIdempotentResponse(idempotencyKey);
      if (cached) return cached;
    }

    const body = await ctx.request.json();
    const errors = validateEntity("appointment", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await create("appointment", body);
    const record = item as Record<string, unknown>;

    ctx.audit({
      action: "create",
      entity: "appointment",
      entityId: String(record.id ?? "unknown"),
    });

    // CalDAV push (fire-and-forget, don't block the response)
    pushAppointment(record).catch((err) =>
      logger.error({ err }, "CalDAV push failed")
    );

    // Confirmation email to patient (fire-and-forget)
    if (record.patientId) {
      prisma.patient.findUnique({
        where: { id: record.patientId as number },
        select: { name: true, email: true },
      }).then((patient) => {
        if (patient?.email) {
          const dateStr = new Date(record.date as string).toLocaleDateString("en-AU", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          });
          sendAppointmentConfirmation({
            to: patient.email,
            patientName: patient.name ?? "Patient",
            date: dateStr,
            startTime: (record.start_time as string) ?? "",
            specialty: (record.specialty as string) ?? "Appointment",
            location: (record.location as string) ?? "TBC",
          });
        }
      }).catch((err) => logger.error({ err }, "Failed to look up patient for confirmation email"));
    }

    const response = NextResponse.json(item, { status: 201 });

    if (idempotencyKey) {
      await cacheIdempotentResponse(idempotencyKey, response);
    }

    return response;
  });
