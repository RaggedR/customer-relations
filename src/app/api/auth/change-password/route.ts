/**
 * Change Password API
 *
 * POST /api/auth/change-password
 * Body: { currentPassword: string, newPassword: string }
 *
 * Requires a valid session (any role). Validates the new password
 * against strength rules. Clears the must_change_password flag on success.
 *
 * Rate limited: 5 attempts per minute per IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, validatePasswordStrength } from "@/lib/password";
import { getSessionUser } from "@/lib/session";
import { extractRequestContext } from "@/lib/request-context";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createRateLimiter } from "@/lib/rate-limit";

const changePwLimiter = createRateLimiter(5, 60_000);

export async function POST(request: NextRequest) {
  const ctx = extractRequestContext(request);

  // Rate limit by IP
  const rl = changePwLimiter(`ip:${ctx.ip ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)) },
      },
    );
  }

  // Require valid session
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }

    // Validate strength
    const strengthErrors = validatePasswordStrength(newPassword);
    if (strengthErrors.length > 0) {
      return NextResponse.json(
        { error: "Password does not meet strength requirements", rules: strengthErrors },
        { status: 400 },
      );
    }

    // Look up user
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      logAuditEvent({
        action: "change_password_failed",
        entity: "user",
        entityId: String(user.id),
        context: { ...ctx, userId: user.id },
      });
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    // Update password and clear the flag
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newHash,
        must_change_password: false,
      },
    });

    logAuditEvent({
      action: "change_password",
      entity: "user",
      entityId: String(user.id),
      context: { ...ctx, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error, correlationId: ctx.correlationId }, "Change password error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
