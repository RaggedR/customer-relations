/**
 * Session Management
 *
 * Shared session constants and a helper to extract the authenticated
 * user from the request cookie. Route handlers call getSessionUser()
 * to get the userId (as a number) and role without reimplementing
 * cookie parsing.
 *
 * NOTE: The proxy (src/proxy.ts) maintains its own COOKIE_NAME constant
 * because Next.js 16 proxy docs warn against relying on shared modules.
 * If you rename the cookie here, update proxy.ts to match.
 */

import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { verifyToken, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const COOKIE_NAME = "session";
export const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours in seconds

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

export interface SessionUser {
  userId: number;
  role: Role;
}

export function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return secret;
}

/**
 * Hash a session token for DB storage/lookup.
 * Only the SHA-256 hash is stored — a database dump cannot yield replayable JWTs.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Extract the authenticated user from the request's session cookie.
 *
 * Returns null if: no cookie, invalid/expired JWT, or non-numeric userId.
 * Re-verifies the JWT (~0.1ms HS256) rather than trusting proxy state,
 * because proxy cannot pass verified state to route handlers safely.
 *
 * In demo mode (NEXT_PUBLIC_DEMO_MODE=true), returns a default admin
 * session when no valid cookie is present — allows browsing without login.
 */
export async function getSessionUser(
  request: NextRequest,
): Promise<SessionUser | null> {
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (!isDemo) return null;
    // Demo mode: infer the appropriate role from the request path
    // so nurse/patient portals work without login.
    const { pathname } = request.nextUrl;
    let demoRole: Role = "admin";
    // Nurse portal API routes have known sub-paths: /api/nurse/appointments, /api/nurse/me, etc.
    // The bare /api/nurse and /api/nurse/[id] endpoints are admin CRUD, not nurse portal.
    const nursePortalPaths = ["/api/nurse/appointments", "/api/nurse/availability", "/api/nurse/me", "/api/nurse/records"];
    const isNursePortalApi = nursePortalPaths.some((p) => pathname.startsWith(p));
    if (isNursePortalApi || pathname.startsWith("/nurse")) {
      demoRole = "nurse";
    } else if (pathname.startsWith("/api/portal") || pathname.startsWith("/portal")) {
      demoRole = "patient";
    }
    const user = await prisma.user.findFirst({
      where: { role: demoRole, active: true },
      orderBy: { id: "asc" },
    });
    return user ? { userId: user.id, role: demoRole } : { userId: 1, role: "admin" };
  }

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const payload = await verifyToken(token, secret);
  if (!payload) return null;

  const userId = parseInt(payload.userId, 10);
  if (isNaN(userId) || String(userId) !== payload.userId) return null;

  return { userId, role: payload.role };
}
