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
import { logAuditEvent } from "@/lib/audit";
import { COOKIE_NAME, COOKIE_OPTIONS } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";

const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours in seconds
const loginLimiter = createRateLimiter(5, 60_000); // 5 attempts per minute

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return secret;
}

export async function POST(request: NextRequest) {
  // Rate limit by IP (no session exists yet at login)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const rl = loginLimiter(`ip:${ip}`);
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
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
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

    // Build response with session cookie
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, role: user.role },
    });

    response.cookies.set(COOKIE_NAME, token, {
      ...COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE,
    });

    // Audit: log successful login (fire-and-forget)
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;
    logAuditEvent({
      userId: user.id,
      action: "login",
      entity: "user",
      entityId: String(user.id),
      ip,
      userAgent,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
