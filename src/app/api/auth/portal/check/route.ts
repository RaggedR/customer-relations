/**
 * Portal Email Check
 *
 * POST /api/auth/portal/check
 * Body: { email: string }
 *
 * Determines the patient's account status and returns which auth flow to show:
 * - "login" — User account exists, show password field
 * - "claim_sent" — Patient record exists but no User, claim email sent
 * - "register" — No records, show signup form
 *
 * Note: This intentionally reveals whether an email exists in the Patient table.
 * This is acceptable because (1) it's rate-limited, (2) patients need this UX
 * to claim migrated accounts, and (3) email alone reveals no health information.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueClaim } from "@/lib/claim-token";
import { sendClaimEmail } from "@/lib/email";
import { createRateLimiter } from "@/lib/rate-limit";
import { extractRequestContext } from "@/lib/request-context";
import { logger } from "@/lib/logger";

const checkLimiter = createRateLimiter(10, 60_000); // 10 checks per minute per IP

export async function POST(request: NextRequest) {
  const ctx = extractRequestContext(request);

  const rl = checkLimiter(`ip:${ctx.ip ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)) } },
    );
  }

  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normEmail = email.toLowerCase().trim();

    // Check if a User account already exists
    const user = await prisma.user.findFirst({
      where: { email: normEmail, active: true },
    });
    if (user) {
      return NextResponse.json({ status: "login" });
    }

    // Check if a Patient record exists (migrated from old system)
    const patient = await prisma.patient.findFirst({
      where: { email: normEmail },
    });
    if (patient) {
      const token = await issueClaim(normEmail);

      const baseUrl = request.nextUrl.origin;
      const claimUrl = `${baseUrl}/portal/claim?token=${token}`;

      await sendClaimEmail({
        to: normEmail,
        claimUrl,
        patientName: patient.name,
      });

      return NextResponse.json({ status: "claim_sent" });
    }

    // No records at all — new patient
    return NextResponse.json({ status: "register" });
  } catch (error) {
    logger.error({ err: error, correlationId: ctx.correlationId }, "Portal check error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
