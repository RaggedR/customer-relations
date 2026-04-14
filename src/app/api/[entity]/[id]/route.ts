/**
 * Dynamic CRUD API — Get, Update, Delete by ID
 *
 * GET    /api/{entity}/{id}
 * PUT    /api/{entity}/{id}
 * DELETE /api/{entity}/{id}
 *
 * Delegates to the route factory — the same handlers used by shadow routes.
 */

import { NextRequest } from "next/server";
import { makeGetUpdateDeleteHandlers } from "@/lib/route-factory";

interface RouteParams {
  params: Promise<{ entity: string; id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { entity, id } = await params;
  return makeGetUpdateDeleteHandlers(entity).GET(request, { params: Promise.resolve({ id }) });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { entity, id } = await params;
  return makeGetUpdateDeleteHandlers(entity).PUT(request, { params: Promise.resolve({ id }) });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { entity, id } = await params;
  return makeGetUpdateDeleteHandlers(entity).DELETE(request, { params: Promise.resolve({ id }) });
}
