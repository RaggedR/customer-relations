/**
 * Patient CRUD API — List & Create
 *
 * This explicit route is needed because the static `patient/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 *
 * GET is wrapped to add audit logging — listing patients exposes personal
 * details (names, Medicare numbers, contact info) for all patients.
 * POST delegates to the route factory unchanged.
 */

import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/middleware";
import { makeListCreateHandlers } from "@/lib/route-factory";
import { findAll } from "@/lib/repository";
import { getSchema, foreignKeyName } from "@/lib/schema";

const handlers = makeListCreateHandlers("patient");

export const GET = adminRoute()
  .named("GET /api/patient")
  .handle(async (ctx) => {
    const { searchParams } = new URL(ctx.request.url);
    const search = searchParams.get("search") || undefined;
    const sortBy = searchParams.get("sortBy") || undefined;
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || undefined;
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");

    const filterBy: Record<string, unknown> = {};
    const schema = getSchema();
    const entityConfig = schema.entities.patient;
    if (entityConfig?.relations) {
      for (const relName of Object.keys(entityConfig.relations)) {
        const fkParam = searchParams.get(foreignKeyName(relName));
        if (fkParam) {
          filterBy[relName] = parseInt(fkParam, 10);
        }
      }
    }

    const result = await findAll("patient", {
      search,
      sortBy,
      sortOrder,
      filterBy: Object.keys(filterBy).length > 0 ? filterBy : undefined,
      page: pageParam ? parseInt(pageParam, 10) : undefined,
      pageSize: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
      shallow: !!pageParam,
    });

    ctx.audit({
      action: "view_list",
      entity: "patient",
      entityId: "all",
      details: search ? `searched patients: "${search}"` : "viewed patient list",
    });

    return NextResponse.json(result);
  });

export const { POST } = handlers;
