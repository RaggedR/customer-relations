/**
 * Schema API
 *
 * GET /api/schema — returns the parsed schema config
 * Used by the frontend to dynamically generate UI.
 */

import { NextResponse } from "next/server";
import { getSchema } from "@/engine/schema-loader";

export async function GET() {
  try {
    const schema = getSchema();
    return NextResponse.json(schema);
  } catch (error) {
    console.error("GET /api/schema error:", error);
    return NextResponse.json({ error: "Failed to load schema" }, { status: 500 });
  }
}
