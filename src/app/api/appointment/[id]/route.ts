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

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const item = await findById("appointment", parseInt(id, 10));
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error(`GET /api/appointment/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await request.json();
    const errors = validateEntity("appointment", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await update("appointment", parseInt(id, 10), body);

    // CalDAV update (fire-and-forget)
    updateAppointment(item as Record<string, unknown>).catch((err) =>
      console.error("CalDAV update failed:", err)
    );

    return NextResponse.json(item);
  } catch (error) {
    console.error(`PUT /api/appointment/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    // Get the appointment first to know the nurseId
    const existing = (await findById("appointment", parseInt(id, 10))) as Record<string, unknown> | null;
    const nurseId = existing?.nurseId as number | undefined;

    await remove("appointment", parseInt(id, 10));

    // CalDAV delete (fire-and-forget)
    if (nurseId) {
      deleteAppointment(parseInt(id, 10), nurseId).catch((err) =>
        console.error("CalDAV delete failed:", err)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/appointment/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
