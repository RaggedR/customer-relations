/**
 * Route Factory
 *
 * Generates standard CRUD route handlers for entities that need explicit
 * route files due to Next.js App Router routing precedence (static
 * directories shadow the dynamic [entity] catch-all).
 *
 * Uses the composable middleware stack (adminRoute) for auth, tracing,
 * and audit logging. POST/PUT/DELETE include automatic CRUD audit entries.
 *
 * Entity validation is NOT done here — the repository throws "Unknown entity"
 * errors for invalid names, and the error boundary maps those to 404 responses.
 *
 * Usage:
 *   // src/app/api/patient/route.ts
 *   import { makeListCreateHandlers } from "@/lib/route-factory";
 *   export const { GET, POST } = makeListCreateHandlers("patient");
 */

import { NextResponse } from "next/server";
import { getSchema, foreignKeyName, isSensitive } from "@/lib/schema";
import { findAll, findById, create, update, remove, validateEntity } from "@/lib/repository";
import { getIdempotentResponse, cacheIdempotentResponse, MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/idempotency";
import { adminRoute, adminIdRoute } from "@/lib/middleware";

// ── Helpers ──────────────────────────────────────────────

/** Parse and validate the ID path parameter. Returns the numeric ID or a 400 response. */
export async function parseIdParam(params: Promise<{ id: string }>): Promise<number | NextResponse> {
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
 * Mutations include automatic audit logging.
 */
export function makeListCreateHandlers(entityName: string) {
  if (isSensitive(entityName)) {
    const blocked = async () =>
      NextResponse.json({ error: `Access to ${entityName} is not allowed` }, { status: 403 });
    return { GET: blocked, POST: blocked };
  }

  const GET = adminRoute()
    .named(`GET /api/${entityName}`)
    .handle(async (ctx) => {
      const { searchParams } = new URL(ctx.request.url);
      const search = searchParams.get("search") || undefined;
      const sortBy = searchParams.get("sortBy") || undefined;
      const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || undefined;
      const pageParam = searchParams.get("page");
      const pageSizeParam = searchParams.get("pageSize");

      // Build filter from query params (e.g. ?patientId=5)
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

      const result = await findAll(entityName, {
        search,
        sortBy,
        sortOrder,
        filterBy: Object.keys(filterBy).length > 0 ? filterBy : undefined,
        page: pageParam ? parseInt(pageParam, 10) : undefined,
        pageSize: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
        shallow: !!pageParam,
      });
      return NextResponse.json(result);
    });

  const POST = adminRoute()
    .named(`POST /api/${entityName}`)
    .handle(async (ctx) => {
      // Idempotency: key is scoped to the entity to prevent cross-endpoint collisions.
      const rawKey = ctx.request.headers.get("idempotency-key");
      if (rawKey && rawKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
        return NextResponse.json(
          { error: `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters` },
          { status: 400 },
        );
      }
      const idempotencyKey = rawKey ? `${entityName}:${rawKey}` : null;
      if (idempotencyKey) {
        const cached = getIdempotentResponse(idempotencyKey);
        if (cached) return cached;
      }

      const body = await ctx.request.json();
      const errors = validateEntity(entityName, body);
      if (errors.length > 0) {
        return NextResponse.json({ errors }, { status: 400 });
      }

      const item = await create(entityName, body);
      const record = item as Record<string, unknown>;

      // Audit: CRUD create — closes the compliance gap for factory-served routes
      ctx.audit({
        action: "create",
        entity: entityName,
        entityId: String(record.id ?? "unknown"),
      });

      const response = NextResponse.json(item, { status: 201 });

      if (idempotencyKey) {
        await cacheIdempotentResponse(idempotencyKey, response);
      }

      return response;
    });

  return { GET, POST };
}

// ── Get + Update + Delete ────────────────────────────────

/**
 * Create GET, PUT, and DELETE handlers for a named entity by ID.
 * PUT and DELETE include automatic audit logging.
 */
export function makeGetUpdateDeleteHandlers(entityName: string) {
  if (isSensitive(entityName)) {
    const blocked = async () =>
      NextResponse.json({ error: `Access to ${entityName} is not allowed` }, { status: 403 });
    return { GET: blocked, PUT: blocked, DELETE: blocked };
  }

  const isImmutable = getSchema().entities[entityName]?.immutable === true;

  const GET = adminIdRoute()
    .named(`GET /api/${entityName}/[id]`)
    .handle(async (ctx) => {
      const item = await findById(entityName, ctx.entityId);
      if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(item);
    });

  const PUT = adminIdRoute()
    .named(`PUT /api/${entityName}/[id]`)
    .handle(async (ctx) => {
      if (isImmutable) {
        return NextResponse.json(
          { error: `${entityName} records are immutable and cannot be modified` },
          { status: 405 },
        );
      }

      const body = await ctx.request.json();
      const errors = validateEntity(entityName, body);
      if (errors.length > 0) {
        return NextResponse.json({ errors }, { status: 400 });
      }

      const expectedUpdatedAt = body.updatedAt ?? body.updated_at;
      const item = await update(entityName, ctx.entityId, body, {
        expectedUpdatedAt: expectedUpdatedAt ? String(expectedUpdatedAt) : undefined,
      });

      // Audit: CRUD update
      ctx.audit({
        action: "update",
        entity: entityName,
        entityId: String(ctx.entityId),
      });

      return NextResponse.json(item);
    });

  const DELETE = adminIdRoute()
    .named(`DELETE /api/${entityName}/[id]`)
    .handle(async (ctx) => {
      if (isImmutable) {
        return NextResponse.json(
          { error: `${entityName} records are immutable and cannot be deleted` },
          { status: 405 },
        );
      }

      await remove(entityName, ctx.entityId);

      // Audit: CRUD delete
      ctx.audit({
        action: "delete",
        entity: entityName,
        entityId: String(ctx.entityId),
      });

      return NextResponse.json({ success: true });
    });

  return { GET, PUT, DELETE };
}
