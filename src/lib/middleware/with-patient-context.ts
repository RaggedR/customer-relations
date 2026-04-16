/**
 * withPatientContext — Patient Resolution Layer
 *
 * Resolves the logged-in user's patient record.
 * Short-circuits with 403 if no patient profile is linked.
 */

import { NextResponse } from "next/server";
import { resolvePatient } from "@/lib/patient-helpers";
import type { TraceContext, SessionContext, AuditContext, PatientContext } from "./types";

export async function withPatientContext(
  ctx: TraceContext & SessionContext & AuditContext,
): Promise<NextResponse | TraceContext & SessionContext & AuditContext & PatientContext> {
  const patient = await resolvePatient(ctx.userId);
  if (!patient) {
    return NextResponse.json(
      { error: "No patient profile linked to this account" },
      { status: 403 },
    );
  }

  return {
    ...ctx,
    patient: patient as PatientContext["patient"],
  };
}
