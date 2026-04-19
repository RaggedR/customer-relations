import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, hasRole, requiresRole, getIdleTimeout } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
// getSecret is a pure env-var accessor with no mutable state, so it's safe to
// share across the proxy boundary despite the Next.js 16 proxy docs warning
// about shared modules. COOKIE_NAME is kept duplicated here as a precaution.
import { getSecret, hashSessionToken } from "@/lib/session";

const COOKIE_NAME = "session";

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

  // Demo mode — skip all auth checks.
  // SECURITY: startup guard in instrumentation.ts prevents this from being active in production.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
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
  // We store sha256(token) in the DB, so hash before lookup.
  const tokenHash = hashSessionToken(token);
  const dbSession = await prisma.session.findUnique({ where: { token: tokenHash } });
  if (!dbSession) {
    // JWT is valid but session was revoked or never created
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  // Idle timeout: nurses 10 min, admins 30 min, patients none.
  // Defined centrally in auth.ts — getIdleTimeout() is the single source of truth.
  const idleTimeoutMs = getIdleTimeout(payload.role);

  if (idleTimeoutMs !== null) {
    const idleMs = Date.now() - dbSession.last_active.getTime();
    if (idleMs > idleTimeoutMs) {
      await prisma.session.delete({ where: { id: dbSession.id } });
      return NextResponse.redirect(new URL(redirect, request.url));
    }
  }

  // Force password change: redirect to /change-password if the flag is set.
  // Skip for the change-password page itself and auth API routes (avoid redirect loop).
  if (pathname !== "/change-password" && !pathname.startsWith("/api/auth/")) {
    const user = dbSession.userId
      ? await prisma.user.findUnique({
          where: { id: dbSession.userId },
          select: { must_change_password: true },
        })
      : null;
    if (user?.must_change_password) {
      return NextResponse.redirect(new URL("/change-password", request.url));
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
