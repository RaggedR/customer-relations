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

- 10-minute idle timeout
- No `localStorage` or `IndexedDB` for clinical data
- No service worker (prevents offline caching)
- Session cookie with `HttpOnly`, `Secure`, `SameSite=Strict`

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

## Checklist for Maintainers

When modifying the system, verify:

- [ ] New API endpoints that access patient data include audit logging
- [ ] Nurse portal routes return anti-caching headers
- [ ] Clinical content on the nurse portal is rendered as watermarked images, not HTML text
- [ ] Patient portal routes enforce per-patient record isolation (patient A cannot see patient B)
- [ ] New database fields containing health information are included in the backup
- [ ] Backup files are encrypted before storage
- [ ] Clinical notes remain append-only — no edit or delete operations
- [ ] Medicare numbers and other sensitive fields are visible only to the admin role
