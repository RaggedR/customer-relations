/**
 * Nurse Portal — Patient Notes by Patient ID (Pseudonymised + Watermarked)
 *
 * GET /api/nurse/records/:patientId/notes
 *
 * Returns clinical and personal notes for a patient as watermarked PNG images.
 * Only accessible if the nurse has at least one appointment with this patient.
 *
 * PRIVACY BOUNDARY: Patient identified by number only ("Patient #N").
 * All note content rendered as watermarked PNG with nurse name + timestamp.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { renderWatermarkedImage } from "@/lib/image-renderer";
import { findAll } from "@/lib/repository";
import { prisma } from "@/lib/prisma";

export const GET = nurseIdRoute()
  .named("GET /api/nurse/records/[patientId]/notes")
  .handle(async (ctx) => {
    const patientId = ctx.entityId;

    // Verify the nurse has at least one appointment with this patient
    const hasAppointment = await prisma.appointment.findFirst({
      where: {
        nurseId: ctx.nurse.id,
        patientId,
      },
      select: { id: true },
    });

    if (!hasAppointment) {
      ctx.audit({
        action: "access_denied",
        entity: "patient",
        entityId: String(patientId),
        details: `nurse ${ctx.nurse.name} (nurse #${ctx.nurse.id}) attempted to view notes for non-assigned patient #${patientId}`,
      });
      return NextResponse.json(
        { error: "You do not have access to this patient's records" },
        { status: 403 },
      );
    }

    const patientRef = `Patient #${patientId}`;
    const nurseName = ctx.nurse.name ?? "Unknown Nurse";
    const now = new Date();

    const [clinicalNotes, personalNotes] = await Promise.all([
      findAll("clinical_note", {
        filterBy: { patientId },
        sortBy: "date",
        sortOrder: "desc",
      }) as Promise<Record<string, unknown>[]>,
      findAll("personal_note", {
        filterBy: { patientId },
        sortBy: "date",
        sortOrder: "desc",
      }) as Promise<Record<string, unknown>[]>,
    ]);

    const notes = [
      ...clinicalNotes.map((n) => ({
        id: n.id,
        date: n.date,
        noteType: (n.note_type as string) ?? "clinical_note",
        clinician: n.clinician,
        imageDataUri: `data:image/png;base64,${renderWatermarkedImage(
          n.content as string,
          nurseName,
          now,
        ).toString("base64")}`,
      })),
      ...personalNotes.map((n) => ({
        id: n.id,
        date: n.date,
        noteType: "personal_note",
        clinician: null,
        imageDataUri: `data:image/png;base64,${renderWatermarkedImage(
          n.content as string,
          nurseName,
          now,
        ).toString("base64")}`,
      })),
    ].sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());

    if (clinicalNotes.length > 0) {
      ctx.audit({
        action: "view",
        entity: "clinical_note",
        entityId: String(patientId),
        details: `nurse viewed ${clinicalNotes.length} clinical notes for ${patientRef} via records panel`,
      });
    }

    if (personalNotes.length > 0) {
      ctx.audit({
        action: "view",
        entity: "personal_note",
        entityId: String(patientId),
        details: `nurse viewed ${personalNotes.length} personal notes for ${patientRef} via records panel`,
      });
    }

    // Anti-caching headers — notes must not be stored by the browser
    const response = NextResponse.json({ patientRef, notes });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  });
