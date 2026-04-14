/**
 * CardDAV Authentication
 *
 * Shared Basic auth check and address book → entity name resolution
 * for all CardDAV route handlers.
 */

const CARDDAV_PASSWORD = process.env.CARDDAV_PASSWORD || "";

export function checkAuth(request: Request): boolean {
  if (!CARDDAV_PASSWORD) return true; // Dev-only: production must set CARDDAV_PASSWORD

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === CARDDAV_PASSWORD;
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
