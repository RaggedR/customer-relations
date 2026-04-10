/**
 * Dynamic CRUD API — Get, Update, Delete by ID
 *
 * GET    /api/{entity}/{id}
 * PUT    /api/{entity}/{id}
 * DELETE /api/{entity}/{id}
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchema } from "@/engine/schema-loader";
import { findById, update, remove, validateEntity } from "@/lib/repository";

interface RouteParams {
  params: Promise<{ entity: string; id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { entity, id } = await params;

  const schema = getSchema();
  if (!schema.entities[entity]) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });
  }

  try {
    const item = await findById(entity, parseInt(id, 10));
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error(`GET /api/${entity}/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { entity, id } = await params;

  const schema = getSchema();
  if (!schema.entities[entity]) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });
  }

  try {
    const body = await request.json();
    const errors = validateEntity(entity, body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const item = await update(entity, parseInt(id, 10), body);
    return NextResponse.json(item);
  } catch (error) {
    console.error(`PUT /api/${entity}/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { entity, id } = await params;

  const schema = getSchema();
  if (!schema.entities[entity]) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });
  }

  try {
    await remove(entity, parseInt(id, 10));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/${entity}/${id} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
