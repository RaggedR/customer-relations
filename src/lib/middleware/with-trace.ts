/**
 * withTrace — Base Context Layer
 *
 * Creates the TraceContext with a correlation ID, client IP, and
 * user-agent. Wraps downstream execution in AsyncLocalStorage
 * so the correlation ID propagates through sub-calls automatically.
 *
 * This is the outermost Kleisli arrow — it never short-circuits.
 */

import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/api-helpers";
import { requestStore } from "./async-context";
import type { TraceContext, RouteParams } from "./types";

export async function withTrace(
  ctx: { request: NextRequest; _routeParams?: RouteParams },
): Promise<TraceContext & { _routeParams?: RouteParams }> {
  const correlationId = crypto.randomUUID();

  // Initialise the AsyncLocalStorage store for this request.
  // The store is mutable — withSession will update userId later.
  const store = { correlationId, userId: null };
  requestStore.enterWith(store);

  return {
    request: ctx.request,
    _routeParams: ctx._routeParams,
    correlationId,
    ip: getClientIp(ctx.request),
    userAgent: ctx.request.headers.get("user-agent") ?? undefined,
  };
}
