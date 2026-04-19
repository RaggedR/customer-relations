/**
 * Patient Portal — Hearing Aids
 *
 * GET /api/portal/hearing-aids
 *
 * Returns hearing aids belonging to the logged-in patient.
 * Only practical device info — excludes programming/repair internals.
 */

import { NextResponse } from "next/server";
import { patientRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const GET = patientRoute()
  .named("GET /api/portal/hearing-aids")
  .handle(async (ctx) => {
    const aids = await prisma.hearingAid.findMany({
      where: { patientId: ctx.patient.id },
      select: {
        id: true,
        ear: true,
        make: true,
        model: true,
        serial_number: true,
        battery_type: true,
        wax_filter: true,
        dome: true,
        warranty_end_date: true,
      },
      orderBy: { ear: "asc" },
    });

    ctx.audit({
      action: "view_hearing_aids",
      entity: "hearing_aid",
      entityId: String(ctx.patient.id),
      details: `Patient viewed ${aids.length} hearing aid(s)`,
    });

    return NextResponse.json(aids);
  });
