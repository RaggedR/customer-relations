/**
 * Route Factory
 *
 * Generates standard CRUD route handlers for entities that need explicit
 * route files due to Next.js App Router routing precedence (static
 * directories shadow the dynamic [entity] catch-all).
 *
 * Entity validation is NOT done here — the repository throws "Unknown entity"
 * errors for invalid names, and withErrorHandler maps those to 404 responses.
 *
 * Usage:
 *   // src/app/api/patient/route.ts
 *   import { makeListCreateHandlers } from "@/lib/route-factory";
 *   export const { GET, POST } = makeListCreateHandlers("patient");
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchema, foreignKeyName } from "@/lib/schema";
import { findAll, findById, create, update, remove, validateEntity } from "@/lib/repository";
import { withErrorHandler, SENSITIVE_ENTITIES } from "@/lib/api-helpers";
import { getIdempotentResponse, cacheIdempotentResponse } from "@/lib/idempotency";

// ── Helpers ──────────────────────────────────────────────

interface IdRouteParams {
  params: Promise<{ id: string }>;
}

/** Parse and validate the ID path parameter. Returns the numeric ID or a 400 response. */
async function parseIdParam(params: Promise<{ id: string }>): Promise<number | NextResponse> {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  return numId;
}

// ── List + Create ────────────────────────────────────────

/**
 * Create GET (list) and POST (create) handlers for a named entity.
 * Includes search, sort, and relation filtering.
 */
export function makeListCreateHandlers(entityName: string) {
  if (SENSITIVE_ENTITIES.includes(entityName as typeof SENSITIVE_ENTITIES[number])) {
    const blocked = async () =>
      NextResponse.json({ error: `Access to ${entityName} is not allowed` }, { status: 403 });
    return { GET: blocked, POST: blocked };
  }

  async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const sortBy = searchParams.get("sortBy") || undefined;
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || undefined;
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");

    // Build filter from query params (e.g. ?patientId=5)
    // Uses relation names as filterBy keys — the repository resolves to FK names.
    const filterBy: Record<string, unknown> = {};
    const schema = getSchema();
    const entityConfig = schema.entities[entityName];
    if (entityConfig?.relations) {
      for (const relName of Object.keys(entityConfig.relations)) {
        const fkParam = searchParams.get(foreignKeyName(relName));
        if (fkParam) {
          filterBy[relName] = parseInt(fkParam, 10);
        }
      }
    }

    return withErrorHandler(`GET /api/${entityName}`, async () => {
      const result = await findAll(entityName, {
        search,
        sortBy,
        sortOrder,
        filterBy: Object.keys(filterBy).length > 0 ? filterBy : undefined,
        page: pageParam ? parseInt(pageParam, 10) : undefined,
        pageSize: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
        // Paginated list views use shallow mode (no relation includes) for performance.
        // Detail views (findById) still load full relations when the user clicks through.
        shallow: !!pageParam,
      });
      return NextResponse.json(result);
    });
  }

  async function POST(request: NextRequest) {
    // Idempotency: key is scoped to the entity to prevent cross-endpoint collisions.
    // These endpoints are admin-only (proxy-enforced), so per-user scoping is not needed.
    const rawKey = request.headers.get("idempotency-key");
    const idempotencyKey = rawKey ? `${entityName}:${rawKey}` : null;
    if (idempotencyKey) {
      const cached = getIdempotentResponse(idempotencyKey);
      if (cached) return cached;
    }

    return withErrorHandler(`POST /api/${entityName}`, async () => {
      const body = await request.json();
      const errors = validateEntity(entityName, body);
      if (errors.length > 0) {
        return NextResponse.json({ errors }, { status: 400 });
      }

      const item = await create(entityName, body);
      const response = NextResponse.json(item, { status: 201 });

      if (idempotencyKey) {
        await cacheIdempotentResponse(idempotencyKey, response);
      }

      return response;
    });
  }

  return { GET, POST };
}

// ── Get + Update + Delete ────────────────────────────────

/**
 * Create GET, PUT, and DELETE handlers for a named entity by ID.
 */
export function makeGetUpdateDeleteHandlers(entityName: string) {
  if (SENSITIVE_ENTITIES.includes(entityName as typeof SENSITIVE_ENTITIES[number])) {
    const blocked = async () =>
      NextResponse.json({ error: `Access to ${entityName} is not allowed` }, { status: 403 });
    return { GET: blocked, PUT: blocked, DELETE: blocked };
  }

  const isImmutable = getSchema().entities[entityName]?.immutable === true;

  async function GET(request: NextRequest, { params }: IdRouteParams) {
    const result = await parseIdParam(params);
    if (result instanceof NextResponse) return result;
    const numId = result;

    return withErrorHandler(`GET /api/${entityName}/${numId}`, async () => {
      const item = await findById(entityName, numId);
      if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(item);
    });
  }

  async function PUT(request: NextRequest, { params }: IdRouteParams) {
    if (isImmutable) {
      return NextResponse.json(
        { error: `${entityName} records are immutable and cannot be modified` },
        { status: 405 },
      );
    }

    const result = await parseIdParam(params);
    if (result instanceof NextResponse) return result;
    const numId = result;

    return withErrorHandler(`PUT /api/${entityName}/${numId}`, async () => {
      const body = await request.json();
      const errors = validateEntity(entityName, body);
      if (errors.length > 0) {
        return NextResponse.json({ errors }, { status: 400 });
      }

      const item = await update(entityName, numId, body);
      return NextResponse.json(item);
    });
  }

  async function DELETE(request: NextRequest, { params }: IdRouteParams) {
    if (isImmutable) {
      return NextResponse.json(
        { error: `${entityName} records are immutable and cannot be deleted` },
        { status: 405 },
      );
    }

    const result = await parseIdParam(params);
    if (result instanceof NextResponse) return result;
    const numId = result;

    return withErrorHandler(`DELETE /api/${entityName}/${numId}`, async () => {
      await remove(entityName, numId);
      return NextResponse.json({ success: true });
    });
  }

  return { GET, PUT, DELETE };
}
