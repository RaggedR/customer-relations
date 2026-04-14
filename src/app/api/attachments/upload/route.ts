/**
 * File Upload API
 *
 * POST /api/attachments/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   file: File (required)
 *   patientId: number (required)
 *   category: "referral_letter" | "test_result" | "clinical_document" | "other"
 *   description: string (optional)
 *
 * Stores the file on disk under uploads/<patientId>/<uuid>-<filename>
 * and creates an attachment record via the schema-driven repository.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { create } from "@/lib/repository";
import { getSchema } from "@/lib/schema";
import { withErrorHandler, getClientIp } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/session";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "text/vcard",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(request: NextRequest) {
  const schema = getSchema();
  if (!schema.entities.attachment) {
    return NextResponse.json(
      { error: "Attachment entity not found in schema" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const patientId = formData.get("patientId") as string | null;
  const category = (formData.get("category") as string) || "other";
  const description = (formData.get("description") as string) || "";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!patientId) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 50MB)" },
      { status: 413 }
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type not allowed: ${file.type}` },
      { status: 415 }
    );
  }

  const validCategories = [
    "referral_letter",
    "test_result",
    "clinical_document",
    "other",
  ];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${validCategories.join(", ")}` },
      { status: 400 }
    );
  }

  // Sanitise filename — strip path separators, quotes, and control characters
  const safeName = file.name.replace(/[/\\"\r\n]/g, "_");
  const uniqueName = `${randomUUID()}-${safeName}`;
  const patientDir = path.join(UPLOADS_DIR, patientId);
  const storagePath = path.join(patientDir, uniqueName);

  // Ensure the relative path stays inside uploads/
  const resolved = path.resolve(storagePath);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    return NextResponse.json(
      { error: "Invalid file path" },
      { status: 400 }
    );
  }

  return withErrorHandler("POST /api/attachments/upload", async () => {
    await fs.mkdir(patientDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(storagePath, buffer);

    // Store relative path in DB (relative to uploads/)
    const relativePath = path.relative(UPLOADS_DIR, storagePath);

    const record = await create("attachment", {
      filename: safeName,
      storage_path: relativePath,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      category,
      description,
      patient: Number(patientId),
    });

    const session = await getSessionUser(request);
    logAuditEvent({
      userId: session?.userId ?? null,
      action: "create",
      entity: "attachment",
      entityId: String(record.id),
      details: `Uploaded ${category} attachment for patient ${patientId}`,
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(record, { status: 201 });
  });
}
