/**
 * Appointment API — Get, Update, Delete by ID
 *
 * GET    /api/appointment/{id}
 * PUT    /api/appointment/{id}
 * DELETE /api/appointment/{id}
 *
 * Shadows the generic [entity]/[id] catch-all to add CalDAV sync.
 *
 * Uses the composable middleware stack (adminIdRoute) for auth, tracing,
 * and audit logging — same as the route factory.
 */

import { NextResponse } from "next/server";
import { findById, update, remove, validateEntity } from "@/lib/repository";
import {
  updateAppointment,
  deleteAppointment,
} from "@/lib/caldav-client";
import { adminIdRoute } from "@/lib/middleware";
import { logger } from "@/lib/logger";

export const GET = adminIdRoute()
  .named("GET /api/appointment/[id]")
  .handle(async (ctx) => {
    const item = await findById("appointment", ctx.entityId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  });

export const PUT = adminIdRoute()
  .named("PUT /api/appointment/[id]")
  .handle(async (ctx) => {
    const body = await ctx.request.json();
    const errors = validateEntity("appointment", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const expectedUpdatedAt = body.updatedAt ?? body.updated_at;
    const item = await update("appointment", ctx.entityId, body, {
      expectedUpdatedAt: expectedUpdatedAt ? String(expectedUpdatedAt) : undefined,
    });

    ctx.audit({
      action: "update",
      entity: "appointment",
      entityId: String(ctx.entityId),
    });

    // CalDAV update (fire-and-forget)
    updateAppointment(item as Record<string, unknown>).catch((err) =>
      logger.error({ err }, "CalDAV update failed")
    );

    return NextResponse.json(item);
  });

export const DELETE = adminIdRoute()
  .named("DELETE /api/appointment/[id]")
  .handle(async (ctx) => {
    // Get the appointment first to know the nurseId
    const existing = (await findById("appointment", ctx.entityId)) as Record<string, unknown> | null;
    const nurseId = existing?.nurseId as number | undefined;

    await remove("appointment", ctx.entityId);

    ctx.audit({
      action: "delete",
      entity: "appointment",
      entityId: String(ctx.entityId),
    });

    // CalDAV delete (fire-and-forget)
    if (nurseId) {
      deleteAppointment(ctx.entityId, nurseId).catch((err) =>
        logger.error({ err }, "CalDAV delete failed")
      );
    }

    return NextResponse.json({ success: true });
  });
