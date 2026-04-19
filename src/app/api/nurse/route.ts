/**
 * Nurse CRUD API — List & Create
 *
 * This explicit route is needed because the static `nurse/` directory
 * shadows the dynamic `[entity]/` catch-all in Next.js App Router.
 *
 * GET delegates to the route factory for standard list behaviour.
 * POST is custom: it creates both a Nurse record AND a linked User
 * account with a generated strong password for nurse onboarding.
 */

import { NextResponse } from "next/server";
import { makeListCreateHandlers } from "@/lib/route-factory";
import { prisma } from "@/lib/prisma";
import { validateEntity } from "@/lib/repository";
import { hashPassword, generateStrongPassword } from "@/lib/password";
import { adminRoute } from "@/lib/middleware";

// GET uses the standard factory
const factory = makeListCreateHandlers("nurse");
export const GET = factory.GET;

// POST: custom handler that auto-creates a User account
export const POST = adminRoute()
  .named("POST /api/nurse (with user creation)")
  .handle(async (ctx) => {
    const body = await ctx.request.json();
    const errors = validateEntity("nurse", body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const email = (body.email as string | undefined)?.toLowerCase().trim();

    // Destructure only expected Nurse schema fields — never spread raw body into Prisma
    const {
      name,
      phone,
      registration_number,
      caldav_url,
      google_calendar_id,
      feed_token,
      notes,
      aup_acknowledged_at,
    } = body as Record<string, unknown>;

    // If no email, create nurse without a user account
    if (!email) {
      const nurse = await prisma.nurse.create({
        data: {
          name: name as string,
          phone: phone as string | undefined,
          email: undefined,
          registration_number: registration_number as string | undefined,
          caldav_url: caldav_url as string | undefined,
          google_calendar_id: google_calendar_id as string | undefined,
          feed_token: feed_token as string | undefined,
          notes: notes as string | undefined,
          aup_acknowledged_at: aup_acknowledged_at ? new Date(aup_acknowledged_at as string) : undefined,
        },
      });
      ctx.audit({ action: "create", entity: "nurse", entityId: String(nurse.id) });
      return NextResponse.json(nurse, { status: 201 });
    }

    // Check for existing user with this email
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: `A user account with email ${email} already exists` },
        { status: 409 },
      );
    }

    // Check for existing nurse with this email
    const existingNurse = await prisma.nurse.findFirst({ where: { email } });
    if (existingNurse) {
      return NextResponse.json(
        { error: `A nurse with email ${email} already exists` },
        { status: 409 },
      );
    }

    // Generate a strong password and create both records atomically
    const plainPassword = generateStrongPassword();
    const passwordHash = await hashPassword(plainPassword);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: body.name as string,
          password_hash: passwordHash,
          role: "nurse",
          active: true,
          must_change_password: true,
        },
      });

      const nurse = await tx.nurse.create({
        data: {
          name: name as string,
          phone: phone as string | undefined,
          email,
          registration_number: registration_number as string | undefined,
          caldav_url: caldav_url as string | undefined,
          google_calendar_id: google_calendar_id as string | undefined,
          feed_token: feed_token as string | undefined,
          notes: notes as string | undefined,
          aup_acknowledged_at: aup_acknowledged_at ? new Date(aup_acknowledged_at as string) : undefined,
          userId: user.id,
        },
      });

      return { nurse, userId: user.id };
    });

    ctx.audit({ action: "create", entity: "nurse", entityId: String(result.nurse.id) });
    ctx.audit({ action: "create", entity: "user", entityId: String(result.userId) });

    // Return nurse record + ephemeral password (displayed once by admin UI)
    return NextResponse.json(
      { ...result.nurse, _generatedPassword: plainPassword },
      { status: 201 },
    );
  });
