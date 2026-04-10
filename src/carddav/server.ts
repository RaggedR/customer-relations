/**
 * Minimal CardDAV Server
 *
 * Handles the CardDAV protocol methods:
 * - PROPFIND: Discovery and listing
 * - REPORT: Query contacts
 * - GET: Fetch a single vCard
 * - PUT: Create/update a contact via vCard
 * - DELETE: Remove a contact
 *
 * This runs as Next.js API route handlers.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSchema } from "@/engine/schema-loader";
import { entityToVCard, vCardToEntity } from "./vcard-adapter";

const DAV_NAMESPACE = "DAV:";
const CARDDAV_NAMESPACE = "urn:ietf:params:xml:ns:carddav";

/**
 * Find the CardDAV-enabled entity from schema.
 */
function getCardDAVEntity() {
  const schema = getSchema();
  for (const [entityName, entity] of Object.entries(schema.entities)) {
    if (entity.carddav?.enabled) {
      return { entityName, entity };
    }
  }
  return null;
}

/**
 * Get the Prisma delegate for the CardDAV entity.
 */
function getDelegate(entityName: string) {
  const key = entityName.charAt(0).toLowerCase() +
    entityName.split(/[_\-\s]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("").slice(1);
  return (prisma as unknown as Record<string, unknown>)[key] as Record<string, Function>;
}

/**
 * Handle PROPFIND — used for discovery and listing.
 */
export async function handlePropfind(
  request: NextRequest,
  path: string
): Promise<NextResponse> {
  const carddav = getCardDAVEntity();
  if (!carddav) {
    return new NextResponse("CardDAV not configured", { status: 404 });
  }

  const { entityName } = carddav;
  const delegate = getDelegate(entityName);

  // Root or address book level
  if (path === "/" || path === "" || path === "/addressbook/") {
    const items = await delegate.findMany({}) as Record<string, unknown>[];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${DAV_NAMESPACE}" xmlns:C="${CARDDAV_NAMESPACE}">
  <D:response>
    <D:href>/api/carddav/addressbook/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>
          <D:collection/>
          <C:addressbook/>
        </D:resourcetype>
        <D:displayname>CRM Contacts</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;

    for (const item of items) {
      const id = item.id as number;
      xml += `
  <D:response>
    <D:href>/api/carddav/addressbook/${id}.vcf</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"${item.updatedAt || item.createdAt}"</D:getetag>
        <D:getcontenttype>text/vcard</D:getcontenttype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
    }

    xml += "\n</D:multistatus>";

    return new NextResponse(xml, {
      status: 207,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        DAV: "1, 2, 3, addressbook",
      },
    });
  }

  // Individual contact
  const match = path.match(/\/(\d+)\.vcf$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const item = await delegate.findUnique({ where: { id }, include: { company: true } }) as Record<string, unknown> | null;
    if (!item) {
      return new NextResponse("Not found", { status: 404 });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${DAV_NAMESPACE}">
  <D:response>
    <D:href>/api/carddav/addressbook/${id}.vcf</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"${item.updatedAt || item.createdAt}"</D:getetag>
        <D:getcontenttype>text/vcard</D:getcontenttype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    return new NextResponse(xml, {
      status: 207,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}

/**
 * Handle GET — return a single vCard.
 */
export async function handleGet(path: string): Promise<NextResponse> {
  const carddav = getCardDAVEntity();
  if (!carddav) {
    return new NextResponse("CardDAV not configured", { status: 404 });
  }

  const match = path.match(/\/(\d+)\.vcf$/);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }

  const id = parseInt(match[1], 10);
  const delegate = getDelegate(carddav.entityName);
  const item = await delegate.findUnique({ where: { id }, include: { company: true } }) as Record<string, unknown> | null;

  if (!item) {
    return new NextResponse("Not found", { status: 404 });
  }

  const vcard = entityToVCard(item, carddav.entity.carddav!.mapping);

  return new NextResponse(vcard, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      ETag: `"${item.updatedAt || item.createdAt}"`,
    },
  });
}

/**
 * Handle PUT — create or update a contact from a vCard.
 */
export async function handlePut(
  request: NextRequest,
  path: string
): Promise<NextResponse> {
  const carddav = getCardDAVEntity();
  if (!carddav) {
    return new NextResponse("CardDAV not configured", { status: 404 });
  }

  const body = await request.text();
  const { data } = vCardToEntity(body, carddav.entity.carddav!.mapping);
  const delegate = getDelegate(carddav.entityName);

  // Check if updating existing
  const match = path.match(/\/(\d+)\.vcf$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const updated = await delegate.update({ where: { id }, data }) as Record<string, unknown>;
    return new NextResponse(null, {
      status: 204,
      headers: { ETag: `"${updated.updatedAt}"` },
    });
  }

  // Create new
  const created = await delegate.create({ data }) as Record<string, unknown>;
  return new NextResponse(null, {
    status: 201,
    headers: {
      Location: `/api/carddav/addressbook/${created.id}.vcf`,
      ETag: `"${created.updatedAt || created.createdAt}"`,
    },
  });
}

/**
 * Handle DELETE — remove a contact.
 */
export async function handleDelete(path: string): Promise<NextResponse> {
  const carddav = getCardDAVEntity();
  if (!carddav) {
    return new NextResponse("CardDAV not configured", { status: 404 });
  }

  const match = path.match(/\/(\d+)\.vcf$/);
  if (!match) {
    return new NextResponse("Not found", { status: 404 });
  }

  const id = parseInt(match[1], 10);
  const delegate = getDelegate(carddav.entityName);
  await delegate.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}

/**
 * Handle OPTIONS — advertise DAV capabilities.
 */
export function handleOptions(): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT",
      DAV: "1, 2, 3, addressbook",
    },
  });
}
