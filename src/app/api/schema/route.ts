/**
 * Schema API
 *
 * GET /api/schema — returns the parsed schema config
 * Used by the frontend to dynamically generate UI.
 */

import { NextResponse } from "next/server";
import { getSchema } from "@/lib/schema";
import { withErrorHandler } from "@/lib/api-helpers";

export async function GET() {
  return withErrorHandler("GET /api/schema", async () => {
    const schema = getSchema();
    return NextResponse.json(schema);
  });
}
