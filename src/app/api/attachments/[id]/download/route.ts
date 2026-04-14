/**
 * File Download API
 *
 * GET /api/attachments/:id/download
 *
 * Looks up the attachment record, reads the file from disk,
 * and streams it back with the original filename and MIME type.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { findById } from "@/lib/repository";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const record = (await findById("attachment", numId)) as Record<
      string,
      unknown
    > | null;
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storagePath = String(record.storage_path);
    const fullPath = path.resolve(UPLOADS_DIR, storagePath);

    // Ensure path stays inside uploads/
    if (!fullPath.startsWith(UPLOADS_DIR + path.sep)) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 400 }
      );
    }

    const buffer = await fs.readFile(fullPath);
    const rawFilename = String(record.filename);
    // Sanitise for Content-Disposition header — strip quotes and control chars
    const safeFilename = rawFilename.replace(/["\r\n]/g, "_");
    const mimeType = String(record.mime_type || "application/octet-stream");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(buffer.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { error: "File not found on disk" },
        { status: 404 }
      );
    }
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
