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

import { NextResponse } from "next/server";
import { adminIdRoute } from "@/lib/middleware";
import { makeGetUpdateDeleteHandlers } from "@/lib/route-factory";
import { findById } from "@/lib/repository";

const handlers = makeGetUpdateDeleteHandlers("patient");

// Custom GET with patient-specific view audit (the factory GET doesn't
// audit reads — too noisy for generic entities, but required for patient data).
export const GET = adminIdRoute()
  .named("GET /api/patient/[id]")
  .handle(async (ctx) => {
    const item = await findById("patient", ctx.entityId);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    ctx.audit({
      action: "view",
      entity: "patient",
      entityId: String(ctx.entityId),
    });

    return NextResponse.json(item);
  });

export const { PUT, DELETE } = handlers;
