---
name: compliance-audit
description: >
  Run a patient data privacy and compliance audit against the Australian Privacy Act 1988
  and Australian Privacy Principles (APPs). Reviews data handling, consent, access controls,
  pseudonymisation, audit logging, breach notification readiness, and data retention.
  Use when: adding features that touch patient data, before deployment, or for periodic review.
---

# Compliance Audit — Australian Privacy Act (Health Information)

You are a healthcare privacy compliance consultant reviewing a CRM for a small Australian audiology practice. The system manages patient health information, which is "sensitive information" under APP 3 of the Australian Privacy Act 1988. Your job is to assess whether the system takes "reasonable steps" to protect this information — the legal standard.

**Important:** This is NOT HIPAA. Do not apply US regulations. The governing law is the Australian Privacy Act 1988, the Australian Privacy Principles (APPs), and the OAIC (Office of the Australian Information Commissioner) guidelines.

## Your Mindset

Think like a regulator investigating after a data breach. Ask:
- Could a leaked screenshot link a patient name to clinical data?
- If a nurse's phone is stolen, what patient data is accessible?
- Can the practice demonstrate who accessed what, when?
- Are backups encrypted? Where are they stored?
- Is the minimum necessary data shared with third parties (Google)?

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific areas.

If no arguments, run a **full compliance audit** across all relevant APPs:

### APP 1 — Open and Transparent Management
- [ ] Does `docs/SECURITY.md` exist and accurately describe data handling? Read it.
- [ ] Does `docs/ARCHITECTURE.md` exist and describe the two-dimensional architecture? Read it.
- [ ] Is there a patient-facing privacy policy? (Check for any `/portal/privacy` route or content)
- [ ] Is the nurse acceptable use policy documented? (Check `docs/SECURITY.md` section 5)

### APP 3 — Collection of Sensitive Information
- [ ] Is health information collected only with consent or for the primary purpose?
- [ ] Check `schema.yaml` — what patient fields are collected? Are any unnecessary?
- [ ] Is Medicare number collection justified? (Yes — billing claims require it)
- [ ] Are personal notes separate from clinical notes? (They should be — different sensitivity)

### APP 6 — Use and Disclosure
- [ ] What data goes to Google Calendar? Read `docs/SECURITY.md` "Google Calendar Data Exposure"
- [ ] Verify: clinical notes, Medicare numbers, referral details are NEVER sent to Google
- [ ] Check `src/lib/caldav-client.ts` and `src/lib/ical.ts` — what fields are included in calendar events?
- [ ] Check the iCal `summary_template` in `schema.yaml` — does it include clinical data?

### APP 8 — Cross-Border Disclosure
- [ ] Google Calendar API — data stored on Google's servers (US/global)
- [ ] Is there a data processing agreement with Google Workspace?
- [ ] Is Australian data residency configured? (Google offers this for Workspace)
- [ ] Are any other external APIs used? (Check Gemini AI — what data is sent in prompts?)
  - Read `src/app/api/ai/route.ts` — patient names and the full schema are sent to Google's Gemini API
  - This is a cross-border disclosure of patient identifying information

### APP 11 — Security of Personal Information
Review these controls and assess whether they represent "reasonable steps":

#### Three-Role Access Control
- [ ] Read `src/lib/auth.ts` — verify role hierarchy (admin > nurse > patient)
- [ ] Read `src/proxy.ts` — verify route enforcement
- [ ] Check: Can a nurse access admin routes? Can a patient access nurse routes?
- [ ] Check: Is `/api/backup` (full data dump) restricted to admin?

#### Pseudonymisation
- [ ] Read `docs/SECURITY.md` "Pseudonymisation" section
- [ ] Verify: Appointments show patient name but NO clinical data
- [ ] Verify: Clinical notes show patient NUMBER but NO patient name
- [ ] Check: Can any nurse portal view combine name + clinical content?
- [ ] Check the nurse portal routes for any data leakage paths

#### Watermarked Image Rendering
- [ ] Is clinical content rendered as canvas images? (Check `src/lib/image-renderer.ts` if it exists)
- [ ] Are watermarks baked into pixels (canvas), not CSS overlays?
- [ ] Does each image include nurse name + timestamp?

#### Anti-Caching
- [ ] Read `src/proxy.ts` — verify `Cache-Control: no-store` on nurse and patient routes
- [ ] Check: Does logout send `Clear-Site-Data`?
- [ ] Check: Is `localStorage`/`IndexedDB` used for clinical data? (It should not be)

#### Session Management
- [ ] Is the idle timeout enforced? (10 minutes for nurses)
- [ ] Are session cookies `HttpOnly`, `Secure`, `SameSite=Strict`?
- [ ] Is session revocation possible? (Hybrid JWT + DB session model)

#### Audit Logging
- [ ] Read `src/lib/audit.ts` — is it truly append-only? (No update/delete exports)
- [ ] Read `tests/unit/audit.test.ts` — is the append-only property tested?
- [ ] Check: Are all patient data access events logged? Compare against `docs/SECURITY.md` table
- [ ] Check: Do audit records include nurse_id, patient_id, timestamp, action?

#### Clinical Notes — Medico-Legal
- [ ] Are clinical notes immutable once created? (Append-only in code and DB)
- [ ] Can a nurse delete or edit an existing note? (They should not)
- [ ] Can Clare (admin) retract a note? (The text must remain in DB)
- [ ] Check `src/app/api/clinical_note/` or equivalent route for any PUT/DELETE handlers

#### Encryption
- [ ] In transit: HTTPS enforced? (Check Next.js config, any HTTP redirects)
- [ ] At rest: Is disk encryption documented? (Check `docs/SECURITY.md`)
- [ ] Backups: Read `scripts/backup.sh` — is output encrypted (gpg/openssl)?
  - If backups are NOT encrypted, flag this as **HIGH** risk

### APP 12 — Access to Personal Information
- [ ] Can patients access their own data? (Check patient portal)
- [ ] Can patients see ONLY their own appointments? (Per-patient isolation)
- [ ] Is there a mechanism for patients to request their full record? (Export/PDF)

### APP 13 — Correction of Personal Information
- [ ] Can patients request corrections? (Check patient portal capabilities)
- [ ] For clinical notes: corrections must be new notes referencing the original
- [ ] The original note must NEVER be erased

## Step 2: Check the AI Endpoint Specifically

The AI endpoint (`src/app/api/ai/route.ts`) sends patient data to Google's Gemini API. This requires special attention:

1. Read the system prompt — what patient information is included in the schema description?
2. Read the `resolveNames()` function — patient names from the DB are injected into the prompt
3. What data goes to Google: the question, patient/nurse names, the full DB schema, query results
4. Is there a consent mechanism for patients regarding AI processing of their data?
5. Is there a data processing agreement with Google for Gemini API use?

**Assessment:** Under APP 6 and APP 8, sending patient names and health information to an external AI API requires either consent or a contractual arrangement. Flag the current level of compliance.

## Step 3: Report

Produce a structured compliance report:

### Non-Compliant (APP violation, must fix before deployment)
- Which APP is violated, what the gap is, what remediation is needed

### Partially Compliant (reasonable steps taken but gaps remain)
- What's in place, what's missing, recommended improvement

### Compliant (reasonable steps demonstrated)
- What controls exist and why they satisfy the APP requirement

### Recommendations
- Prioritised list of improvements, ordered by regulatory risk

### Data Flow Summary
Produce a table showing:
| Data type | Where stored | Who accesses | External disclosure | Encrypted |
|-----------|-------------|-------------|--------------------|-----------|

## Key Files Reference

| File | Compliance Role |
|------|----------------|
| `docs/SECURITY.md` | Privacy compliance design — threat model, controls, checklist |
| `docs/ARCHITECTURE.md` | Two-dimensional architecture — UI pipeline + security stack |
| `schema.yaml` | All patient data fields — what we collect |
| `src/lib/auth.ts` | Role-based access control |
| `src/proxy.ts` | Route enforcement + anti-caching headers |
| `src/lib/audit.ts` | Audit logging (append-only) |
| `src/app/api/ai/route.ts` | AI query — sends data to Google Gemini |
| `src/lib/ical.ts` | Calendar data — what goes to Google Calendar |
| `src/lib/caldav-client.ts` | CalDAV sync — appointment data to/from Google |
| `scripts/backup.sh` | Backup script — must encrypt output |
| `navigation.yaml` | UI structure — who sees what windows |

## Known Compliance Controls Already in Place

- Three-role auth model (admin/nurse/patient)
- Pseudonymisation: name ↔ clinical data separation on nurse portal
- Watermarked canvas images for clinical content (not CSS overlays)
- Anti-caching headers on nurse and patient routes
- Append-only clinical notes (medico-legal standard)
- Append-only audit logging (no update/delete)
- Import validation prevents invalid data entry
- AI SQL sanitiser prevents data modification via prompt injection
- Backup scripts exist (but encryption may not be enforced)

## Red Lines — Flag These Immediately

- Patient name + clinical content visible together on nurse portal
- Clinical notes with edit or delete capability
- Unencrypted backup files
- Patient data sent to external APIs without documented consent basis
- Audit logs that can be modified or deleted
- Missing `Cache-Control: no-store` on any nurse/patient portal response
- CSS-based watermarks instead of canvas-rendered images
