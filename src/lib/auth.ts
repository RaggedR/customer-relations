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
 * SECURITY: Default-deny. Every route requires admin unless explicitly
 * listed as public or assigned to a lower role. Adding a new public
 * route requires an explicit entry here — fail-closed by design.
 */
export function requiresRole(pathname: string): Role | null {
  // Normalise to lowercase — prevents auth bypass via /Nurse/ on case-insensitive filesystems
  pathname = pathname.toLowerCase();

  // Public routes — no auth needed
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/api/carddav/") || // CardDAV uses Basic auth via checkAuth() in carddav-auth.ts
    pathname === "/portal/login" ||
    pathname === "/portal/claim" ||
    pathname === "/portal/privacy"
  ) {
    return null;
  }

  // Nurse routes (check before default to handle /api/nurse/*)
  if (pathname.startsWith("/nurse/") || pathname.startsWith("/api/nurse/"))
    return "nurse";

  // Patient portal routes
  if (pathname.startsWith("/portal/") || pathname.startsWith("/api/portal/"))
    return "patient";

  // Everything else requires admin (default-deny)
  return "admin";
}
