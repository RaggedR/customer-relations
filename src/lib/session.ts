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
import { verifyToken, type Role } from "@/lib/auth";

export const COOKIE_NAME = "session";

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
 * Extract the authenticated user from the request's session cookie.
 *
 * Returns null if: no cookie, invalid/expired JWT, or non-numeric userId.
 * Re-verifies the JWT (~0.1ms HS256) rather than trusting proxy state,
 * because proxy cannot pass verified state to route handlers safely.
 */
export async function getSessionUser(
  request: NextRequest,
): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const payload = await verifyToken(token, secret);
  if (!payload) return null;

  const userId = parseInt(payload.userId, 10);
  if (isNaN(userId)) return null;

  return { userId, role: payload.role };
}
