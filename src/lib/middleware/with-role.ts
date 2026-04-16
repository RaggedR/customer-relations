/**
 * withRole — Role Gate Layer
 *
 * Factory that returns a middleware checking the session's role
 * against the required minimum. Short-circuits with 403 if insufficient.
 *
 * Uses the existing role hierarchy (admin > nurse > patient).
 */

import { NextResponse } from "next/server";
import { hasRole, type Role } from "@/lib/auth";
import type { TraceContext, SessionContext, AuditContext } from "./types";

export function withRole(required: Role) {
  return async (
    ctx: TraceContext & SessionContext & AuditContext,
  ): Promise<NextResponse | typeof ctx> => {
    if (!hasRole({ userId: String(ctx.userId), role: ctx.role }, required)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return ctx;
  };
}
