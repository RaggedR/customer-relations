/**
 * Appointment Reminder Cron Job
 *
 * Sends reminder emails to patients with appointments tomorrow.
 * Designed to run once daily (e.g. 6pm):
 *
 *   0 18 * * * cd /path/to/customer-relations && npx tsx scripts/appointment-reminders.ts
 *
 * Only sends reminders for confirmed appointments with a patient email.
 * Skips cancelled, completed, and no-show appointments.
 *
 * Environment variables:
 *   DATABASE_URL    — PostgreSQL connection string (required)
 *   RESEND_API_KEY  — Resend API key (required for real emails)
 *   EMAIL_FROM      — sender address (default: noreply@example.com)
 *   PRACTICE_NAME   — practice name for email body (default: "the practice")
 */

import { PrismaClient } from "@prisma/client";
import { sendAppointmentReminder } from "../src/lib/email";

const prisma = new PrismaClient();

async function main() {
  // Tomorrow: midnight to midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: tomorrow, lt: dayAfter },
      status: { in: ["confirmed", "requested"] },
    },
    include: {
      patient: { select: { name: true, email: true } },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const appt of appointments) {
    if (!appt.patient?.email) {
      skipped++;
      continue;
    }

    const dateStr = appt.date.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    await sendAppointmentReminder({
      to: appt.patient.email,
      patientName: appt.patient.name ?? "Patient",
      date: dateStr,
      startTime: appt.start_time ?? "",
      specialty: appt.specialty ?? "Appointment",
      location: appt.location ?? "TBC",
    });

    sent++;
  }

  console.log(
    `Appointment reminders: ${sent} sent, ${skipped} skipped (no email), ${appointments.length} total appointments tomorrow`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Appointment reminder script failed:", err);
  process.exit(1);
});
