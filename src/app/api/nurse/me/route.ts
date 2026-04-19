/**
 * Nurse Portal — Identity
 *
 * GET /api/nurse/me
 *
 * Returns the logged-in nurse's name for header display.
 * Lightweight endpoint — no clinical data.
 */

import { NextResponse } from "next/server";
import { nurseRoute } from "@/lib/middleware";

export const GET = nurseRoute()
  .named("GET /api/nurse/me")
  .handle(async (ctx) => {
    return NextResponse.json({ name: ctx.nurse.name });
  });
