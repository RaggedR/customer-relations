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
import { checkAuth, addressBookToEntity } from "@/lib/carddav-auth";
import { withErrorHandler } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ addressbook: string }>;
}

type Row = Record<string, unknown>;

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

  return withErrorHandler(`GET /api/carddav/${addressbook}`, async () => {
    const records = (await findAll(entityName)) as Row[];
    const vcards = generateVCards(entityName, records);

    return new NextResponse(vcards, {
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `inline; filename="${addressbook}.vcf"`,
      },
    });
  });
}
