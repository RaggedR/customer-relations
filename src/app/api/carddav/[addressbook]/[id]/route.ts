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
import { checkAuth, addressBookToEntity } from "@/lib/carddav-auth";
import { withErrorHandler } from "@/lib/api-helpers";
import { parseIdParam } from "@/lib/route-factory";
import type { Row } from "@/lib/parsers";

interface RouteParams {
  params: Promise<{ addressbook: string; id: string }>;
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

  const idResult = await parseIdParam(params);
  if (idResult instanceof NextResponse) return new NextResponse("Not found", { status: 404 });
  const id = idResult;

  return withErrorHandler(`GET /api/carddav/${addressbook}/${id}`, async () => {
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
  });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
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

  const idResult = await parseIdParam(params);
  if (idResult instanceof NextResponse) return new NextResponse("Not found", { status: 404 });
  const id = idResult;

  return withErrorHandler(`PUT /api/carddav/${addressbook}/${id}`, async () => {
    const body = await request.text();
    const parsed = parseVCard(entityName, body);

    // Remove non-field properties
    delete parsed.id;
    delete parsed._entity;

    await update(entityName, id, parsed);

    return new NextResponse("", { status: 204 });
  });
}
