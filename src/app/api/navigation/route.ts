/**
 * Navigation API
 *
 * GET /api/navigation — returns the parsed navigation.yaml config
 * Used by the frontend to drive window types and transitions.
 */

import { NextResponse } from "next/server";
import { loadNavigationYaml } from "@/lib/navigation-loader";
import { withErrorHandler } from "@/lib/api-helpers";

export async function GET() {
  return withErrorHandler("GET /api/navigation", async () => {
    const nav = loadNavigationYaml();
    return NextResponse.json(nav);
  });
}
