/**
 * Admin — Patient Notes (Watermarked)
 *
 * GET /api/admin/notes/:patientId
 *
 * Returns clinical and personal notes for a patient as watermarked PNG images.
 * Admin-only endpoint. Same watermarking as the nurse portal, but watermark
 * shows the admin user's name instead of the nurse's.
 */

import { NextResponse } from "next/server";
import { adminIdRoute } from "@/lib/middleware";
import { renderWatermarkedImage } from "@/lib/image-renderer";
import { findAll } from "@/lib/repository";
import { prisma } from "@/lib/prisma";

export const GET = adminIdRoute()
  .named("GET /api/admin/notes/[id]")
  .handle(async (ctx) => {
    const patientId = ctx.entityId;

    // Verify patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Get the admin user's name for the watermark
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const adminName = user?.name ?? "Admin";
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
          adminName,
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
          adminName,
          now,
        ).toString("base64")}`,
      })),
    ].sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());

    if (clinicalNotes.length > 0) {
      ctx.audit({
        action: "view",
        entity: "clinical_note",
        entityId: String(patientId),
        details: `admin viewed ${clinicalNotes.length} clinical notes for patient #${patientId}`,
      });
    }

    if (personalNotes.length > 0) {
      ctx.audit({
        action: "view",
        entity: "personal_note",
        entityId: String(patientId),
        details: `admin viewed ${personalNotes.length} personal notes for patient #${patientId}`,
      });
    }

    const response = NextResponse.json({
      patientRef: `Patient #${patientId}`,
      notes,
    });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  });
