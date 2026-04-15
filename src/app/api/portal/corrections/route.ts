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

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler, getClientIp } from "@/lib/api-helpers";
import { resolvePatient } from "@/lib/patient-helpers";
import { logAuditEvent } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";

const correctionsLimiter = createRateLimiter(3, 60 * 60 * 1000); // 3 per hour

export async function POST(request: NextRequest) {
  return withErrorHandler("POST /api/portal/corrections", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const patient = await resolvePatient(session.userId);
    if (!patient) {
      return NextResponse.json(
        { error: "No patient profile linked to this account" },
        { status: 403 },
      );
    }

    // Per-patient rate limit: 3 correction requests per hour
    const rl = correctionsLimiter(`patient:${patient.id}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many correction requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)) } },
      );
    }

    const { description } = await request.json();
    if (!description || typeof description !== "string" || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Please describe what needs correcting (at least 10 characters)" },
        { status: 400 },
      );
    }

    logAuditEvent({
      userId: session.userId,
      action: "correction_request",
      entity: "patient",
      entityId: String(patient.id),
      details: description.trim().slice(0, 2000),
      ip: getClientIp(request) ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Your correction request has been submitted. The practice will review it shortly.",
    });
  });
}
