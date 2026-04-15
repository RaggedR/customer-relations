/**
 * Email Service — Stub
 *
 * All email-sending functions are stubbed: they log to the console
 * in development and will be wired to a real provider (SendGrid, SES)
 * when the practice is ready for production email.
 */

import { logger } from "@/lib/logger";

interface ClaimEmailParams {
  to: string;
  claimUrl: string;
  patientName: string;
}

/**
 * Send a "set your password" email to a migrated patient claiming their account.
 * Currently a stub — logs the claim URL for manual testing.
 */
export async function sendClaimEmail({ to, claimUrl, patientName }: ClaimEmailParams): Promise<void> {
  logger.info(
    { to, claimUrl, patientName },
    "EMAIL STUB: claim email (would send in production)",
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(`\n📧 Claim email for ${patientName} <${to}>`);
    console.log(`   Set your password: ${claimUrl}\n`);
  }
}
