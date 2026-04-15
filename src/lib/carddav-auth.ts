/**
 * CardDAV Authentication
 *
 * Shared Basic auth check and address book → entity name resolution
 * for all CardDAV route handlers.
 */

import { timingSafeEqual, createHash } from "crypto";
import { createRateLimiter } from "@/lib/rate-limit";

const carddavLimiter = createRateLimiter(20, 60_000); // 20 requests/minute per IP

export function checkAuth(request: Request): boolean {
  const CARDDAV_PASSWORD = process.env.CARDDAV_PASSWORD || ""; // Read per-request for hot rotation
  if (!CARDDAV_PASSWORD) return false; // Deny all if password not configured

  // Rate limit by IP to prevent brute-force
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const rl = carddavLimiter(ip);
  if (!rl.allowed) return false;

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  // RFC 7617 §2: only the FIRST colon separates username from password;
  // passwords may themselves contain colons.
  const colonIdx = decoded.indexOf(":");
  const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
  // Hash both to constant length — prevents timing oracle on password length
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(CARDDAV_PASSWORD).digest();
  return timingSafeEqual(a, b);
}

export function addressBookToEntity(addressbook: string): string | null {
  switch (addressbook) {
    case "patients":
      return "patient";
    case "nurses":
      return "nurse";
    default:
      return null;
  }
}
