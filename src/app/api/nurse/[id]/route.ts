/**
 * Nurse CRUD API — Get, Update, Delete by ID
 *
 * This explicit route is needed because the static `nurse/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 * Delegates to the route factory for standard CRUD behaviour.
 */

import { makeGetUpdateDeleteHandlers } from "@/lib/route-factory";

export const { GET, PUT, DELETE } = makeGetUpdateDeleteHandlers("nurse");
