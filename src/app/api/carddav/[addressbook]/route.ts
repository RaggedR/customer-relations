/**
 * CardDAV Server — Address Book Listing
 *
 * GET /api/carddav/patients/ — list all patient vCards
 * GET /api/carddav/nurses/   — list all nurse vCards
 *
 * Returns all contacts as a single vCard stream (text/vcard).
 */

import { NextRequest, NextResponse } from "next/server";
import { findAll } from "@/lib/repository";
import { generateVCards } from "@/lib/vcard";

interface RouteParams {
  params: Promise<{ addressbook: string }>;
}

type Row = Record<string, unknown>;

const CARDDAV_PASSWORD = process.env.CARDDAV_PASSWORD || "";

function checkAuth(request: Request): boolean {
  if (!CARDDAV_PASSWORD) return true;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice(6), "base64").toString();
  const [, password] = decoded.split(":");
  return password === CARDDAV_PASSWORD;
}

function addressBookToEntity(addressbook: string): string | null {
  switch (addressbook) {
    case "patients":
      return "patient";
    case "nurses":
      return "nurse";
    default:
      return null;
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!checkAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CardDAV"' },
    });
  }

  const { addressbook } = await params;
  const entityName = addressBookToEntity(addressbook);
  if (!entityName) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const records = (await findAll(entityName)) as Row[];
    const vcards = generateVCards(entityName, records);

    return new NextResponse(vcards, {
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `inline; filename="${addressbook}.vcf"`,
      },
    });
  } catch (error) {
    console.error(`CardDAV listing error for ${addressbook}:`, error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
