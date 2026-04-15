/**
 * Portal Account Claim
 *
 * POST /api/auth/portal/claim
 * Body: { token: string, password: string }
 *
 * Verifies a claim token (from the set-password email), creates a User
 * account linked to the existing Patient record, and logs the patient in.
 *
 * Claim tokens are DB-backed, single-use, and hash-only (raw token never
 * stored). They expire after 24 hours and are consumed atomically to
 * prevent replay attacks.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeClaim } from "@/lib/claim-token";
import { signSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { extractRequestContext } from "@/lib/request-context";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, COOKIE_OPTIONS, SESSION_MAX_AGE, getSecret } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";

const claimLimiter = createRateLimiter(5, 60_000); // 5 attempts per minute per IP

export async function POST(request: NextRequest) {
  const ctx = extractRequestContext(request);

  const rl = claimLimiter(`ip:${ctx.ip ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)) } },
    );
  }

  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Verify and consume the claim token (single-use, DB-backed)
    const result = await consumeClaim(token);
    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired link. Please request a new one." },
        { status: 401 },
      );
    }

    const email = result.email;
    const passwordHash = await hashPassword(password);

    // Atomic check-and-create: prevents TOCTOU race where two concurrent
    // requests both pass the existingUser check and create duplicate users.
    const user = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({ where: { email } });
      if (!patient) {
        throw new Error("PATIENT_NOT_FOUND");
      }

      const existingUser = await tx.user.findFirst({ where: { email } });
      if (existingUser) {
        throw new Error("ACCOUNT_EXISTS");
      }

      return tx.user.create({
        data: {
          email,
          name: patient.name,
          password_hash: passwordHash,
          role: "patient",
          active: true,
        },
      });
    });

    // Sign session
    const sessionToken = await signSession(
      { userId: String(user.id), role: "patient" },
      getSecret(),
      `${SESSION_MAX_AGE}s`,
    );

    await prisma.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        last_active: new Date(),
        expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000),
        ip: ctx.ip ?? null,
        user_agent: ctx.userAgent ?? null,
      },
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, role: "patient" },
    });

    response.cookies.set(COOKIE_NAME, sessionToken, {
      ...COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE,
    });

    logAuditEvent({
      action: "account_claimed",
      entity: "patient",
      entityId: email,
      context: { ...ctx, userId: user.id },
    });

    return response;
  } catch (error) {
    const message = (error as Error).message;
    if (message === "PATIENT_NOT_FOUND") {
      return NextResponse.json({ error: "Patient record not found" }, { status: 404 });
    }
    if (message === "ACCOUNT_EXISTS") {
      return NextResponse.json({ error: "Account already exists. Please log in." }, { status: 409 });
    }
    logger.error({ err: error, correlationId: ctx.correlationId }, "Portal claim error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
