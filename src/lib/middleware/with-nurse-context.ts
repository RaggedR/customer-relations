/**
 * withNurseContext — Nurse Resolution + AUP Layer
 *
 * Bundles nurse record resolution AND AUP acknowledgement check
 * into a single Kleisli arrow. This provides the coverage guarantee:
 * you cannot obtain a NurseContext without passing the AUP gate.
 *
 * Short-circuits with 403 if:
 * - No nurse profile linked to the user
 * - AUP not acknowledged
 */

import { NextResponse } from "next/server";
import { resolveNurse, requireAupAcknowledgement } from "@/lib/nurse-helpers";
import type { TraceContext, SessionContext, AuditContext, NurseContext } from "./types";

export async function withNurseContext(
  ctx: TraceContext & SessionContext & AuditContext,
): Promise<NextResponse | TraceContext & SessionContext & AuditContext & NurseContext> {
  const nurse = await resolveNurse(ctx.userId);
  if (!nurse) {
    return NextResponse.json(
      { error: "No nurse profile linked to this account" },
      { status: 403 },
    );
  }

  const aupError = requireAupAcknowledgement(nurse);
  if (aupError) return aupError;

  return {
    ...ctx,
    nurse: {
      id: nurse.id,
      name: nurse.name,
      email: nurse.email,
      userId: nurse.userId,
      aup_acknowledged_at: nurse.aup_acknowledged_at,
    },
  };
}
