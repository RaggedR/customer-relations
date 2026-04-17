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
import { checkAuth } from "@/lib/carddav-auth";
import { getSchema } from "@/lib/schema";
import { entityLabel } from "@/lib/schema-client";

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CardDAV"' },
    });
  }

  // Schema-driven: discover address books from entities with carddav: true.
  // Previously hardcoded to ["patients", "nurses"]. Now adding carddav: true
  // to a new entity in schema.yaml automatically exposes it here.
  const schema = getSchema();
  const addressBooks = Object.entries(schema.entities)
    .filter(([, entity]) => entity.carddav === true)
    .map(([name, entity]) => ({
      name: entity.label ?? entityLabel(name, schema),
      url: `/api/carddav/${name}s/`,
      description: `${entity.label_singular ?? name} contacts`,
    }));

  return NextResponse.json(addressBooks);
}
