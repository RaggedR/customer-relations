/**
 * Navigation API
 *
 * GET /api/navigation — returns the parsed navigation.yaml config
 * Used by the frontend to drive window types and transitions.
 */

import { NextResponse } from "next/server";
import { loadNavigationYaml } from "@/lib/navigation-loader";

export async function GET() {
  try {
    const nav = loadNavigationYaml();
    return NextResponse.json(nav);
  } catch (error) {
    console.error("GET /api/navigation error:", error);
    return NextResponse.json(
      { error: "Failed to load navigation config" },
      { status: 500 }
    );
  }
}
