/**
 * Patient CRUD API — Get, Update, Delete by ID
 *
 * This explicit route is needed because the static `patient/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 *
 * GET is wrapped to add audit logging (patient records contain
 * sensitive health information — Medicare numbers, clinical data).
 * PUT and DELETE delegate to the route factory unchanged.
 */

import { NextRequest } from "next/server";
import { makeGetUpdateDeleteHandlers } from "@/lib/route-factory";
import { logAuditEvent } from "@/lib/audit";

const handlers = makeGetUpdateDeleteHandlers("patient");

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  // Audit: log access to patient record (fire-and-forget)
  // TODO: extract userId from session once auth is wired
  logAuditEvent({
    userId: "admin",
    action: "view",
    entity: "patient",
    entityId: id,
  });

  return handlers.GET(request, context);
}

export const { PUT, DELETE } = handlers;
