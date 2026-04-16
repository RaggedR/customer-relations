/**
 * withParsedId — Route Parameter Parsing Layer
 *
 * Extracts and validates the numeric `id` parameter from
 * the route context. Short-circuits with 400 if invalid.
 */

import { NextResponse } from "next/server";
import type { TraceContext, IdContext, RouteParams } from "./types";

export async function withParsedId<Ctx extends TraceContext & { _routeParams?: RouteParams }>(
  ctx: Ctx,
): Promise<NextResponse | Ctx & IdContext> {
  const routeParams = ctx._routeParams;
  if (!routeParams?.params) {
    return NextResponse.json({ error: "Missing route params" }, { status: 400 });
  }

  const resolved = await routeParams.params;
  const raw = resolved.id;
  if (!raw) {
    return NextResponse.json({ error: "Missing ID parameter" }, { status: 400 });
  }

  const numId = parseInt(raw, 10);
  if (isNaN(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  return { ...ctx, entityId: numId };
}
