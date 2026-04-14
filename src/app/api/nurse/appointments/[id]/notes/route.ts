/**
 * Nurse Portal — Patient Notes (Pseudonymised + Watermarked)
 *
 * GET  /api/nurse/appointments/[id]/notes — view notes as watermarked images
 * POST /api/nurse/appointments/[id]/notes — create a new note
 *
 * PRIVACY BOUNDARY: These endpoints identify patients by number only
 * ("Patient #42"), never by name. Clinical note content is rendered as
 * watermarked PNG images, not selectable text.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { renderWatermarkedImage } from "@/lib/image-renderer";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Resolve nurse name from the session userId */
async function resolveNurseName(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return user?.name ?? null;
  const nurse = await prisma.nurse.findFirst({ where: { email: user.email } });
  return nurse?.name ?? user.name ?? null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("GET /api/nurse/appointments/[id]/notes", async () => {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const appointmentId = parseInt(id, 10);
    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Load appointment to get patientId
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { patientId: true },
    });
    if (!appointment?.patientId) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const patientId = appointment.patientId;
    const patientRef = `Patient #${patientId}`;
    const nurseName = await resolveNurseName(session.userId) ?? "Unknown Nurse";
    const now = new Date();

    // Load clinical and personal notes for this patient
    const [clinicalNotes, personalNotes] = await Promise.all([
      prisma.clinicalNote.findMany({
        where: { patientId },
        orderBy: { date: "desc" },
      }),
      prisma.personalNote.findMany({
        where: { patientId },
        orderBy: { date: "desc" },
      }),
    ]);

    // Render each note as a watermarked PNG (base64 data URI)
    const notes = [
      ...clinicalNotes.map((n) => ({
        id: n.id,
        date: n.date,
        noteType: n.note_type ?? "clinical_note",
        clinician: n.clinician,
        imageDataUri: `data:image/png;base64,${renderWatermarkedImage(
          n.content,
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
          n.content,
          nurseName,
          now,
        ).toString("base64")}`,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 3D: Audit log — nurse viewed patient notes
    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;
    logAuditEvent({
      userId: session.userId,
      action: "view",
      entity: "clinical_note",
      entityId: String(patientId),
      details: `nurse viewed ${notes.length} notes for ${patientRef}`,
      ip,
      userAgent,
    });

    return NextResponse.json({ patientRef, notes });
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("POST /api/nurse/appointments/[id]/notes", async () => {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const appointmentId = parseInt(id, 10);
    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const { content, noteType } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const validTypes = ["progress_note", "initial_assessment", "discharge_summary", "treatment_plan", "personal"];
    if (!noteType || !validTypes.includes(noteType)) {
      return NextResponse.json(
        { error: `noteType must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    // Load appointment to get patientId
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { patientId: true },
    });
    if (!appointment?.patientId) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const patientId = appointment.patientId;
    const nurseName = await resolveNurseName(session.userId) ?? "Unknown Nurse";
    const now = new Date();

    let created;
    if (noteType === "personal") {
      created = await prisma.personalNote.create({
        data: {
          date: now,
          content,
          patientId,
        },
      });
    } else {
      created = await prisma.clinicalNote.create({
        data: {
          date: now,
          content,
          note_type: noteType,
          clinician: nurseName,
          patientId,
        },
      });
    }

    // 3D: Audit log — nurse created note
    const entity = noteType === "personal" ? "personal_note" : "clinical_note";
    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;
    logAuditEvent({
      userId: session.userId,
      action: "create",
      entity,
      entityId: String(patientId),
      details: `nurse created ${entity} for Patient #${patientId}`,
      ip,
      userAgent,
    });

    // Return pseudonymised — no patient name
    return NextResponse.json({
      id: created.id,
      date: created.date,
      noteType: entity,
      patientRef: `Patient #${patientId}`,
    }, { status: 201 });
  });
}
