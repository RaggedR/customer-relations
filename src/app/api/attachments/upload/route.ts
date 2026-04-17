/**
 * File Upload API
 *
 * POST /api/attachments/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   file: File (required)
 *   patientId: number (required)
 *   category: enum values from schema.yaml attachment.fields.category
 *   description: string (optional)
 *
 * Stores the file on disk under uploads/<patientId>/<uuid>-<filename>
 * and creates an attachment record via the schema-driven repository.
 */

import { NextResponse } from "next/server";
import { create } from "@/lib/repository";
import { getSchema } from "@/lib/schema";
import { adminRoute } from "@/lib/middleware";
import { storeFile } from "@/lib/attachment-store";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const POST = adminRoute()
  .named("POST /api/attachments/upload")
  .handle(async (ctx) => {
    const schema = getSchema();
    if (!schema.entities.attachment) {
      return NextResponse.json(
        { error: "Attachment entity not found in schema" },
        { status: 500 },
      );
    }

    let formData: FormData;
    try {
      formData = await ctx.request.formData();
    } catch {
      return NextResponse.json(
        { error: "Request must be multipart/form-data" },
        { status: 400 },
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
        { status: 400 },
      );
    }

    // Validate patientId as a positive integer before any filesystem use
    const patientId = parseInt(patientIdRaw, 10);
    if (isNaN(patientId) || patientId <= 0 || String(patientId) !== patientIdRaw.trim()) {
      return NextResponse.json(
        { error: "patientId must be a positive integer" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 50MB)" },
        { status: 413 },
      );
    }

    // Read valid categories from schema — single source of truth for enum values.
    // Previously hardcoded as VALID_CATEGORIES, which could drift from schema.yaml.
    const categoryField = schema.entities.attachment.fields.category;
    const validCategories = categoryField?.values ?? [];
    if (validCategories.length === 0) {
      return NextResponse.json(
        { error: "Attachment category field is misconfigured in schema (no enum values)" },
        { status: 500 },
      );
    }
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${validCategories.join(", ")}` },
        { status: 400 },
      );
    }

    let stored;
    try {
      stored = await storeFile(patientId, file, file.name);
    } catch (err) {
      if (err instanceof TypeError) {
        // MIME type not allowed (magic-byte rejection)
        return NextResponse.json(
          { error: err.message },
          { status: 415 },
        );
      }
      if (err instanceof RangeError) {
        // patientId invalid or path traversal
        return NextResponse.json(
          { error: err.message },
          { status: 400 },
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

    ctx.audit({
      action: "create",
      entity: "attachment",
      entityId: String((record as Record<string, unknown>).id),
      details: `Uploaded ${category} attachment for patient ${patientId}`,
    });

    return NextResponse.json(record, { status: 201 });
  });
