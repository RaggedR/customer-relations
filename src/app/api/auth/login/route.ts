/**
 * Login API
 *
 * POST /api/auth/login
 * Body: { email: string, password: string }
 *
 * Authenticates the user, sets a session cookie, and returns user info.
 * Returns a generic 401 on failure — does not reveal whether the email exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSession, type Role } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { extractRequestContext } from "@/lib/request-context";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { COOKIE_NAME, COOKIE_OPTIONS, SESSION_MAX_AGE, getSecret, hashSessionToken } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
const loginLimiter = createRateLimiter(5, 60_000); // 5 attempts per minute

export async function POST(request: NextRequest) {
  // Extract request context — used for rate limiting, audit logging, and session creation
  const ctx = extractRequestContext(request);

  // Rate limit by IP (no session exists yet at login)
  const rl = loginLimiter(`ip:${ctx.ip ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)),
        },
      },
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    // Look up active user by email
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), active: true },
    });

    if (!user) {
      // Audit: log failed login — unknown email (fire-and-forget)
      logAuditEvent({
        action: "login_failed",
        entity: "user",
        entityId: email.toLowerCase().trim(),
        context: ctx,
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      // Audit: log failed login — wrong password (fire-and-forget)
      logAuditEvent({
        action: "login_failed",
        entity: "user",
        entityId: String(user.id),
        context: { ...ctx, userId: user.id },
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Sign JWT with numeric DB id stored as string
    const token = await signSession(
      { userId: String(user.id), role: user.role as Role },
      getSecret(),
      `${SESSION_MAX_AGE}s`,
    );

    // Create DB session record (activates idle timeout + session revocation).
    // Only the SHA-256 hash is stored — a DB dump cannot yield replayable JWTs.
    await prisma.session.create({
      data: {
        token: hashSessionToken(token),
        userId: user.id,
        last_active: new Date(),
        expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000),
        ip: ctx.ip ?? null,
        user_agent: ctx.userAgent ?? null,
      },
    });

    // Build response with session cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        mustChangePassword: !!user.must_change_password,
      },
    });

    response.cookies.set(COOKIE_NAME, token, {
      ...COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE,
    });

    // Audit: log successful login (fire-and-forget)
    logAuditEvent({
      action: "login",
      entity: "user",
      entityId: String(user.id),
      context: { ...ctx, userId: user.id },
    });

    return response;
  } catch (error) {
    logger.error({ err: error, correlationId: ctx.correlationId }, "Login error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
