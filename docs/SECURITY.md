# Security & Privacy Compliance

## Regulatory Context

This system manages health information for an Australian audiology practice. It must comply with the **Australian Privacy Act 1988**, specifically the Australian Privacy Principles (APPs). Health information is classified as "sensitive information" under APP 3, requiring a higher standard of protection than general personal data.

This is NOT a HIPAA-compliant system. HIPAA is US federal law and does not apply. The Australian Privacy Act's "reasonable steps" standard is the governing requirement.

---

## Threat Model

### What we're protecting
- Patient names, contact details, Medicare numbers
- Clinical notes (hearing assessments, treatment plans, progress notes)
- Personal notes (patient preferences, family context)
- Referral information (GP details, reasons for referral)
- Billing/claims data

### Who accesses data
| Actor | Auth method | Accesses |
|-------|------------|----------|
| Clare (admin) | Password login | Everything |
| Nurses | Password login to nurse portal; OAuth to Google Calendar | Assigned appointments (with patient name), clinical/personal notes (patient number only) |
| Patients | Password login to patient portal | Own appointments, booking |
| Google Calendar | OAuth2 tokens stored in DB | Appointment scheduling metadata only (name, specialty, location, time) |
| Google Gemini API | API key | Query-dependent patient data (names, clinical notes, contact details); never Medicare numbers. See "AI Query Endpoint" section. |

### Trust boundaries
1. **CRM database** — highest trust, all data, encrypted at rest
2. **Clare's browser** — trusted, full access after auth
3. **Nurse's personal device** — semi-trusted, restricted access, no persistent data
4. **Patient's browser** — untrusted, sees only own data
5. **Google's servers** — external, receives scheduling metadata only (no clinical data)

---

## Pseudonymisation

The core privacy design: **no single artefact on a nurse's device links a patient name to their clinical information.**

| What the nurse sees | Contains | Identifies patient by |
|---------------------|----------|----------------------|
| Appointment (calendar + portal) | Name, location, time, specialty | Name |
| Clinical notes | Note content, date, clinician | Patient number only |
| Personal notes | Note content, date | Patient number only |

The nurse mentally links name ↔ number during a visit, but no screenshot, cached page, or leaked image contains both. The link exists only in the CRM database, accessible only to Clare.

This is the same principle hospitals use with Medical Record Numbers (MRNs).

---

## Nurse Portal Security Controls

### 1. Watermarked image rendering

All clinical content is rendered as **server-generated canvas/PNG images**, not HTML text. Each image is composited with:
- Viewing nurse's full name
- Current timestamp
- Semi-transparent overlay across the content

**Why canvas, not CSS overlay?** A CSS watermark can be removed in seconds via browser dev tools (uncheck `display` on the overlay element). A canvas image is a flat raster — there are no DOM elements to inspect or remove. The watermark is in the pixels.

**Tradeoff:** Text is not searchable or accessible in image form. For a nurse viewing one patient's notes at a time, this is acceptable.

Implementation: `src/lib/image-renderer.ts`

### 2. Anti-caching

Every response from the nurse portal includes:
```
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Expires: 0
```

On logout, the response includes:
```
Clear-Site-Data: "cache", "cookies", "storage"
```

This prevents the browser from retaining any patient data after the session ends.

### 3. No copy/paste

Clinical data areas use:
- CSS: `user-select: none`
- JavaScript: `oncopy`, `oncut` event prevention

This is not bulletproof (dev tools bypass), but raises the bar. Combined with the canvas rendering, there is no selectable text to copy in the first place.

### 4. Session management

- **Authentication**: `POST /api/auth/login` validates credentials (scrypt password hash), signs an HS256 JWT, sets a session cookie
- **Cookie attributes**: `HttpOnly`, `Secure` (production), `SameSite=Strict`, `Path=/`, 8-hour max age
- **Default-deny routing**: All paths require admin role unless explicitly listed as public (login page, static assets, well-known). The proxy (`src/proxy.ts`) enforces this on every request
- **Session extraction**: Route handlers call `getSessionUser(request)` to re-verify the JWT and get the numeric userId for audit logging
- **Logout**: `POST /api/auth/logout` clears the cookie and sends `Clear-Site-Data` header to purge browser cache/storage
- **Idle timeout**: Planned for future batch (currently 8-hour fixed JWT expiry)
- No `localStorage` or `IndexedDB` for clinical data
- No service worker (prevents offline caching)

### 5. Acceptable use policy

A non-technical control. Nurses sign an agreement covering:
- No screenshots of patient data
- Device must be PIN/biometric locked
- Report any suspected data breach
- Do not access patient records outside of clinical need

The technical controls (watermark, no-cache, audit logging) support enforcement of this policy.

---

## Audit Logging

### What is logged

Every access to patient health information:

| Event | Fields logged |
|-------|--------------|
| Nurse viewed patient notes | nurse_id, patient_id, timestamp, action="view" |
| Nurse added clinical note | nurse_id, patient_id, timestamp, action="create", note_type |
| Nurse added personal note | nurse_id, patient_id, timestamp, action="create", note_type |
| Admin exported patient data | admin_id, patient_id (or "all"), timestamp, action="export", format |
| Admin viewed Medicare numbers | admin_id, patient_id, timestamp, action="view_sensitive" |
| AI query executed | admin_id, sql, row_count, timestamp, action="ai_query" |
| AI external disclosure | admin_id, provider, model, row_count, timestamp, action="ai_external_disclosure" |

### What is NOT logged

- Appointment bookings, confirmations, cancellations (operational, not sensitive)
- Login/logout events
- Schema changes
- Navigation actions

### Storage

Audit records are stored in a dedicated database table. They are **immutable** — never updated or deleted. Audit records should be included in database backups.

Implementation: `src/lib/audit.ts`

---

## Clinical Notes

### Append-only

Clinical notes are immutable once created. This is the medico-legal standard — medical records are legal documents.

If a nurse makes an error, the correct procedure is to add a **correction note** referencing the original:

```
Note #1 — Nurse Sarah, 2026-04-12 09:30
  "Replaced wax filter left ear. Patient reports no improvement."

Note #2 — Nurse Sarah, 2026-04-12 09:35
  "Correction to note #1: Patient reports IMPROVED clarity."
```

Clare (admin) can mark a note as **retracted** if absolutely necessary, but the original text is never erased from the database.

### Note creation

Nurses create notes via a standard HTML form on the nurse portal:
- Patient number (pre-filled from context)
- Note type (clinical or personal)
- Content (text area)
- Submit → form auto-clears → note is immutable from this point

The form is a standard HTTPS POST. Security controls (watermark, no-copy, image rendering) apply only to **reading** notes, not writing them.

---

## Encryption

### In transit
HTTPS (TLS) on all connections. Required by:
- Google Calendar API (enforced by Google)
- All three web portals
- CalDAV/CardDAV sync

### At rest
Full-disk encryption on the deployment machine (FileVault on macOS, LUKS on Linux). The PostgreSQL data directory sits on the encrypted volume.

Column-level encryption is not implemented. For a single-practitioner practice on a single encrypted server, disk-level encryption satisfies the "reasonable steps" requirement.

### Backups
`scripts/backup.sh` produces `pg_dump` SQL and JSON exports. These contain all patient data in plaintext and **must be encrypted** before storage or transfer. The backup script should pipe output through `gpg` or `openssl`.

---

## Google Calendar Data Exposure

Appointment invites sent to nurses' Google Calendars contain:
- Patient name
- Appointment specialty
- Location
- Date/time

They do NOT contain:
- Clinical notes
- Medicare numbers
- Referral details
- Any other health information

This data is encrypted in transit (HTTPS, required by Google API) but stored in plaintext on Google's servers. Clare should be aware of this. Google Workspace offers data processing agreements and Australian data residency options if needed.

---

## AI Query Endpoint — Data Disclosure to Google Gemini

The AI query endpoint (`POST /api/ai`) is admin-only (Clare) and sends data to the Google Gemini API. This is a **cross-border disclosure** under APP 8 of the Australian Privacy Act 1988.

### Legal basis

Google's Gemini API Terms of Service state that API input data is not used to train models and is deleted within 30 days. This contractual commitment is the "reasonable steps" basis under APP 8.3(b) for the cross-border transfer. Clare should be informed of this disclosure when she uses the AI endpoint.

### Data minimisation

Fields marked `ai_visible: false` in `schema.yaml` are excluded from:
1. The database schema description sent to Gemini (so it cannot generate queries selecting those fields)
2. Query result rows sent to Gemini for summarisation (defence-in-depth redaction)

Currently excluded: `medicare_number`. To exclude additional fields in future, add `ai_visible: false` to the field definition in `schema.yaml`.

### What reaches Gemini

**Call 1 — SQL generation**

| Data | Sent? | Notes |
|------|-------|-------|
| Database schema (DDL) | Yes | Structural metadata only — table names, column names, types. No patient records. Fields marked `ai_visible: false` are excluded. |
| Patient/nurse names | Conditionally | When Clare's question contains a name, name-resolution appends the matched name from the DB |
| Question text | Yes | Clare's natural language question |
| Medicare numbers | **No** | Excluded from schema description via `ai_visible: false` |

**Call 2 — Result interpretation**

| Data | Sent? | Notes |
|------|-------|-------|
| SQL query text | Yes | Read-only SELECT only (validated by `sql-safety.ts`) |
| Query results (up to 100 rows) | Redacted | Fields marked `ai_visible: false` are stripped before sending |
| Patient names | Yes (when in results) | Required for natural language summaries |
| Clinical note content | Yes (when in results) | Required for "what did we discuss" queries — see known risk below |
| Addresses, phone, email | Yes (when in results) | Contact details may appear if the query SELECTs them |

### Known risk: clinical note content

Clinical note content (diagnosis, treatment details) may reach Gemini when Clare asks about recent sessions or patient summaries. This is a deliberate trade-off: blocking clinical notes would break the primary use case of the AI endpoint. Mitigations:

- The endpoint is admin-only (not accessible to nurses or patients)
- Google's API ToS prohibit training on API data
- Each disclosure is audit-logged with action `ai_external_disclosure`
- Rate limiting (30 requests/minute) bounds exposure volume

### What does NOT reach Gemini

- Medicare numbers (schema-excluded and result-redacted)
- Audit logs, session data, user credentials, OAuth tokens (entity-excluded)
- Any data beyond what the AI-generated SELECT retrieves

### Audit trail

Each AI query produces two audit log entries:
1. `ai_query` — records the SQL executed and row count
2. `ai_external_disclosure` — records the provider (`google/gemini`), model name, and row count sent externally

---

## Cancellation Flow

When a nurse cancels an appointment:
1. Nurse logs into portal, selects appointment, provides reason
2. CRM sets appointment status to `cancelled`
3. Email sent to patient with link to rebook on patient portal
4. Email sent to Clare with nurse name and cancellation reason
5. No audit log entry (cancellation is operational, not a data access event)

Clare monitors cancellation patterns via her email inbox — no dashboard or counter is needed.

---

## Patient Portal

Patients authenticate to view and book appointments. They can see:
- Available appointment slots (filtered by specialty)
- Their own upcoming and past appointments

They cannot see:
- Clinical or personal notes
- Nurse details
- Other patients' data
- Billing (future feature)

Cancellation policy: patients may cancel, but cancellations within 24 hours of the appointment incur the full fee.

---

## Defence-in-Depth (Batch 4)

The following hardening layers were added by the security audit. Most are automatic, but three require one-time deployment actions.

### Automatic (no action needed)
- **Rate limiting**: AI endpoint (30/min per session), login (5/min per IP) — `src/lib/rate-limit.ts`
- **Name sanitisation**: Patient names are sanitised and JSON-encoded before LLM prompt interpolation — prevents stored prompt injection
- **Import file size limit**: Files > 10 MB rejected before parsing — prevents OOM
- **Security headers**: CSP (`script-src 'self'`), HSTS, X-Frame-Options, Permissions-Policy — `next.config.ts`

### Deployment actions required

#### 1. Create read-only database role (before first production deploy)

Run the setup script against the production database:

```bash
psql -U postgres -d customer_relations -f scripts/create-readonly-role.sql
```

Edit the script first to replace `<STRONG_RANDOM_PASSWORD>` with a generated password:
```bash
openssl rand -base64 32
```

Then set the env var so the AI endpoint uses the read-only connection:
```bash
DATABASE_URL_READONLY="postgresql://crm_ai_user:<password>@localhost:5432/customer_relations?schema=public"
```

Without this, the AI endpoint falls back to `DATABASE_URL` (read-write) — functional but without the DB-level write protection.

#### 2. Set TOKEN_ENCRYPTION_KEY (before first production deploy)

Generate and set the encryption key for OAuth tokens at rest:
```bash
TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

Existing plaintext tokens in `calendar_connection` will continue to work (graceful fallback). New tokens will be encrypted. To encrypt existing tokens, run a one-time migration after setting the key.

#### 3. Verify CSP with production build

After deploying, check the browser console for CSP violations. If Next.js hydration scripts are blocked, the CSP may need `'nonce-...'` support or a specific hash — see `next.config.ts`.

---

## Checklist for Maintainers

When modifying the system, verify:

- [ ] New API endpoints that access patient data include audit logging
- [ ] Nurse portal routes return anti-caching headers
- [ ] Clinical content on the nurse portal is rendered as watermarked images, not HTML text
- [ ] Patient portal routes enforce per-patient record isolation (patient A cannot see patient B)
- [ ] New database fields containing health information are included in the backup
- [x] Backup files are encrypted before storage
- [ ] Clinical notes remain append-only — no edit or delete operations
- [ ] Medicare numbers and other sensitive fields are visible only to the admin role
