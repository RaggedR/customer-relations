/**
 * Patient CRUD API — Get, Update, Delete by ID
 *
 * Delegates to the generic entity handler for "patient".
 * This explicit route is needed because the static `patient/` directory
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
  if (!schema.entities.patient) {
    return NextResponse.json({ error: "Patient entity not found" }, { status: 404 });
  }

  try {
    const item = await findById("patient", numId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error(`GET /api/patient/${id} error:`, error);
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
  if (!schema.entities.patient) {
    return NextResponse.json({ error: "Patient entity not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const errors = validateEntity("patient", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await update("patient", numId, body);
    return NextResponse.json(item);
  } catch (error) {
    console.error(`PUT /api/patient/${id} error:`, error);
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
  if (!schema.entities.patient) {
    return NextResponse.json({ error: "Patient entity not found" }, { status: 404 });
  }

  try {
    await remove("patient", numId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/patient/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
