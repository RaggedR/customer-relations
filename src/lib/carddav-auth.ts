/**
 * CardDAV Authentication
 *
 * Shared Basic auth check and address book → entity name resolution
 * for all CardDAV route handlers.
 */

import { timingSafeEqual } from "crypto";

const CARDDAV_PASSWORD = process.env.CARDDAV_PASSWORD || "";

export function checkAuth(request: Request): boolean {
  if (!CARDDAV_PASSWORD) return false; // Deny all if password not configured

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(CARDDAV_PASSWORD));
  } catch {
    return false; // Lengths differ
  }
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
