/**
 * Generic Import API
 *
 * POST /api/{entity}/import
 * Content-Type: multipart/form-data
 *
 * Accepts xlsx, csv, json, or vcf files for any entity.
 * Schema-driven: column mapping, validation, and upsert logic
 * are all derived from schema.yaml.
 *
 * Uses the composable middleware stack (adminRoute) for auth, tracing,
 * and audit logging.
 */

import { NextResponse } from "next/server";
import { getSchema, isSensitive } from "@/lib/schema";
import { parseFile } from "@/lib/parsers";
import { importEntities } from "@/lib/import";
import { adminRoute } from "@/lib/middleware";

export const POST = adminRoute()
  .named("POST /api/[entity]/import")
  .handle(async (ctx) => {
    const { entity: rawEntity } = await (ctx._routeParams as { params: Promise<{ entity: string }> }).params;
    const entityName = rawEntity.replace(/-/g, "_");

    // Validate entity exists
    const schema = getSchema();
    if (!schema.entities[entityName]) {
      return NextResponse.json(
        { error: `Unknown entity: ${entityName}` },
        { status: 404 }
      );
    }

    if (isSensitive(entityName)) {
      return NextResponse.json(
        { error: `Import of ${entityName} is not allowed` },
        { status: 403 }
      );
    }

    // Entities with server-managed fields (e.g., storage_path) must not be importable —
    // a crafted CSV could plant DB records pointing at arbitrary files within uploads.
    const IMPORT_BLOCKED = new Set(["attachment"]);
    if (IMPORT_BLOCKED.has(entityName)) {
      return NextResponse.json(
        { error: `Import of ${entityName} is not allowed` },
        { status: 403 }
      );
    }

    if (schema.entities[entityName]?.immutable) {
      return NextResponse.json(
        { error: `Import of ${entityName} is not allowed — records are immutable` },
        { status: 405 }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await ctx.request.formData();
    } catch {
      return NextResponse.json(
        { error: "Request must be multipart/form-data" },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    // Reject oversized files before loading into memory
    const MAX_IMPORT_SIZE = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_IMPORT_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_IMPORT_SIZE / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }

    // Parse file into row objects
    const buffer = Buffer.from(await file.arrayBuffer());
    let rows;
    try {
      rows = await parseFile(buffer, file.name, entityName);
    } catch (parseError) {
      return NextResponse.json(
        { error: `Failed to parse file: ${(parseError as Error).message}` },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "File contains no data rows" },
        { status: 400 }
      );
    }

    // Guard against DoS via huge CSV/JSON — matches the xlsx limit in parsers.ts
    const MAX_IMPORT_ROWS = 100_000;
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Too many rows: ${rows.length} (max ${MAX_IMPORT_ROWS.toLocaleString()})` },
        { status: 413 }
      );
    }

    // Import with schema-driven upsert
    const result = await importEntities(entityName, rows);

    ctx.audit({
      action: "import",
      entity: entityName,
      entityId: "bulk",
      details: `Imported ${file.name}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
    });

    return NextResponse.json(result);
  });
