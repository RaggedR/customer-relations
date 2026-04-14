/**
 * Dynamic CRUD API — List & Create
 *
 * GET  /api/{entity}?search=...&sortBy=...&sortOrder=asc|desc
 * POST /api/{entity}
 *
 * Delegates to the route factory — the same handlers used by shadow routes.
 */

import { NextRequest } from "next/server";
import { makeListCreateHandlers } from "@/lib/route-factory";

interface RouteParams {
  params: Promise<{ entity: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { entity } = await params;
  return makeListCreateHandlers(entity).GET(request);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { entity } = await params;
  return makeListCreateHandlers(entity).POST(request);
}
