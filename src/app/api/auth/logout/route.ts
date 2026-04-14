/**
 * Logout API
 *
 * POST /api/auth/logout
 *
 * Clears the session cookie and instructs the browser to purge
 * all cached data (critical for nurse portal on unmanaged devices).
 */

import { NextRequest, NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSessionUser, COOKIE_NAME, COOKIE_OPTIONS } from "@/lib/session";

export async function POST(request: NextRequest) {
  // Best-effort: read session for audit before clearing
  const session = await getSessionUser(request).catch(() => null);

  // Clean up DB session record (makes logout immediate, even if JWT is still valid)
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
  }

  // Clear cookie
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  });

  // Instruct browser to purge cache, cookies, and storage
  // Critical for nurse portal on unmanaged personal devices
  response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');

  // Audit: log logout (fire-and-forget)
  if (session) {
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;
    logAuditEvent({
      userId: session.userId,
      action: "logout",
      entity: "user",
      entityId: String(session.userId),
      ip,
      userAgent,
    });
  }

  return response;
}
