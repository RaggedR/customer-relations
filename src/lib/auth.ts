import { SignJWT, jwtVerify } from "jose";

// --- Types ---

export type Role = "admin" | "nurse" | "patient";

export interface SessionPayload {
  userId: string;
  role: Role;
}

// --- Session crypto ---

export async function signSession(
  payload: SessionPayload,
  secret: string,
  expiresIn: string = "8h",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// --- Role predicates ---

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  nurse: 2,
  patient: 1,
};

export function hasRole(payload: SessionPayload, required: Role): boolean {
  return ROLE_HIERARCHY[payload.role] >= ROLE_HIERARCHY[required];
}

// --- Route → role mapping ---

/**
 * Map URL pathname to the minimum role required for access.
 *
 * SECURITY: This is the auth boundary. Any new route prefix
 * (e.g. "/receptionist/") MUST be added here. Routes not
 * matched fall through to null (no auth required — public).
 */
export function requiresRole(pathname: string): Role | null {
  // Public routes — no auth needed
  if (pathname === "/login" || pathname.startsWith("/_next/")) return null;

  // Nurse routes (check before admin to handle /api/nurse/*)
  if (pathname.startsWith("/nurse/") || pathname.startsWith("/api/nurse/"))
    return "nurse";

  // Patient portal routes
  if (pathname.startsWith("/portal/") || pathname.startsWith("/api/portal/"))
    return "patient";

  // Admin routes (explicit group or default for API)
  if (pathname.startsWith("/(admin)/") || pathname.startsWith("/api/"))
    return "admin";

  return null;
}
