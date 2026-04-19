/**
 * Logout API
 *
 * POST /api/auth/logout
 *
 * Clears the session cookie and instructs the browser to purge
 * all cached data (critical for nurse portal on unmanaged devices).
 */

import { NextRequest, NextResponse } from "next/server";
import { extractRequestContext } from "@/lib/request-context";
import { logAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSessionUser, COOKIE_NAME, COOKIE_OPTIONS, hashSessionToken } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    // Best-effort: read session for audit before clearing
    const session = await getSessionUser(request).catch(() => null);
    const ctx = extractRequestContext(request, session);

    // Clean up DB session record (makes logout immediate, even if JWT is still valid).
    // DB stores sha256(token), so hash before delete.
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      await prisma.session.deleteMany({ where: { token: hashSessionToken(token) } }).catch(() => {});
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
      logAuditEvent({
        action: "logout",
        entity: "user",
        entityId: String(session.userId),
        context: ctx,
      });
    }

    return response;
  } catch (error) {
    logger.error({ err: error }, "Logout error");
    // Still clear the cookie even if something else fails
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    return response;
  }
}
