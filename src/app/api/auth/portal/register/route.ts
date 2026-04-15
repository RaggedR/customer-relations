/**
 * Portal Patient Registration
 *
 * POST /api/auth/portal/register
 * Body: { email, password, name, phone?, dateOfBirth?, address? }
 *
 * Creates both a Patient record and a User account for a genuinely new patient
 * (not migrated from the old system). Logs the patient in immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { extractRequestContext } from "@/lib/request-context";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, COOKIE_OPTIONS, SESSION_MAX_AGE, getSecret } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
const registerLimiter = createRateLimiter(3, 60_000); // 3 registrations per minute per IP

export async function POST(request: NextRequest) {
  const ctx = extractRequestContext(request);

  const rl = registerLimiter(`ip:${ctx.ip ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)) } },
    );
  }

  try {
    const { email, password, name, phone, dateOfBirth, address, privacy_acknowledged } = await request.json();

    if (privacy_acknowledged !== true) {
      return NextResponse.json(
        { error: "You must acknowledge the privacy notice to register" },
        { status: 400 },
      );
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate dateOfBirth if provided
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime()) || dob > new Date()) {
        return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
      }
    }

    const normEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);

    // Atomic check-and-create: prevents TOCTOU race where two concurrent
    // registrations both pass the existence checks and create duplicates.
    const { patient, user } = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({ where: { email: normEmail } });
      if (existingUser) {
        throw new Error("USER_EXISTS");
      }

      const existingPatient = await tx.patient.findFirst({ where: { email: normEmail } });
      if (existingPatient) {
        throw new Error("PATIENT_EXISTS");
      }

      const patient = await tx.patient.create({
        data: {
          name: name.trim(),
          email: normEmail,
          phone: phone || null,
          date_of_birth: dateOfBirth ? new Date(dateOfBirth) : null,
          address: address || null,
          status: "active",
        },
      });

      const user = await tx.user.create({
        data: {
          email: normEmail,
          name: name.trim(),
          password_hash: passwordHash,
          role: "patient",
          active: true,
        },
      });

      return { patient, user };
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
      action: "patient_registered",
      entity: "patient",
      entityId: String(patient.id),
      context: { ...ctx, userId: user.id },
    });

    return response;
  } catch (error) {
    const message = (error as Error).message;
    if (message === "USER_EXISTS") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    if (message === "PATIENT_EXISTS") {
      return NextResponse.json(
        { error: "A patient record with this email already exists. Please use the login page to claim your account." },
        { status: 409 },
      );
    }
    logger.error({ err: error, correlationId: ctx.correlationId }, "Portal registration error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
