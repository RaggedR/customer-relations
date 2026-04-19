/**
 * Email Service — Resend Provider
 *
 * Sends transactional email via Resend when RESEND_API_KEY is configured.
 * Falls back to a console stub in development or when no key is set.
 *
 * All send functions are fire-and-forget safe — they catch errors internally
 * and never throw. Email failure must never block clinical workflows.
 */

import { logger } from "@/lib/logger";

// ── HTML escaping ───────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Shared Resend client ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Resend is an optional dep, dynamically imported
let resendClient: any = null;

async function getResend() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const { Resend } = await import("resend");
  resendClient = new Resend(apiKey);
  return resendClient;
}

function getFrom(): string {
  return process.env.EMAIL_FROM || "Customer Relations <noreply@example.com>";
}

function getPracticeName(): string {
  return process.env.PRACTICE_NAME || "the practice";
}

/** Stub logger for dev — logs to console when no Resend key is set. */
function stub(type: string, params: object): void {
  logger.info(params, `EMAIL STUB: ${type} (set RESEND_API_KEY to send real emails)`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n📧 ${type}:`, JSON.stringify(params, null, 2), "\n");
  }
}

// ── 1. Claim Email (set password) ───────────────────────

interface ClaimEmailParams {
  to: string;
  claimUrl: string;
  patientName: string;
}

export async function sendClaimEmail({ to, claimUrl, patientName }: ClaimEmailParams): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    stub("claim email", { to, claimUrl, patientName });
    return;
  }

  try {
    await resend.emails.send({
      from: getFrom(),
      to,
      subject: "Set your password — Customer Relations",
      html: `
        <p>Hi ${escapeHtml(patientName)},</p>
        <p>Your practice has invited you to set up your patient portal account.</p>
        <p><a href="${encodeURI(claimUrl)}">Click here to set your password</a></p>
        <p>This link expires in 24 hours.</p>
        <p>— ${escapeHtml(getPracticeName())}</p>
      `,
    });
    logger.info({ to }, "Claim email sent via Resend");
  } catch (err) {
    logger.error({ err, to }, "Failed to send claim email via Resend");
  }
}

// ── 2. Appointment Confirmation ─────────────────────────

interface AppointmentConfirmationParams {
  to: string;
  patientName: string;
  date: string;       // formatted date string, e.g. "Monday 21 April 2026"
  startTime: string;  // e.g. "10:00"
  specialty: string;
  location: string;
}

export async function sendAppointmentConfirmation(params: AppointmentConfirmationParams): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    stub("appointment confirmation", params);
    return;
  }

  try {
    await resend.emails.send({
      from: getFrom(),
      to: params.to,
      subject: `Appointment confirmed: ${params.specialty} on ${params.date}`,
      html: `
        <p>Hi ${escapeHtml(params.patientName)},</p>
        <p>Your appointment has been confirmed:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Date</td><td>${escapeHtml(params.date)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Time</td><td>${escapeHtml(params.startTime)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Type</td><td>${escapeHtml(params.specialty)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Location</td><td>${escapeHtml(params.location)}</td></tr>
        </table>
        <p>If you need to change or cancel this appointment, please contact ${escapeHtml(getPracticeName())}.</p>
        <p>— ${escapeHtml(getPracticeName())}</p>
      `,
    });
    logger.info({ to: params.to }, "Appointment confirmation email sent");
  } catch (err) {
    logger.error({ err, to: params.to }, "Failed to send appointment confirmation email");
  }
}

// ── 3. Appointment Cancellation (to patient) ────────────

interface CancellationToPatientParams {
  to: string;
  patientName: string;
  date: string;
  startTime: string;
  specialty: string;
  reason?: string;
  portalUrl?: string;  // link to rebook
}

export async function sendCancellationToPatient(params: CancellationToPatientParams): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    stub("cancellation to patient", params);
    return;
  }

  const portalUrl = params.portalUrl || process.env.PORTAL_URL;
  const rebookLine = portalUrl
    ? `<p><a href="${encodeURI(portalUrl)}/book">Click here to book a new appointment</a></p>`
    : `<p>Please contact ${escapeHtml(getPracticeName())} to reschedule.</p>`;

  try {
    await resend.emails.send({
      from: getFrom(),
      to: params.to,
      subject: `Appointment cancelled: ${params.specialty} on ${params.date}`,
      html: `
        <p>Hi ${escapeHtml(params.patientName)},</p>
        <p>Unfortunately, your appointment has been cancelled:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Date</td><td>${escapeHtml(params.date)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Time</td><td>${escapeHtml(params.startTime)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Type</td><td>${escapeHtml(params.specialty)}</td></tr>
          ${params.reason ? `<tr><td style="padding:4px 16px 4px 0;font-weight:bold">Reason</td><td>${escapeHtml(params.reason)}</td></tr>` : ""}
        </table>
        ${rebookLine}
        <p>We apologise for the inconvenience.</p>
        <p>— ${escapeHtml(getPracticeName())}</p>
      `,
    });
    logger.info({ to: params.to }, "Cancellation email sent to patient");
  } catch (err) {
    logger.error({ err, to: params.to }, "Failed to send cancellation email to patient");
  }
}

// ── 4. Appointment Cancellation (to admin/owner) ────────

interface CancellationToAdminParams {
  nurseName: string;
  patientName: string;
  date: string;
  startTime: string;
  specialty: string;
  reason?: string;
  appointmentId: number;
}

export async function sendCancellationToAdmin(params: CancellationToAdminParams): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    stub("cancellation to admin (ADMIN_EMAIL not set)", params);
    return;
  }

  const resend = await getResend();
  if (!resend) {
    stub("cancellation to admin", { ...params, to: adminEmail });
    return;
  }

  try {
    await resend.emails.send({
      from: getFrom(),
      to: adminEmail,
      subject: `Appointment #${params.appointmentId} cancelled by ${params.nurseName}`,
      html: `
        <p>${escapeHtml(params.nurseName)} has cancelled an appointment:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Appointment</td><td>#${params.appointmentId}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Patient</td><td>${escapeHtml(params.patientName)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Date</td><td>${escapeHtml(params.date)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Time</td><td>${escapeHtml(params.startTime)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Type</td><td>${escapeHtml(params.specialty)}</td></tr>
          ${params.reason ? `<tr><td style="padding:4px 16px 4px 0;font-weight:bold">Reason</td><td>${escapeHtml(params.reason)}</td></tr>` : ""}
        </table>
        <p>The patient has been emailed to reschedule.</p>
      `,
    });
    logger.info({ to: adminEmail }, "Cancellation notification sent to admin");
  } catch (err) {
    logger.error({ err, to: adminEmail }, "Failed to send cancellation notification to admin");
  }
}

// ── 5. Appointment Reminder ─────────────────────────────

interface ReminderParams {
  to: string;
  patientName: string;
  date: string;
  startTime: string;
  specialty: string;
  location: string;
}

export async function sendAppointmentReminder(params: ReminderParams): Promise<void> {
  const resend = await getResend();
  if (!resend) {
    stub("appointment reminder", params);
    return;
  }

  try {
    await resend.emails.send({
      from: getFrom(),
      to: params.to,
      subject: `Reminder: ${params.specialty} appointment on ${params.date}`,
      html: `
        <p>Hi ${escapeHtml(params.patientName)},</p>
        <p>This is a reminder about your upcoming appointment:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Date</td><td>${escapeHtml(params.date)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Time</td><td>${escapeHtml(params.startTime)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Type</td><td>${escapeHtml(params.specialty)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:bold">Location</td><td>${escapeHtml(params.location)}</td></tr>
        </table>
        <p>If you need to change or cancel, please contact ${escapeHtml(getPracticeName())}.</p>
        <p>— ${escapeHtml(getPracticeName())}</p>
      `,
    });
    logger.info({ to: params.to }, "Appointment reminder email sent");
  } catch (err) {
    logger.error({ err, to: params.to }, "Failed to send appointment reminder email");
  }
}
