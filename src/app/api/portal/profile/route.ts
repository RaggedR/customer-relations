/**
 * Patient Portal — Profile
 *
 * GET  /api/portal/profile — returns the patient's own profile data
 * PUT  /api/portal/profile — updates allowed contact fields only
 *
 * Patients can view all their non-sensitive fields and update a limited
 * set of contact fields (phone, address). Other fields (name, email,
 * Medicare number, date of birth) require a correction request to Clare.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { extractRequestContext } from "@/lib/request-context";
import { resolvePatient } from "@/lib/patient-helpers";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";

// Fields the patient can view
// maintenance_plan_expiry excluded — it encodes clinical treatment history
// (HSP plan dates) which patients access through their treating clinician, not self-service.
const VISIBLE_FIELDS = [
  "id", "name", "email", "phone", "address",
  "date_of_birth", "status",
] as const;

// Fields the patient can self-edit (contact details only)
const EDITABLE_FIELDS = ["phone", "address"] as const;

export async function GET(request: NextRequest) {
  return withErrorHandler("GET /api/portal/profile", async () => {
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

    // Return only visible fields
    const profile: Record<string, unknown> = {};
    for (const field of VISIBLE_FIELDS) {
      profile[field] = (patient as Record<string, unknown>)[field] ?? null;
    }

    return NextResponse.json(profile);
  });
}

export async function PUT(request: NextRequest) {
  return withErrorHandler("PUT /api/portal/profile", async () => {
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

    const body = await request.json();

    // Only allow editing of contact fields
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: updates,
    });

    logAuditEvent({
      action: "patient_self_update",
      entity: "patient",
      entityId: String(patient.id),
      details: `Updated fields: ${Object.keys(updates).join(", ")}`,
      context: ctx,
    });

    // Return only visible fields
    const profile: Record<string, unknown> = {};
    for (const field of VISIBLE_FIELDS) {
      profile[field] = (updated as Record<string, unknown>)[field] ?? null;
    }

    return NextResponse.json(profile);
  });
}
