import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, hasRole, requiresRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "session";
const NURSE_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return secret;
}

function parseCookie(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE_NAME)?.value;
}

/**
 * Next.js 16 proxy (global request interceptor).
 *
 * Enforces role-based access on every request:
 * - Public routes (/login, /_next/) pass through
 * - Protected routes require a valid session cookie with sufficient role
 *
 * Security headers: nurse and patient portals get `Cache-Control: no-store`
 * because these portals are accessed from unmanaged personal devices where
 * browser caches cannot be trusted to clear clinical data.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const requiredRole = requiresRole(pathname);

  // Public route — pass through
  if (requiredRole === null) {
    return NextResponse.next();
  }

  // Protected route — verify session
  const token = parseCookie(request);
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token, getSecret());
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check role hierarchy
  if (!hasRole(payload, requiredRole)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Session DB check: verify the session record exists and is not idle-timed-out.
  // This makes sessions revocable (delete the DB row → immediate logout).
  const dbSession = await prisma.session.findUnique({ where: { token } });
  if (!dbSession) {
    // JWT is valid but session was revoked or never created
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Idle timeout for nurse sessions (10 minutes)
  if (payload.role === "nurse") {
    const idleMs = Date.now() - dbSession.last_active.getTime();
    if (idleMs > NURSE_IDLE_TIMEOUT_MS) {
      await prisma.session.delete({ where: { id: dbSession.id } });
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Update last_active (sliding window) — fire-and-forget, non-blocking
  prisma.session
    .update({ where: { id: dbSession.id }, data: { last_active: new Date() } })
    .catch(() => {});

  // Authorized — build response with security headers for sensitive portals
  const response = NextResponse.next();

  // Anti-caching for nurse and patient portals (unmanaged devices)
  if (requiredRole === "nurse" || requiredRole === "patient") {
    response.headers.set(
      "cache-control",
      "no-store, no-cache, must-revalidate",
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
