/**
 * Generic Import API
 *
 * POST /api/{entity}/import
 * Content-Type: multipart/form-data
 *
 * Accepts xlsx, csv, json, or vcf files for any entity.
 * Schema-driven: column mapping, validation, and upsert logic
 * are all derived from schema.yaml.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchema, isSensitive } from "@/lib/schema";
import { parseFile } from "@/lib/parsers";
import { importEntities } from "@/lib/import";
import { withErrorHandler } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ entity: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { entity: rawEntity } = await params;
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

  if (schema.entities[entityName]?.immutable) {
    return NextResponse.json(
      { error: `Import of ${entityName} is not allowed — records are immutable` },
      { status: 405 }
    );
  }

  // Parse multipart form data
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

  // Import with schema-driven upsert
  return withErrorHandler(`POST /api/${entityName}/import`, async () => {
    const result = await importEntities(entityName, rows);
    return NextResponse.json(result);
  });
}
