/**
 * Email Service — Resend Provider
 *
 * Sends transactional email via Resend when RESEND_API_KEY is configured.
 * Falls back to a console stub in development or when no key is set.
 */

import { logger } from "@/lib/logger";

interface ClaimEmailParams {
  to: string;
  claimUrl: string;
  patientName: string;
}

let resendClient: { emails: { send: (params: unknown) => Promise<unknown> } } | null = null;

async function getResend() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const { Resend } = await import("resend");
  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Send a "set your password" email to a migrated patient claiming their account.
 *
 * Uses Resend when RESEND_API_KEY is configured. Otherwise logs the claim URL
 * to the console for manual testing.
 */
export async function sendClaimEmail({ to, claimUrl, patientName }: ClaimEmailParams): Promise<void> {
  const resend = await getResend();

  if (!resend) {
    // Stub mode — no API key configured
    logger.info(
      { to, claimUrl, patientName },
      "EMAIL STUB: claim email (set RESEND_API_KEY to send real emails)",
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(`\n📧 Claim email for ${patientName} <${to}>`);
      console.log(`   Set your password: ${claimUrl}\n`);
    }
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Customer Relations <noreply@example.com>",
      to,
      subject: "Set your password — Customer Relations",
      html: `
        <p>Hi ${patientName},</p>
        <p>Your practice has invited you to set up your patient portal account.</p>
        <p><a href="${claimUrl}">Click here to set your password</a></p>
        <p>This link expires in 24 hours.</p>
        <p>— Customer Relations</p>
      `,
    });
    logger.info({ to }, "Claim email sent via Resend");
  } catch (err) {
    logger.error({ err, to }, "Failed to send claim email via Resend");
    // Don't throw — email failure shouldn't block the claim flow
  }
}
