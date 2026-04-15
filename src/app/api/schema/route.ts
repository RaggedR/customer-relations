/**
 * Schema API
 *
 * GET /api/schema — returns the parsed schema config
 * Used by the frontend to dynamically generate UI.
 */

import { NextResponse } from "next/server";
import { getSchema, isSensitive } from "@/lib/schema";
import { withErrorHandler } from "@/lib/api-helpers";

export async function GET() {
  return withErrorHandler("GET /api/schema", async () => {
    const schema = getSchema();

    // Strip infrastructure entities (auth, sessions, audit) from the
    // client-facing schema — they contain sensitive field definitions
    // (password_hash, session tokens) that the UI should never see.
    const filtered = {
      ...schema,
      entities: Object.fromEntries(
        Object.entries(schema.entities).filter(
          ([name]) => !isSensitive(name)
        )
      ),
    };

    return NextResponse.json(filtered);
  });
}
