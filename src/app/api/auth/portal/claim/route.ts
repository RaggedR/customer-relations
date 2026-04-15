/**
 * Portal Account Claim
 *
 * POST /api/auth/portal/claim
 * Body: { token: string, password: string }
 *
 * Verifies a claim token (from the set-password email), creates a User
 * account linked to the existing Patient record, and logs the patient in.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { signSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { getClientIp } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, COOKIE_OPTIONS, getSecret } from "@/lib/session";

const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Verify the claim token
    const secret = new TextEncoder().encode(getSecret());
    let payload;
    try {
      const result = await jwtVerify(token, secret);
      payload = result.payload as { email?: string; purpose?: string };
    } catch {
      return NextResponse.json({ error: "Invalid or expired link. Please request a new one." }, { status: 401 });
    }

    if (payload.purpose !== "claim" || !payload.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const email = payload.email;

    // Verify the Patient record still exists
    const patient = await prisma.patient.findFirst({ where: { email } });
    if (!patient) {
      return NextResponse.json({ error: "Patient record not found" }, { status: 404 });
    }

    // Check if a User was already created (double-click protection)
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Account already exists. Please log in." }, { status: 409 });
    }

    // Create User account
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name: patient.name,
        password_hash: passwordHash,
        role: "patient",
        active: true,
      },
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
        ip: getClientIp(request) ?? null,
        user_agent: request.headers.get("user-agent") ?? null,
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
      userId: user.id,
      action: "account_claimed",
      entity: "patient",
      entityId: String(patient.id),
      ip: getClientIp(request) ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return response;
  } catch (error) {
    logger.error({ err: error }, "Portal claim error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
