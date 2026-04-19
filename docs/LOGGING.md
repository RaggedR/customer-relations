# Audit Logging Strategy

This document describes the audit logging architecture for compliance auditors
reviewing the system under the Australian Privacy Act 1988 and Australian
Privacy Principles (APPs), particularly APP 11 (security of personal
information) and APP 12 (access to personal information).

## Storage

All audit events are written to the `AuditLog` table in PostgreSQL via Prisma.
There is no secondary log sink (no file-based logs, no external SIEM).

**Schema:**

| Column       | Type     | Description                              |
|--------------|----------|------------------------------------------|
| `id`         | int      | Auto-increment primary key               |
| `timestamp`  | datetime | When the event occurred                  |
| `action`     | string   | Event type (see table below)             |
| `entity`     | string   | Which data type was accessed/modified    |
| `entity_id`  | string   | Which specific record                    |
| `details`    | string?  | Human-readable context                   |
| `userId`     | int?     | The authenticated user (null for CardDAV/unauthenticated) |
| `ip`         | string?  | Client IP address                        |
| `user_agent` | string?  | Client user-agent header                 |

**Indexes:** `timestamp`, `userId`, `(entity, entity_id)`.

**Immutability:** The audit module (`src/lib/audit.ts`) exports only a `logAuditEvent()` write function. There are no update or delete exports. The `AuditLog` model is not exposed through any API route (it is marked `sensitive: true` in the schema, which blocks generic CRUD, export, import, and backup access).

## Encryption

Audit logs are **not encrypted** at the application layer. They contain access
metadata (who accessed what, when) but never contain clinical content, personal
notes, or patient health information. The `details` field contains structured
summaries like `"nurse viewed 3 clinical notes for Patient #42"` — never the
note content itself.

Database-level encryption at rest is a deployment concern (PostgreSQL TDE or
disk encryption) and is outside the scope of application-layer logging.

## Write Semantics

All audit writes are **fire-and-forget**: they do not block the HTTP response.
If a write fails, the error is logged to stderr via pino (`"Audit event write
failed"`) but the user's request succeeds normally. This ensures audit failures
cannot be used as a denial-of-service vector against clinical workflows.

There is no retry mechanism for failed writes. In a production deployment,
stderr should be captured by the container runtime (e.g., Docker logs,
CloudWatch) to detect audit write failures.

## What Is Logged

### Authentication Events

| Action              | Trigger                                    | Logged By              |
|---------------------|--------------------------------------------|------------------------|
| `login`             | Successful login                           | `api/auth/login`       |
| `login_failed`      | Wrong email or wrong password              | `api/auth/login`       |
| `logout`            | User logs out                              | `api/auth/logout`      |
| `change_password`   | Successful password change                 | `api/auth/change-password` |
| `change_password_failed` | Wrong current password              | `api/auth/change-password` |
| `account_claimed`   | Patient claims portal account              | `api/auth/portal/claim` |
| `patient_registered`| Patient self-registers                     | `api/auth/portal/register` |

### Data Access — Patient Records

| Action        | Trigger                                         | Logged By              |
|---------------|-------------------------------------------------|------------------------|
| `view_list`   | Admin views or searches the patient list        | `api/patient` (GET)    |
| `view`        | Admin views a single patient record             | `api/patient/[id]` (GET) |

### Data Access — Clinical Notes

| Action  | Trigger                                           | Logged By                           |
|---------|---------------------------------------------------|-------------------------------------|
| `view`  | Admin views clinical notes (entity=`clinical_note`) | `api/admin/notes/[id]`             |
| `view`  | Nurse views clinical notes via appointment        | `api/nurse/appointments/[id]/notes` |
| `view`  | Nurse views clinical notes via records panel      | `api/nurse/records/[id]/notes`      |
| `create`| Nurse creates a clinical note                     | `api/nurse/appointments/[id]/notes` |

### Data Access — Personal Notes

| Action  | Trigger                                            | Logged By                           |
|---------|----------------------------------------------------|-------------------------------------|
| `view`  | Admin views personal notes (entity=`personal_note`) | `api/admin/notes/[id]`             |
| `view`  | Nurse views personal notes via appointment         | `api/nurse/appointments/[id]/notes` |
| `view`  | Nurse views personal notes via records panel       | `api/nurse/records/[id]/notes`      |
| `create`| Nurse creates a personal note                      | `api/nurse/appointments/[id]/notes` |

Clinical and personal note views are logged as **separate audit entries** with
distinct `entity` values, allowing queries like "show all personal note access
for patient #42" without text parsing.

### Data Access — Hearing Aids

| Action  | Trigger                                                | Logged By                              |
|---------|--------------------------------------------------------|----------------------------------------|
| `view`  | Admin views hearing aids (via patient property panel)  | Route factory (generic entity read)    |
| `view`  | Nurse views hearing aids via appointment detail        | `api/nurse/appointments/[id]/hearing-aids` |
| `view`  | Patient views own hearing aids via portal              | `api/portal/hearing-aids`              |

Hearing aids are health information (they reveal hearing loss and its severity).
All access is audit-logged regardless of role. Unlike clinical notes, hearing
aids are not watermarked or canvas-rendered — the data is objective equipment
records (make, model, serial number), not subjective clinical observations.

**Nurse access scope:** nurses can only view hearing aids for patients they have
appointments with (same scope rule as clinical notes). Cross-patient access
attempts are logged as `access_denied`.

**Patient portal:** patients see a practical subset of fields (ear, make, model,
serial number, battery type, wax filter, dome, warranty end date). Internal
fields (programming cable, software, HSP code, repair details) are excluded.

### Data Access — Appointments

| Action              | Trigger                                    | Logged By                     |
|---------------------|--------------------------------------------|-------------------------------|
| `create`            | Admin creates an appointment               | `api/appointment` (POST)      |
| `update`            | Admin updates an appointment               | `api/appointment/[id]` (PUT)  |
| `delete`            | Admin deletes an appointment               | `api/appointment/[id]` (DELETE) |
| `view_schedule`     | Nurse views their appointment list         | `api/nurse/appointments`      |
| `view_appointment`  | Nurse views a specific appointment         | `api/nurse/appointments/[id]` |
| `cancel`            | Nurse cancels an appointment               | `api/nurse/appointments/[id]/cancel` |
| `book_appointment`  | Patient books via portal                   | `api/portal/appointments` (POST) |

### Data Access — Nurse Account Management

| Action   | Trigger                                     | Logged By          |
|----------|---------------------------------------------|--------------------|
| `create` | Admin creates nurse + user account           | `api/nurse` (POST) |

Two entries are created: one for entity `nurse`, one for entity `user`.

### Data Access — Patient Portal (Self-Service)

| Action               | Trigger                                  | Logged By              |
|----------------------|------------------------------------------|------------------------|
| `patient_self_update`| Patient edits their own profile          | `api/portal/profile` (PUT) |
| `correction_request` | Patient requests a data correction       | `api/portal/corrections` |

### Data Access — External Sync (CardDAV)

| Action                | Trigger                                    | Logged By                        |
|-----------------------|--------------------------------------------|----------------------------------|
| `carddav_update`      | Phone sync updates a patient/nurse record  | `api/carddav/[addressbook]/[id]` (PUT) |
| `carddav_auth_failed` | Failed Basic Auth on any CardDAV endpoint  | `api/carddav/[addressbook]/[id]` |

CardDAV operates outside the session system (Basic Auth, no userId). The
`userId` field is `null` for these entries. The IP address and user-agent are
captured for forensic purposes.

### Data Access — AI Queries

| Action                  | Trigger                                 | Logged By      |
|-------------------------|-----------------------------------------|----------------|
| `ai_query`              | User submits a natural language query   | `api/ai` (POST) |
| `ai_external_disclosure`| Patient data sent to Google Gemini      | `api/ai` (POST) |

The `ai_external_disclosure` entry is a compliance record that data left the
system boundary. The `details` field records what was sent.

### Data Export & Import

| Action   | Trigger                                      | Logged By                 |
|----------|----------------------------------------------|---------------------------|
| `export` | Bulk entity export (CSV/JSON)                | `api/[entity]/export`     |
| `export` | Single patient record export                 | `api/patient/[id]/export` |
| `export` | Full database backup                         | `api/backup`              |
| `import` | Bulk entity import (CSV/JSON)                | `api/[entity]/import`     |

### Data Access — Calendar Feeds

| Action             | Trigger                                  | Logged By                          |
|--------------------|------------------------------------------|------------------------------------|
| `ical_feed_access` | External calendar fetches iCal feed      | `api/calendar/[nurseId]/feed.ics`  |

### Data Access — Attachments

| Action     | Trigger                     | Logged By                      |
|------------|-----------------------------|--------------------------------|
| `create`   | File uploaded               | `api/attachments/upload` (POST) |
| `download` | File downloaded             | `api/attachments/[id]/download` |

### Authorisation Failures

| Action          | Trigger                                          | Logged By                  |
|-----------------|--------------------------------------------------|----------------------------|
| `access_denied` | Authenticated user lacks the required role        | `withRole` middleware      |
| `access_denied` | Nurse attempts to view a non-assigned patient's notes | `api/nurse/records/[id]/notes` |
| `access_denied` | Nurse attempts to view another nurse's appointment | `api/nurse/appointments/[id]` |

**Role-level failures** (via `withRole`): the `details` field includes user ID,
their actual role, the required role, the HTTP method, and the URL path.
Example: `"user #7 (role=nurse) denied access requiring admin role — GET /api/patient"`.

**Cross-patient access** (nurse records): the `details` field identifies the
nurse and the patient they attempted to access. Example: `"nurse Sarah
(nurse #3) attempted to view notes for non-assigned patient #42"`. This is
logged as a HIGH severity event in the audit alert scanner.

This covers all role-escalation attempts and cross-patient snooping across
the application.

### Generic Entity CRUD

| Action   | Trigger                                           | Logged By        |
|----------|---------------------------------------------------|------------------|
| `create` | Record created via generic API                    | Route factory    |
| `update` | Record updated via generic API                    | Route factory    |
| `delete` | Record deleted via generic API                    | Route factory    |

Generic entity **reads** (GET) are not individually audited for non-sensitive
entities (e.g., `location`, `appointment_type`). These entities contain no
personal information.

## What Is NOT Logged

The following events are intentionally **not** logged:

| Event                                  | Reason                                   |
|----------------------------------------|------------------------------------------|
| Unauthenticated requests (no session)  | No userId to attribute; handled by 401 response. High volume from bots would flood the audit table. |
| Expired/invalid JWT tokens             | Same as above — no identity to log against. |
| Rate-limited requests (429)            | Operational concern, not a data access event. Rate limiting runs before session resolution. |
| Generic entity reads (non-sensitive)   | Entities like `location`, `appointment_type`, `nurse_specialty` contain no personal information. Logging every read would produce noise that obscures meaningful access events. |
| Patient portal appointment reads       | Patient viewing their own appointments. Low risk — they own this data. |
| Patient portal profile reads           | Patient viewing their own profile. Low risk — they own this data. |
| ~~Patient portal hearing aid reads~~   | **Exception: hearing aids ARE logged** despite being self-access, because they are health information revealing hearing loss and device details. |
| Nurse availability changes             | No patient data involved. |
| CardDAV read-only access               | Address book reads (GET) after successful auth are not logged. Only writes (PUT) and failed auth are logged. |

### Gaps Under Consideration

| Gap                                     | Status                                  |
|-----------------------------------------|-----------------------------------------|
| No user role management API exists      | Role changes require direct DB access. When an admin API is built, it must include audit logging. |
| `withNurseContext` / `withPatientContext` 403s | Orphaned accounts (user with no linked nurse/patient profile) return 403 without audit. These are configuration errors, not access attempts. |

## Sensitive Entity Protection

The following entities are marked `sensitive: true` in `schema.yaml` and are
**blocked from all generic access**:

- `user` — credentials, roles
- `session` — JWT tokens
- `audit_log` — the audit trail itself
- `calendar_connection` — OAuth tokens
- `claim_token` — portal claim secrets
- `clinical_note` — must go through watermarked, audited routes
- `personal_note` — must go through watermarked, audited routes

This means `clinical_note` and `personal_note` cannot be accessed via
`GET /api/clinical_note/123` (the generic catch-all). All access is forced
through the dedicated nurse and admin note routes, which enforce:
- Audit logging (separate entries per note type)
- Watermarked image rendering (notes returned as PNG, not selectable text)
- Pseudonymisation (patients identified by number, not name)
- Anti-caching headers

## Querying the Audit Log

The audit log is queryable via the database. Useful queries for auditors:

```sql
-- All access to a specific patient's notes
SELECT * FROM "AuditLog"
WHERE entity IN ('clinical_note', 'personal_note')
  AND entity_id = '42'
ORDER BY timestamp DESC;

-- All actions by a specific user
SELECT * FROM "AuditLog"
WHERE "userId" = 3
ORDER BY timestamp DESC;

-- All failed access attempts
SELECT * FROM "AuditLog"
WHERE action IN ('access_denied', 'login_failed', 'carddav_auth_failed')
ORDER BY timestamp DESC;

-- All data leaving the system (AI queries, exports)
SELECT * FROM "AuditLog"
WHERE action IN ('ai_external_disclosure', 'export')
ORDER BY timestamp DESC;

-- All CardDAV sync modifications
SELECT * FROM "AuditLog"
WHERE action = 'carddav_update'
ORDER BY timestamp DESC;
```

## Suspicious Activity Alerts

A cron job (`scripts/audit-alerts.ts`) scans the audit log periodically and
emails the practice owner when suspicious patterns are detected. This runs
independently of the application — it queries the database directly and sends
alerts via Resend.

**Setup:**

```bash
# Run every 10 minutes
*/10 * * * * cd /path/to/customer-relations && npx tsx scripts/audit-alerts.ts
```

**Environment variables:**

| Variable            | Required | Description                          |
|---------------------|----------|--------------------------------------|
| `ALERT_EMAIL`       | Yes      | Recipient email (practice owner)     |
| `RESEND_API_KEY`    | Yes      | Resend API key for sending email     |
| `EMAIL_FROM`        | No       | Sender address (default: noreply@example.com) |
| `ALERT_WINDOW_MINS` | No      | Scan window in minutes (default: 10, should match cron interval) |
| `DATABASE_URL`      | Yes      | PostgreSQL connection string         |

If `ALERT_EMAIL` is not set, the script exits silently — no logs, no errors.
This allows it to be present in the crontab without generating noise in
environments where alerting is not configured.

### Alert Rules

| # | Rule | Threshold | Severity | Rationale |
|---|------|-----------|----------|-----------|
| 1 | Brute-force login | 5+ failed logins for the same account in the scan window | HIGH | Credential stuffing or targeted attack against a known account |
| 2 | Role escalation | Any `access_denied` event | HIGH | An authenticated user attempted to access a higher-privilege endpoint. In a small practice, this is always unusual. |
| 3 | CardDAV brute-force | 3+ failed CardDAV auth attempts in the scan window | HIGH | Someone is trying to guess the shared CardDAV password |
| 4 | Data export | Any `export` event | MEDIUM | Patient data leaving the system — the owner should always know |
| 5 | AI external disclosure | Any `ai_external_disclosure` event | MEDIUM | Patient data was sent to Google Gemini — the owner should always know |

### Design Decisions

**Why a cron job, not in-request detection?** Separation of concerns. The
alerting logic (thresholds, email formatting, recipient configuration) changes
independently of the audit writing logic. A cron job can be tuned, disabled,
or replaced without touching any application code. It also avoids adding
latency to user requests.

**Why these four rules and not more?** Alert fatigue. A small practice owner
receiving 20 emails a day will start ignoring them. These rules are
high-confidence signals — when they fire, something genuinely unusual happened.
False positives are rare:
- Legitimate users don't fail login 5 times in 10 minutes
- Nurses don't normally hit admin endpoints
- CardDAV sync doesn't fail auth repeatedly
- Data exports are infrequent operational events

**What about anomaly detection?** Not implemented. Statistical anomaly
detection (e.g. "nurse viewed 10x more records than usual") requires baseline
data, tuning, and generates false positives during busy clinic days. The
rule-based approach is transparent, predictable, and auditable.

## Weekly Access Report

A weekly summary is emailed to the practice owner (`ADMIN_EMAIL`) every Monday
morning via `scripts/weekly-access-report.ts`. This report is **always sent**,
even when there is no suspicious activity — a "no suspicious activity" message
provides positive confirmation that the system is being monitored.

**Setup:**

```bash
# Run every Monday at 7am
0 7 * * 1 cd /path/to/customer-relations && npx tsx scripts/weekly-access-report.ts
```

**Report contents:**

| Section | Description |
|---------|-------------|
| Suspicious activity summary | Count of `access_denied`, `login_failed`, `carddav_auth_failed` events — or a green "no suspicious activity" banner |
| Patient record access table | Who accessed which patient records (user, role, record type, patient ID, view count) |
| Data exports & disclosures | Any `export` or `ai_external_disclosure` events with timestamps |

The report covers the preceding 7 days. It aggregates access events by user,
entity type, and patient — so Clare sees "Nurse Sarah viewed clinical_note
for Patient #42: 5 times" rather than 5 individual rows.

See [EMAIL.md](EMAIL.md) for full email documentation and crontab summary.

## Architecture

```
HTTP Request
    |
    v
withTrace        -- assigns correlationId, captures IP + user-agent
    |
    v
withRateLimit    -- 429 if exceeded (NOT logged)
    |
    v
withSession      -- verifies JWT, attaches ctx.audit() method
    |             -- 401 if invalid (NOT logged — no identity)
    v
withRole         -- checks role hierarchy
    |             -- 403 if insufficient (LOGGED as access_denied)
    v
Route Handler    -- calls ctx.audit() for data access events
    |
    v
logAuditEvent()  -- writes to AuditLog table (fire-and-forget)
```

For CardDAV routes (outside the middleware stack):
```
HTTP Request
    |
    v
checkAuth()      -- Basic Auth with timing-safe comparison
    |             -- 401 if failed (LOGGED as carddav_auth_failed)
    v
Route Handler    -- calls logAuditEvent() directly for writes
```

## Email Notifications

Transactional emails are sent via Resend (`src/lib/email.ts`). When
`RESEND_API_KEY` is not set, all emails are logged to the console as stubs.
Email failures never block the user's request — all sends are fire-and-forget.

### Emails Sent by the Application

| Email | Trigger | Recipient | Route |
|-------|---------|-----------|-------|
| Account claim ("set your password") | Admin creates patient portal invite | Patient | `api/auth/portal/check` |
| Appointment confirmation | Admin creates appointment OR patient books via portal | Patient | `api/appointment` (POST), `api/portal/appointments` (POST) |
| Cancellation — reschedule | Nurse cancels an appointment | Patient | `api/nurse/appointments/[id]/cancel` |
| Cancellation — notification | Nurse cancels an appointment | Admin (Clare) | `api/nurse/appointments/[id]/cancel` |

### Emails Sent by Cron Jobs

| Email | Schedule | Recipient | Script |
|-------|----------|-----------|--------|
| Appointment reminder | Daily (e.g. 6pm) | Patients with appointments tomorrow | `scripts/appointment-reminders.ts` |
| Suspicious activity alert | Every 10 minutes | Admin (Clare) | `scripts/audit-alerts.ts` |

### Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `RESEND_API_KEY` | All emails | Resend API key — without this, all emails are console stubs |
| `EMAIL_FROM` | All emails | Sender address (default: `Customer Relations <noreply@example.com>`) |
| `PRACTICE_NAME` | All emails | Practice name in email body (default: `the practice`) |
| `ADMIN_EMAIL` | Cancellation to admin | Clare's email — nurse cancellations are sent here |
| `ALERT_EMAIL` | Audit alerts | Alert recipient — suspicious activity notifications |
| `PORTAL_URL` | Cancellation to patient | Base URL for "rebook" link in cancellation email |
