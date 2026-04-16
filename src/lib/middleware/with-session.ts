/**
 * withSession — Session Verification Layer
 *
 * Extracts and verifies the JWT from the session cookie.
 * Short-circuits with 401 if the session is missing or invalid.
 *
 * Also attaches ctx.audit() — a convenience method that pre-fills
 * RequestContext from the trace and session data.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { RequestContext } from "@/lib/request-context";
import type { TraceContext, SessionContext, AuditContext } from "./types";

export async function withSession(
  ctx: TraceContext,
): Promise<NextResponse | TraceContext & SessionContext & AuditContext> {
  const session = await getSessionUser(ctx.request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestContext: RequestContext = {
    userId: session.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    correlationId: ctx.correlationId,
  };

  return {
    ...ctx,
    userId: session.userId,
    role: session.role,
    audit(event) {
      // Fire-and-forget: audit must never block the response, but failures
      // must surface in the error log for compliance investigation.
      logAuditEvent({ ...event, context: requestContext }).catch((err) => {
        logger.error({ err }, "Audit event write failed (fire-and-forget)");
      });
    },
  };
}
