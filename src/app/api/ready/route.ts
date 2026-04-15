import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Readiness probe — GET /api/ready
 *
 * Public health check that verifies database connectivity.
 * Returns 200 when ready, 503 when the database is unreachable.
 *
 * Intended for use by load balancers and container orchestrators
 * (e.g. Docker HEALTHCHECK, Kubernetes readinessProbe).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "not ready" }, { status: 503 });
  }
}
