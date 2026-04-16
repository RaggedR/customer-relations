/**
 * Patient Portal — Correction Request
 *
 * POST /api/portal/corrections
 * Body: { description: string }
 *
 * APP 13 compliance: patients can request corrections to their personal
 * information. The request is logged as an audit event so Clare can
 * review and action it from the admin interface.
 */

import { NextResponse } from "next/server";
import { patientRoute, withCustomRateLimit } from "@/lib/middleware";
import { createRateLimiter } from "@/lib/rate-limit";
import type { TraceContext, SessionContext, AuditContext, PatientContext } from "@/lib/middleware";

const correctionsLimiter = createRateLimiter(3, 60 * 60 * 1000); // 3 per hour

export const POST = patientRoute()
  .use(withCustomRateLimit<TraceContext & SessionContext & AuditContext & PatientContext>(
    correctionsLimiter,
    (ctx) => `patient:${ctx.patient.id}`,
  ))
  .named("POST /api/portal/corrections")
  .handle(async (ctx) => {
    const { description } = await ctx.request.json();
    if (!description || typeof description !== "string" || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Please describe what needs correcting (at least 10 characters)" },
        { status: 400 },
      );
    }

    ctx.audit({
      action: "correction_request",
      entity: "patient",
      entityId: String(ctx.patient.id),
      details: description.trim().slice(0, 2000),
    });

    return NextResponse.json({
      success: true,
      message: "Your correction request has been submitted. The practice will review it shortly.",
    });
  });
