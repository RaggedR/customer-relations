/**
 * CardDAV Server — Individual Contact
 *
 * GET /api/carddav/patients/{id} — single patient vCard
 * GET /api/carddav/nurses/{id}   — single nurse vCard
 * PUT /api/carddav/patients/{id} — update from phone edit (two-way sync)
 */

import { NextRequest, NextResponse } from "next/server";
import { findById, update } from "@/lib/repository";
import { generateVCard, parseVCard } from "@/lib/vcard";

interface RouteParams {
  params: Promise<{ addressbook: string; id: string }>;
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

  const { addressbook, id: idStr } = await params;
  const entityName = addressBookToEntity(addressbook);
  const id = parseInt(idStr, 10);

  if (!entityName || isNaN(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const record = (await findById(entityName, id)) as Row | null;
    if (!record) {
      return new NextResponse("Not found", { status: 404 });
    }

    const vcard = generateVCard(entityName, record);

    return new NextResponse(vcard, {
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "ETag": `"${record.updatedAt}"`,
      },
    });
  } catch (error) {
    console.error(`CardDAV GET error:`, error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  if (!checkAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CardDAV"' },
    });
  }

  const { addressbook, id: idStr } = await params;
  const entityName = addressBookToEntity(addressbook);
  const id = parseInt(idStr, 10);

  if (!entityName || isNaN(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const body = await request.text();
    const parsed = parseVCard(entityName, body);

    // Remove non-field properties
    delete parsed.id;
    delete parsed._entity;

    await update(entityName, id, parsed);

    return new NextResponse("", { status: 204 });
  } catch (error) {
    console.error(`CardDAV PUT error:`, error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
