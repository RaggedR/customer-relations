/**
 * Dynamic CRUD API — List & Create
 *
 * GET  /api/{entity}?search=...&sortBy=...&sortOrder=asc|desc
 * POST /api/{entity}
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchema } from "@/engine/schema-loader";
import { findAll, create, validateEntity } from "@/lib/repository";

interface RouteParams {
  params: Promise<{ entity: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { entity } = await params;

  const schema = getSchema();
  if (!schema.entities[entity]) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const sortBy = searchParams.get("sortBy") || undefined;
  const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || undefined;

  try {
    const items = await findAll(entity, { search, sortBy, sortOrder });
    return NextResponse.json(items);
  } catch (error) {
    console.error(`GET /api/${entity} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { entity } = await params;

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

    const item = await create(entity, body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error(`POST /api/${entity} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
