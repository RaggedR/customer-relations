/**
 * Appointment API — Get, Update, Delete by ID
 *
 * GET    /api/appointment/{id}
 * PUT    /api/appointment/{id}
 * DELETE /api/appointment/{id}
 *
 * Shadows the generic [entity]/[id] catch-all to add CalDAV sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { findById, update, remove, validateEntity } from "@/lib/repository";
import {
  updateAppointment,
  deleteAppointment,
} from "@/lib/caldav-client";
import { withErrorHandler } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  return withErrorHandler(`GET /api/appointment/${numId}`, async () => {
    const item = await findById("appointment", numId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  return withErrorHandler(`PUT /api/appointment/${numId}`, async () => {
    const body = await request.json();
    const errors = validateEntity("appointment", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await update("appointment", numId, body);

    // CalDAV update (fire-and-forget)
    updateAppointment(item as Record<string, unknown>).catch((err) =>
      console.error("CalDAV update failed:", err)
    );

    return NextResponse.json(item);
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  return withErrorHandler(`DELETE /api/appointment/${numId}`, async () => {
    // Get the appointment first to know the nurseId
    const existing = (await findById("appointment", numId)) as Record<string, unknown> | null;
    const nurseId = existing?.nurseId as number | undefined;

    await remove("appointment", numId);

    // CalDAV delete (fire-and-forget)
    if (nurseId) {
      deleteAppointment(numId, nurseId).catch((err) =>
        console.error("CalDAV delete failed:", err)
      );
    }

    return NextResponse.json({ success: true });
  });
}
