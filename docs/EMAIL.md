# Email Strategy

All transactional emails are sent via [Resend](https://resend.com). When
`RESEND_API_KEY` is not configured, every email function logs to the console
as a stub — no emails are silently dropped. Email failures never block user
requests; all sends are fire-and-forget with error logging via pino.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes (for real emails) | Resend API key. Without this, all emails are console stubs. |
| `EMAIL_FROM` | No | Sender address (default: `Customer Relations <noreply@example.com>`) |
| `PRACTICE_NAME` | No | Practice name used in email body/subject (default: `the practice`) |
| `ADMIN_EMAIL` | Yes (for admin notifications) | Clare's email — receives cancellation alerts and weekly reports |
| `ALERT_EMAIL` | Yes (for security alerts) | Recipient for suspicious activity alerts (can be same as `ADMIN_EMAIL`) |
| `PORTAL_URL` | No | Base URL for patient portal links in emails (default: none) |

## Emails Sent by the Application

### 1. Account Claim — "Set Your Password"

| | |
|---|---|
| **Trigger** | Admin generates a portal invite for a patient |
| **Recipient** | Patient |
| **Route** | `POST /api/auth/portal/check` |
| **Function** | `sendClaimEmail()` in `src/lib/email.ts` |
| **Content** | Link to set password (expires in 24 hours) |
| **Status** | Implemented |

### 2. Appointment Confirmation

| | |
|---|---|
| **Trigger** | Admin creates an appointment OR patient books via portal |
| **Recipient** | Patient |
| **Routes** | `POST /api/appointment`, `POST /api/portal/appointments` |
| **Function** | `sendAppointmentConfirmation()` in `src/lib/email.ts` |
| **Content** | Date, time, type, location |
| **Status** | Implemented |

### 3. Appointment Cancellation — Patient Notification

| | |
|---|---|
| **Trigger** | Nurse cancels an appointment |
| **Recipient** | Patient |
| **Route** | `POST /api/nurse/appointments/[id]/cancel` |
| **Function** | `sendCancellationToPatient()` in `src/lib/email.ts` |
| **Content** | Cancelled appointment details, cancellation reason, link to rebook |
| **Status** | Implemented |

### 4. Appointment Cancellation — Admin Notification

| | |
|---|---|
| **Trigger** | Nurse cancels an appointment |
| **Recipient** | Admin (Clare) via `ADMIN_EMAIL` |
| **Route** | `POST /api/nurse/appointments/[id]/cancel` |
| **Function** | `sendCancellationToAdmin()` in `src/lib/email.ts` |
| **Content** | Which nurse cancelled, which patient, appointment details, reason |
| **Status** | Implemented (requires `ADMIN_EMAIL` env var) |

## Emails Sent by Cron Jobs

### 5. Appointment Reminders

| | |
|---|---|
| **Schedule** | Daily (recommended: 6pm, the day before) |
| **Recipient** | Patients with appointments tomorrow |
| **Script** | `scripts/appointment-reminders.ts` |
| **Function** | `sendAppointmentReminder()` in `src/lib/email.ts` |
| **Content** | Date, time, type, location |
| **Crontab** | `0 18 * * * cd /path/to/app && npx tsx scripts/appointment-reminders.ts` |
| **Status** | Implemented |

### 6. Suspicious Activity Alerts

| | |
|---|---|
| **Schedule** | Every 10 minutes |
| **Recipient** | Admin via `ALERT_EMAIL` |
| **Script** | `scripts/audit-alerts.ts` |
| **Content** | Brute-force attempts, role escalation, CardDAV auth failures, data exports |
| **Crontab** | `*/10 * * * * cd /path/to/app && npx tsx scripts/audit-alerts.ts` |
| **Status** | Implemented |

See [LOGGING.md](LOGGING.md) for full alert rule documentation.

### 7. Weekly Access Report

| | |
|---|---|
| **Schedule** | Weekly (recommended: Monday 7am) |
| **Recipient** | Admin via `ADMIN_EMAIL` |
| **Script** | `scripts/weekly-access-report.ts` |
| **Content** | Who accessed which patient records, suspicious activity summary, data exports. Sent even when there is no suspicious activity ("no suspicious activity detected"). |
| **Crontab** | `0 7 * * 1 cd /path/to/app && npx tsx scripts/weekly-access-report.ts` |
| **Status** | Implemented |

## Planned (Not Yet Implemented)

| Email | Trigger | Recipient | Notes |
|-------|---------|-----------|-------|
| SMS appointment reminders | Day before + 2 hours before | Patient (SMS) | Requires SMS provider (Twilio/MessageBird). Design doc mentions two-way SMS for confirm/cancel. |
| Breach notification | Data breach detected | All affected patients | Required by APP 11. Manual trigger — no automated detection. |
| Password reset | Patient requests reset | Patient | Currently no self-service reset — must contact practice. |

## Architecture

```
src/lib/email.ts          — All email functions (shared Resend client, stub fallback)
scripts/audit-alerts.ts   — Cron: suspicious activity detection + alert email
scripts/appointment-reminders.ts — Cron: daily appointment reminders
scripts/weekly-access-report.ts  — Cron: weekly access summary report
```

All application emails flow through `src/lib/email.ts` which provides:
- Shared Resend client (lazy-initialised, singleton)
- Console stub mode when `RESEND_API_KEY` is not set
- Consistent sender address via `getFrom()`
- Practice name via `getPracticeName()`
- Error logging via pino (never throws)

Cron scripts manage their own Resend clients because they run outside the
Next.js process and import Prisma directly.

## Crontab Summary

```crontab
# Appointment reminders — daily at 6pm
0 18 * * * cd /path/to/customer-relations && npx tsx scripts/appointment-reminders.ts

# Audit alerts — every 10 minutes
*/10 * * * * cd /path/to/customer-relations && npx tsx scripts/audit-alerts.ts

# Weekly access report — Monday 7am
0 7 * * 1 cd /path/to/customer-relations && npx tsx scripts/weekly-access-report.ts
```
