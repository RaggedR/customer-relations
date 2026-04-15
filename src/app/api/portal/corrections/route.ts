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
import { withErrorHandler } from "@/lib/api-helpers";
import { extractRequestContext } from "@/lib/request-context";
import { resolvePatient } from "@/lib/patient-helpers";
import { logAuditEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  return withErrorHandler("POST /api/portal/corrections", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = extractRequestContext(request, session);
    const patient = await resolvePatient(session.userId);
    if (!patient) {
      return NextResponse.json(
        { error: "No patient profile linked to this account" },
        { status: 403 },
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
      action: "correction_request",
      entity: "patient",
      entityId: String(patient.id),
      details: description.trim().slice(0, 2000),
      context: ctx,
    });

    return NextResponse.json({
      success: true,
      message: "Your correction request has been submitted. The practice will review it shortly.",
    });
  });
}
