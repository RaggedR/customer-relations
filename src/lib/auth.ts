import { SignJWT, jwtVerify } from "jose";

// --- Types ---

/**
 * DSL-ESCAPE: Roles are hardcoded as a three-value union, not schema-driven.
 *   Reason: roles are structural — they map 1:1 to Next.js route groups
 *   ((admin)/, nurse/, portal/), proxy rules, middleware stacks, and portal
 *   layouts. Making roles data-driven would mean dynamic route generation,
 *   dynamic middleware composition, and dynamic proxy rules — a fundamental
 *   architectural change with no clear benefit for a single-practitioner practice.
 *   Cost to promote: very high. Leave as code.
 *   Trigger to promote: the system serves multiple practices with different role models.
 */
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

// --- Idle timeout configuration ---

/**
 * Per-role idle timeout in milliseconds.
 * Nurses: 10 min (clinical workstations often shared).
 * Admins: 30 min (longer operational tasks).
 * Patients: null (personal devices; no idle cutoff).
 */
const IDLE_TIMEOUTS_MS: Partial<Record<Role, number>> = {
  nurse: 10 * 60 * 1000,
  admin: 30 * 60 * 1000,
};

export function getIdleTimeout(role: Role): number | null {
  return IDLE_TIMEOUTS_MS[role] ?? null;
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
    pathname === "/api/ready" || // Readiness probe — no patient data exposed
    pathname === "/portal/login" ||
    pathname === "/portal/claim" ||
    pathname === "/portal/privacy"
  ) {
    return null;
  }

  // Nurse routes (check before default to handle /api/nurse/*)
  // Matches both /nurse and /nurse/* — bare path has no trailing slash
  if (pathname === "/nurse" || pathname.startsWith("/nurse/") || pathname.startsWith("/api/nurse/"))
    return "nurse";

  // Patient portal routes
  // Matches both /portal and /portal/* — bare path has no trailing slash
  if (pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/api/portal/"))
    return "patient";

  // Everything else requires admin (default-deny)
  return "admin";
}
