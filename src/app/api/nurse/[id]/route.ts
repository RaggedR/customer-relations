/**
 * Nurse CRUD API — Get, Update, Delete by ID
 *
 * Explicit route needed because the static `nurse/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchema } from "@/engine/schema-loader";
import { findById, update, remove, validateEntity } from "@/lib/repository";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const schema = getSchema();
  if (!schema.entities.nurse) {
    return NextResponse.json({ error: "Nurse entity not found" }, { status: 404 });
  }

  try {
    const item = await findById("nurse", numId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error(`GET /api/nurse/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const schema = getSchema();
  if (!schema.entities.nurse) {
    return NextResponse.json({ error: "Nurse entity not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const errors = validateEntity("nurse", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await update("nurse", numId, body);
    return NextResponse.json(item);
  } catch (error) {
    console.error(`PUT /api/nurse/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const schema = getSchema();
  if (!schema.entities.nurse) {
    return NextResponse.json({ error: "Nurse entity not found" }, { status: 404 });
  }

  try {
    await remove("nurse", numId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/nurse/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
