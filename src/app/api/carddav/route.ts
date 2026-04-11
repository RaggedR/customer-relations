/**
 * CardDAV Server — Root Discovery
 *
 * GET /api/carddav/ — list available address books
 *
 * Also handles .well-known/carddav redirect.
 * Note: PROPFIND is not natively supported by Next.js App Router,
 * so CardDAV clients that only use PROPFIND will need the
 * well-known redirect to point to a supported method.
 */

import { NextResponse } from "next/server";

const CARDDAV_PASSWORD = process.env.CARDDAV_PASSWORD || "";

function checkAuth(request: Request): boolean {
  if (!CARDDAV_PASSWORD) return true; // No password = no auth required

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === CARDDAV_PASSWORD;
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CardDAV"' },
    });
  }

  // Return a simple JSON listing of address books
  const addressBooks = [
    {
      name: "Patients",
      url: "/api/carddav/patients/",
      description: "Patient contacts",
    },
    {
      name: "Nurses",
      url: "/api/carddav/nurses/",
      description: "Nurse contacts",
    },
  ];

  return NextResponse.json(addressBooks);
}
