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
import { create } from "@/lib/repository";
import { getSchema } from "@/lib/schema";
import { withErrorHandler } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { extractRequestContext } from "@/lib/request-context";
import { getSessionUser } from "@/lib/session";
import { storeFile } from "@/lib/attachment-store";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const VALID_CATEGORIES = [
  "referral_letter",
  "test_result",
  "clinical_document",
  "other",
] as const;

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
  const patientIdRaw = formData.get("patientId") as string | null;
  const category = (formData.get("category") as string) || "other";
  const description = (formData.get("description") as string) || "";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!patientIdRaw) {
    return NextResponse.json(
      { error: "patientId is required" },
      { status: 400 }
    );
  }

  // Validate patientId as a positive integer before any filesystem use
  const patientId = parseInt(patientIdRaw, 10);
  if (isNaN(patientId) || patientId <= 0 || String(patientId) !== patientIdRaw.trim()) {
    return NextResponse.json(
      { error: "patientId must be a positive integer" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 50MB)" },
      { status: 413 }
    );
  }

  if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    return NextResponse.json(
      { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  return withErrorHandler("POST /api/attachments/upload", async () => {
    let stored;
    try {
      stored = await storeFile(patientId, file, file.name);
    } catch (err) {
      if (err instanceof TypeError) {
        // MIME type not allowed (magic-byte rejection)
        return NextResponse.json(
          { error: err.message },
          { status: 415 }
        );
      }
      if (err instanceof RangeError) {
        // patientId invalid or path traversal
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        );
      }
      throw err;
    }

    // Sanitised filename (without UUID prefix) for the DB record
    const safeName = file.name.replace(/[/\\"\r\n]/g, "_");

    let record;
    try {
      record = await create("attachment", {
        filename: safeName,
        storage_path: stored.storagePath,
        mime_type: stored.detectedMimeType,
        size_bytes: stored.sizeBytes,
        category,
        description,
        patient: patientId,
      });
    } catch (err) {
      // DB insert failed — storeFile already wrote the final file; remove it
      // to prevent orphans (best-effort, non-fatal if it fails).
      const { promises: fsp } = await import("fs");
      await fsp.unlink(stored.filePath).catch(() => {});
      throw err;
    }

    const session = await getSessionUser(request);
    const ctx = extractRequestContext(request, session);
    logAuditEvent({
      action: "create",
      entity: "attachment",
      entityId: String(record.id),
      details: `Uploaded ${category} attachment for patient ${patientId}`,
      context: ctx,
    });

    return NextResponse.json(record, { status: 201 });
  });
}
