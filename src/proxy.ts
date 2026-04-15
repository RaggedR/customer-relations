import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, hasRole, requiresRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
// getSecret is a pure env-var accessor with no mutable state, so it's safe to
// share across the proxy boundary despite the Next.js 16 proxy docs warning
// about shared modules. COOKIE_NAME is kept duplicated here as a precaution.
import { getSecret } from "@/lib/session";

const COOKIE_NAME = "session";
const NURSE_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function parseCookie(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE_NAME)?.value;
}

/** Redirect to the appropriate login page based on which role was required. */
function loginUrl(requiredRole: string): string {
  return requiredRole === "patient" ? "/portal/login" : "/login";
}

/**
 * Next.js 16 proxy (global request interceptor).
 *
 * Enforces role-based access on every request:
 * - Public routes (/login, /_next/) pass through
 * - Protected routes require a valid session cookie with sufficient role
 *
 * Security headers: all authenticated routes get `Cache-Control: no-store`
 * because clinical data and admin interfaces must never be served from
 * browser cache, especially on shared or unmanaged devices.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const requiredRole = requiresRole(pathname);

  // Public route — pass through
  if (requiredRole === null) {
    return NextResponse.next();
  }

  // Protected route — verify session
  const redirect = loginUrl(requiredRole);
  const token = parseCookie(request);
  if (!token) {
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  const payload = await verifyToken(token, getSecret());
  if (!payload) {
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  // Check role hierarchy
  if (!hasRole(payload, requiredRole)) {
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  // Session DB check: verify the session record exists and is not idle-timed-out.
  // This makes sessions revocable (delete the DB row → immediate logout).
  const dbSession = await prisma.session.findUnique({ where: { token } });
  if (!dbSession) {
    // JWT is valid but session was revoked or never created
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  // Idle timeout: nurses 10 min, admins 30 min.
  // Patient sessions have no idle timeout (null) — patients access read-only
  // appointment summaries from personal devices and may have long gaps between views.
  const idleTimeoutMs =
    payload.role === "nurse" ? NURSE_IDLE_TIMEOUT_MS :
    payload.role === "admin" ? ADMIN_IDLE_TIMEOUT_MS :
    null;

  if (idleTimeoutMs !== null) {
    const idleMs = Date.now() - dbSession.last_active.getTime();
    if (idleMs > idleTimeoutMs) {
      await prisma.session.delete({ where: { id: dbSession.id } });
      return NextResponse.redirect(new URL(redirect, request.url));
    }
  }

  // Update last_active (sliding window) — fire-and-forget, non-blocking
  prisma.session
    .update({ where: { id: dbSession.id }, data: { last_active: new Date() } })
    .catch((err) => {
      logger.error({ err }, "Failed to update session last_active");
    });

  // Authorized — build response with security headers
  const response = NextResponse.next();

  // Anti-caching for all authenticated routes: clinical data and admin
  // interfaces must never be served from browser cache (especially on
  // shared or unmanaged devices).
  response.headers.set(
    "cache-control",
    "no-store, no-cache, must-revalidate",
  );

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
