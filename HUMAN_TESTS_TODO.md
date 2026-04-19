# Human Tasks

Items that require a human — external apps, physical waiting, admin accounts, or process decisions. Everything else has been converted to E2E tests in `tests/e2e/`.

## Pre-deployment Setup

- [ ] Rotate Google API key in `.env` and Google Cloud Console (old key was committed briefly)
- [ ] Execute Google Cloud Data Processing Addendum (legal requirement for Gemini API)
- [ ] Sign up for [Resend](https://resend.com), get API key, set `RESEND_API_KEY` and `EMAIL_FROM` in `.env`
- [ ] Decide on nurse AUP acknowledgement process (paper form or portal checkbox)
- [ ] Update SECURITY.md audit table (login/logout events are now logged)

## Privacy & Compliance — Documentation / Legal (Compliance Audit 2026-04-17)

These are documentation and legal tasks identified by the compliance audit. None require code changes.

### Must fix before production with real patient data

- [x] **Correct privacy notice AI claim** — DONE: wording updated in `portal/privacy/page.tsx` to accurately describe that names in clinical note text may reach Gemini
- [ ] **Record patient consent timestamp** — Add `privacy_notice_accepted_at` field to patient/user entity, populated at registration. Currently no audit trail of APP 3 consent
- [ ] **Write NDB incident response procedure** — Document: detection → internal escalation → OAIC notification (30 days) → individual notification. Required under Part IIIC for health information
- [x] **Decide on nurse UI name/notes separation** — DECIDED: appointment card shows real name (scheduling context), notes section shows patient number only (clinical context). Both on same page. A leaked screenshot of the notes section cannot identify the patient. Comment added to `page.tsx` documenting this as deliberate.

### Must fix before accepting Google integration

- [ ] **Execute Google Cloud DPA for Gemini API** — SECURITY.md mentions DPAs are "available" but none is confirmed. Required under APP 8
- [ ] **Execute Google Workspace DPA for Calendar API** — Same gap for CalDAV sync
- [x] **Correct APP 8 legal basis in SECURITY.md** — DONE: corrected to cite APP 8.1 + reasonable steps, added DPA action item

### Short-term improvements

- [ ] **Make privacy notice publicly accessible** — Currently at `/portal/privacy` (behind login). Prospective patients can't access it. Add a public `/privacy` route
- [ ] **Add practice contact details to privacy notice** — APP 1.4(d) requires contact details in the privacy policy
- [ ] **Store AUP text as versioned document** — Currently only `aup_acknowledged_at` is recorded, not *what* the nurse agreed to. Store AUP version + text
- [x] **Add audit logging to nurse appointment views** — DONE: audit events added to both list and detail endpoints
- [ ] **Disclose Google Calendar transfer in privacy notice** — Appointment metadata (specialty, time, location) crosses to Google but this isn't mentioned
- [ ] **Document justification for AI-visible free-text fields** — `patient.notes`, `referral.reason`, `appointment.notes` reach Gemini. Either mark `ai_visible: false` or document why they're needed

## CalDAV / CardDAV Sync (Section 8)

Requires a real CalDAV/CardDAV client — can't be automated in Playwright.

- [ ] Point macOS Contacts at `/api/carddav/` — verify contacts appear
- [ ] Point a calendar app at a nurse's feed URL — verify appointments appear
- [ ] Create an appointment in the CRM, verify it syncs to the calendar app
- [ ] Edit an appointment, verify the calendar app updates (ETag concurrency)

## Schema Engine Hot-Reload (Section 12)

Requires restarting the dev server — can't run inside a test.

- [ ] Add a dummy field to schema.yaml (e.g. `patient.favorite_color: { type: string }`)
- [ ] Restart the server — verify auto-migration adds the column
- [ ] Verify the field appears in the patient form and detail panel
- [ ] Remove the field — verify the migration is BLOCKED (destructive) and written to disk for review
- [ ] Revert schema.yaml

## Idle Timeout (Section 13)

Requires waiting 10+ real minutes.

- [ ] Login as nurse, wait 10+ minutes idle → verify redirect to /login
- [ ] Login as admin, wait 10+ minutes idle → verify session still valid (no admin idle timeout)

## Nurse Portal — Visual Verification (Section 14)

Watermark rendering needs human eyes.

- [ ] Verify clinical note content renders as a watermarked PNG (not selectable text)
- [ ] Right-click the image → verify no "copy text" option (it's a raster PNG)
- [ ] Verify watermark contains the nurse's name and timestamp

## Export — Open in Real Apps (Sections 6-7)

Verify exported files open correctly in native applications.

- [ ] Open exported PDF in Preview — verify layout and content
- [ ] Open exported XLSX in Excel/Numbers — verify columns and data
- [ ] Open exported vCard in macOS Contacts — verify fields map correctly
- [ ] Open exported iCal in Calendar app — verify appointments appear

## Backup & Restore — Full Cycle (Section 10)

The API endpoint is tested in E2E, but the shell script roundtrip needs a human.

- [ ] Run `./scripts/backup.sh` — verify both .sql and .json files created
- [ ] Delete a test patient, run `./scripts/restore.sh backups/<file>.json` — verify it reappears
