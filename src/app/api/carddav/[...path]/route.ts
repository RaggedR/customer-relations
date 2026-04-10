/**
 * CardDAV API Route (catch-all)
 *
 * Routes all CardDAV requests to the appropriate handler.
 * CardDAV uses non-standard HTTP methods (PROPFIND, REPORT)
 * which we handle via the catch-all.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  handlePropfind,
  handleGet,
  handlePut,
  handleDelete,
  handleOptions,
} from "@/carddav/server";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

function buildPath(pathSegments: string[]): string {
  return "/" + pathSegments.join("/");
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params;
  const path = buildPath(pathSegments);
  return handleGet(path);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params;
  const path = buildPath(pathSegments);
  return handlePut(request, path);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params;
  const path = buildPath(pathSegments);
  return handleDelete(path);
}

export async function OPTIONS() {
  return handleOptions();
}

/**
 * PROPFIND is not a standard HTTP method, but Next.js allows
 * custom method handlers. If this doesn't work, we'll need
 * middleware to intercept it.
 */
export async function PROPFIND(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params;
  const path = buildPath(pathSegments);
  return handlePropfind(request, path);
}
