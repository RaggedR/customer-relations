/**
 * File Download API
 *
 * GET /api/attachments/:id/download
 *
 * Looks up the attachment record, reads the file from disk,
 * and streams it back with the original filename and MIME type.
 */

import { NextResponse } from "next/server";
import { createReadStream, promises as fsp } from "fs";
import { Readable } from "stream";
import { findById } from "@/lib/repository";
import { adminIdRoute } from "@/lib/middleware";
import { logger } from "@/lib/logger";
import { getFilePath } from "@/lib/attachment-store";

export const GET = adminIdRoute()
  .named("GET /api/attachments/[id]/download")
  .handle(async (ctx) => {
    const record = (await findById("attachment", ctx.entityId)) as Record<
      string,
      unknown
    > | null;
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storagePath = String(record.storage_path);
    const storedMimeType = String(record.mime_type || "");

    let fileResult;
    try {
      fileResult = getFilePath(storagePath, storedMimeType);
    } catch (err) {
      if (err instanceof RangeError) {
        // Path traversal detected — return 400 rather than 500
        return NextResponse.json(
          { error: "Invalid file path" },
          { status: 400 },
        );
      }
      throw err;
    }

    const { fullPath, safeMimeType } = fileResult;

    ctx.audit({
      action: "download",
      entity: "attachment",
      entityId: String(ctx.entityId),
      details: `Downloaded ${record.category} attachment`,
    });

    const rawFilename = String(record.filename);
    // Sanitise for Content-Disposition header — strip quotes and control chars
    const safeFilename = rawFilename.replace(/["\r\n]/g, "_");

    let fileStat;
    try {
      fileStat = await fsp.stat(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json(
          { error: "File not found on disk" },
          { status: 404 },
        );
      }
      logger.error({ err: error }, "Download stat error");
      throw error;
    }

    const nodeStream = createReadStream(fullPath);

    // Clean up file descriptor on stream error or client disconnect
    nodeStream.on("error", () => nodeStream.destroy());
    ctx.request.signal.addEventListener("abort", () => nodeStream.destroy());

    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": safeMimeType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(fileStat.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  });
