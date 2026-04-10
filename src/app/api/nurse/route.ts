/**
 * Nurse CRUD API — List & Create
 *
 * Explicit route needed because the static `nurse/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchema } from "@/engine/schema-loader";
import { findAll, create, validateEntity } from "@/lib/repository";

export async function GET(request: NextRequest) {
  const schema = getSchema();
  if (!schema.entities.nurse) {
    return NextResponse.json({ error: "Nurse entity not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const sortBy = searchParams.get("sortBy") || undefined;
  const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || undefined;

  try {
    const items = await findAll("nurse", { search, sortBy, sortOrder });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/nurse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const item = await create("nurse", body);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/nurse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
