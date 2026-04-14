/**
 * Nurse CRUD API — List & Create
 *
 * This explicit route is needed because the static `nurse/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 * Delegates to the route factory for standard CRUD behaviour.
 */

import { makeListCreateHandlers } from "@/lib/route-factory";

export const { GET, POST } = makeListCreateHandlers("nurse");
