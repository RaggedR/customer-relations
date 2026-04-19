/**
 * Weekly Access Report
 *
 * Sends a summary email to the practice owner listing who accessed
 * which patient records over the past 7 days. Sends even when there
 * is no suspicious activity — a "no news" email is reassurance, not noise.
 *
 * Schedule: weekly (e.g. Monday 7am):
 *   0 7 * * 1 cd /path/to/customer-relations && npx tsx scripts/weekly-access-report.ts
 *
 * Environment variables:
 *   DATABASE_URL    — PostgreSQL connection string (required)
 *   ADMIN_EMAIL     — recipient address (required, or script exits silently)
 *   RESEND_API_KEY  — Resend API key (required for real emails)
 *   EMAIL_FROM      — sender address (default: noreply@example.com)
 *   PRACTICE_NAME   — practice name for email subject/body
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const PRACTICE_NAME = process.env.PRACTICE_NAME || "Customer Relations";

interface AccessEntry {
  userName: string;
  role: string;
  entity: string;
  patientId: string;
  count: number;
}

interface AlertSummary {
  action: string;
  count: number;
}

async function generateReport() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  // ── Patient record access by user ───────────────────────
  const patientAccess = await prisma.auditLog.findMany({
    where: {
      timestamp: { gte: since },
      entity: { in: ["patient", "clinical_note", "personal_note"] },
      action: { in: ["view", "view_list", "create"] },
    },
    select: {
      userId: true,
      entity: true,
      entity_id: true,
      action: true,
    },
  });

  // Look up user names
  const userIds = [...new Set(patientAccess.map((e) => e.userId).filter((id): id is number => id !== null))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Aggregate: user → entity → patient → count
  const accessMap = new Map<string, AccessEntry>();
  for (const event of patientAccess) {
    const user = event.userId ? userMap.get(event.userId) : null;
    const key = `${event.userId}:${event.entity}:${event.entity_id}`;
    const existing = accessMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      accessMap.set(key, {
        userName: user?.name ?? `User #${event.userId ?? "unknown"}`,
        role: user?.role ?? "unknown",
        entity: event.entity,
        patientId: event.entity_id,
        count: 1,
      });
    }
  }

  // Sort by user, then entity, then patient
  const accessEntries = [...accessMap.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName) || a.entity.localeCompare(b.entity) || a.patientId.localeCompare(b.patientId),
  );

  // ── Suspicious activity summary ─────────────────────────
  const suspiciousActions = ["access_denied", "login_failed", "carddav_auth_failed"];
  const suspicious = await prisma.auditLog.groupBy({
    by: ["action"],
    where: {
      timestamp: { gte: since },
      action: { in: suspiciousActions },
    },
    _count: { id: true },
  });

  const alerts: AlertSummary[] = suspicious.map((s) => ({
    action: s.action,
    count: s._count.id,
  }));

  // ── Data export/disclosure events ───────────────────────
  const exports = await prisma.auditLog.findMany({
    where: {
      timestamp: { gte: since },
      action: { in: ["export", "ai_external_disclosure"] },
    },
    select: { userId: true, action: true, entity: true, details: true, timestamp: true },
  });

  return { accessEntries, alerts, exports, since };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

async function sendReport() {
  if (!ADMIN_EMAIL) {
    console.warn("ADMIN_EMAIL not set — weekly access reporting disabled");
    process.exit(0);
  }

  const { accessEntries, alerts, exports, since } = await generateReport();

  const noSuspicious = alerts.length === 0;
  const periodStr = `${formatDate(since)} — ${formatDate(new Date())}`;

  // ── Build HTML ──────────────────────────────────────────

  let html = `<h2>Weekly Access Report — ${PRACTICE_NAME}</h2>`;
  html += `<p style="color:#6b7280">Period: ${periodStr}</p>`;

  // Suspicious activity section
  if (noSuspicious) {
    html += `<div style="padding:12px;background:#f0fdf4;border-left:4px solid #22c55e;margin:16px 0">`;
    html += `<strong>No suspicious activity detected.</strong>`;
    html += `</div>`;
  } else {
    html += `<div style="padding:12px;background:#fef2f2;border-left:4px solid #dc2626;margin:16px 0">`;
    html += `<strong>Suspicious activity detected:</strong><ul>`;
    for (const a of alerts) {
      const label = a.action === "access_denied" ? "Unauthorised access attempts"
        : a.action === "login_failed" ? "Failed login attempts"
        : "Failed CardDAV auth attempts";
      html += `<li>${label}: <strong>${a.count}</strong></li>`;
    }
    html += `</ul></div>`;
  }

  // Patient record access table
  if (accessEntries.length === 0) {
    html += `<p>No patient record access events this week.</p>`;
  } else {
    html += `<h3>Patient Record Access</h3>`;
    html += `<table style="border-collapse:collapse;width:100%">`;
    html += `<tr style="background:#f3f4f6">`;
    html += `<th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db">User</th>`;
    html += `<th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db">Role</th>`;
    html += `<th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db">Record Type</th>`;
    html += `<th style="padding:8px;text-align:left;border-bottom:2px solid #d1d5db">Patient</th>`;
    html += `<th style="padding:8px;text-align:right;border-bottom:2px solid #d1d5db">Views</th>`;
    html += `</tr>`;
    for (const entry of accessEntries) {
      html += `<tr>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${entry.userName}</td>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${entry.role}</td>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${entry.entity}</td>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">#${entry.patientId}</td>`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${entry.count}</td>`;
      html += `</tr>`;
    }
    html += `</table>`;
  }

  // Data export events
  if (exports.length > 0) {
    html += `<h3>Data Exports &amp; External Disclosures</h3>`;
    html += `<ul>`;
    for (const exp of exports) {
      html += `<li>${formatDate(exp.timestamp)}: ${exp.action} — ${exp.details ?? exp.entity} (User #${exp.userId ?? "unknown"})</li>`;
    }
    html += `</ul>`;
  }

  html += `<hr><p style="color:#6b7280;font-size:12px">This report is generated automatically by the weekly access report cron job.</p>`;

  // ── Send ────────────────────────────────────────────────

  const subject = noSuspicious
    ? `Weekly Access Report — No suspicious activity — ${PRACTICE_NAME}`
    : `[ALERT] Weekly Access Report — Suspicious activity detected — ${PRACTICE_NAME}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`\n--- WEEKLY ACCESS REPORT (stub mode) ---`);
    console.log(`To: ${ADMIN_EMAIL}`);
    console.log(`Subject: ${subject}`);
    console.log(`Access entries: ${accessEntries.length}`);
    console.log(`Suspicious events: ${alerts.length === 0 ? "none" : alerts.map((a) => `${a.action}: ${a.count}`).join(", ")}`);
    console.log(`Data exports: ${exports.length}`);
    console.log(`---\n`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Customer Relations <noreply@example.com>",
    to: ADMIN_EMAIL,
    subject,
    html,
  });

  console.log(`Weekly access report sent to ${ADMIN_EMAIL}`);
}

sendReport()
  .catch((err) => {
    console.error("Weekly access report failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
