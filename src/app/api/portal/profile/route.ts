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

import { NextResponse } from "next/server";
import { patientRoute } from "@/lib/middleware";
import { update } from "@/lib/repository";

// Fields the patient can view
// maintenance_plan_expiry excluded — it encodes clinical treatment history
// (HSP plan dates) which patients access through their treating clinician, not self-service.
const VISIBLE_FIELDS = [
  "id", "name", "email", "phone", "address",
  "date_of_birth", "medicare_number", "status",
] as const;

// Fields the patient can self-edit (contact details only)
const EDITABLE_FIELDS = ["phone", "address"] as const;

export const GET = patientRoute()
  .named("GET /api/portal/profile")
  .handle(async (ctx) => {
    // Return only visible fields
    const profile: Record<string, unknown> = {};
    for (const field of VISIBLE_FIELDS) {
      profile[field] = (ctx.patient as Record<string, unknown>)[field] ?? null;
    }

    return NextResponse.json(profile);
  });

export const PUT = patientRoute()
  .named("PUT /api/portal/profile")
  .handle(async (ctx) => {
    const body = await ctx.request.json();

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

    // Snapshot old values before update for audit trail
    const oldValues: Record<string, unknown> = {};
    for (const field of Object.keys(updates)) {
      oldValues[field] = (ctx.patient as Record<string, unknown>)[field] ?? null;
    }

    const updated = await update("patient", ctx.patient.id, updates, {
      allowedFields: [...EDITABLE_FIELDS],
    });

    // Build "field: old → new" audit details
    const auditDetails = Object.keys(updates)
      .map((field) => `${field}: ${String(oldValues[field] ?? "")} → ${String(updates[field] ?? "")}`)
      .join(", ");

    ctx.audit({
      action: "patient_self_update",
      entity: "patient",
      entityId: String(ctx.patient.id),
      details: auditDetails,
    });

    // Return only visible fields
    const profile: Record<string, unknown> = {};
    for (const field of VISIBLE_FIELDS) {
      profile[field] = (updated as Record<string, unknown>)[field] ?? null;
    }

    return NextResponse.json(profile);
  });
