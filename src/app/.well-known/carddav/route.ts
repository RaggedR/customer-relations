/**
 * CardDAV Well-Known URL
 *
 * RFC 6764: Clients discover CardDAV by requesting /.well-known/carddav
 * We redirect to our actual CardDAV endpoint.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect(new URL("/api/carddav/addressbook/", "http://localhost:3000"), 301);
}

export async function PROPFIND() {
  return NextResponse.redirect(new URL("/api/carddav/addressbook/", "http://localhost:3000"), 301);
}
