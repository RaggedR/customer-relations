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
import { getSessionUser } from "@/lib/session";
import { withErrorHandler } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { renderWatermarkedImage } from "@/lib/image-renderer";
import { resolveNurse, verifyAppointmentOwnership } from "@/lib/nurse-helpers";
import { findAll, create } from "@/lib/repository";
import { getSchema } from "@/lib/schema";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandler("GET /api/nurse/appointments/[id]/notes", async () => {
    const session = await getSessionUser(request);
    if (!session || session.role !== "nurse") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const appointmentId = parseInt(id, 10);
    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Verify nurse identity and appointment ownership
    const nurse = await resolveNurse(session.userId);
    if (!nurse) {
      return NextResponse.json({ error: "No nurse profile linked to this account" }, { status: 403 });
    }

    const appointment = await verifyAppointmentOwnership(appointmentId, nurse.id);
    if (!appointment?.patientId) {
      return NextResponse.json({ error: "Appointment not found or not assigned to you" }, { status: 404 });
    }

    const patientId = appointment.patientId;
    const patientRef = `Patient #${patientId}`;
    const nurseName = nurse.name ?? "Unknown Nurse";
    const now = new Date();

    // Load clinical and personal notes for this patient
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

    // Render each note as a watermarked PNG (base64 data URI)
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
    if (!session || session.role !== "nurse") {
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

    if (content.length > 50_000) {
      return NextResponse.json({ error: "Note content too long (max 50,000 characters)" }, { status: 400 });
    }

    // Read valid note types from schema instead of hardcoding
    const schema = getSchema();
    const clinicalTypes = schema.entities.clinical_note.fields.note_type.values ?? [];
    const validTypes = [...clinicalTypes, "personal"];
    if (!noteType || !validTypes.includes(noteType)) {
      return NextResponse.json(
        { error: `noteType must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify nurse identity and appointment ownership
    const nurse = await resolveNurse(session.userId);
    if (!nurse) {
      return NextResponse.json({ error: "No nurse profile linked to this account" }, { status: 403 });
    }

    const appointment = await verifyAppointmentOwnership(appointmentId, nurse.id);
    if (!appointment?.patientId) {
      return NextResponse.json({ error: "Appointment not found or not assigned to you" }, { status: 404 });
    }

    const patientId = appointment.patientId;
    const nurseName = nurse.name ?? "Unknown Nurse";
    const now = new Date();

    let created: Record<string, unknown>;
    if (noteType === "personal") {
      created = await create("personal_note", {
        date: now,
        content,
        patient: patientId,
      }) as Record<string, unknown>;
    } else {
      created = await create("clinical_note", {
        date: now,
        content,
        note_type: noteType,
        clinician: nurseName,
        patient: patientId,
      }) as Record<string, unknown>;
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
