---
name: edge-case-audit
description: >
  Audit the CRM codebase for edge cases across 8 dimensions: input validation,
  time/timezone, concurrency, data integrity, memory/performance, import/export,
  access control, and external integrations. Use when: adding new features,
  changing API routes, modifying schema, updating parsers, or before shipping.
---

# Edge Case Audit — Healthcare CRM

You are a senior backend engineer hunting for edge cases in a healthcare CRM built with Next.js 16, Prisma 7, and PostgreSQL. Edge cases in healthcare software have real consequences — a double-booked appointment wastes a patient's day, a currency rounding error undermines trust, a timezone bug shifts an entire calendar.

## Your Mindset

Think like QA trying to break the system. For every surface you review, ask:
- What happens with unexpected input? (empty strings, nulls, huge values, special characters)
- What happens at boundaries? (midnight UTC, DST transitions, 23:59, page 0, negative IDs)
- What happens when two users act simultaneously? (double-booking, duplicate imports, concurrent edits)
- What happens when external systems fail? (CalDAV down, OAuth expired, email bounced)
- What data types could lose precision or silently truncate?

## Rules

- **READ-ONLY**: Do NOT edit, create, or delete any files. Your job is to find and report, not fix.
- You MAY run existing tests to check coverage
- Do NOT run destructive commands

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific files or areas.

If no arguments, run a **full audit** across all 8 dimensions.

---

## Dimension 1: Input Validation

**Question: Can a user (patient, nurse, or admin) submit data that bypasses validation and corrupts the database or crashes the server?**

- Check all POST/PUT handlers in `src/app/api/` — does every route call `validateEntity()` or equivalent?
- Check portal routes (`/api/portal/`) and nurse routes (`/api/nurse/`) — these are outside the route-factory and may lack generic validation
- Look for `split(":")`, `parseInt()`, `new Date()` on unvalidated input
- Check that enum fields actually validate against their `values` list
- Check for missing format validation: phone, email, time (HH:MM), date (YYYY-MM-DD)
- Check for unbounded string fields — is there a max length?

### Checklist:
- [ ] All POST/PUT routes validate input before DB writes
- [ ] Time fields validated with `HH:MM` regex before arithmetic
- [ ] Date fields validated before `new Date()` parsing
- [ ] Enum fields checked against allowed values
- [ ] String fields have reasonable length limits
- [ ] Phone/email formats validated at input boundaries
- [ ] Numeric fields reject NaN/Infinity

---

## Dimension 2: Time & Timezone

**Question: Will this system produce correct dates and times for an Australian practice, including DST transitions?**

- Check all `new Date(string)` calls — bare date strings parse as midnight UTC, which shifts in UTC+ timezones
- Check if all date-only storage uses noon UTC pattern (see `src/lib/date-utils.ts`)
- Check iCal output (`src/lib/ical.ts`) for TZID parameters on DTSTART/DTEND
- Check slot computation (`src/app/api/slots/route.ts`) for consistent date representation between availability and appointments
- Check `.toISOString().split("T")[0]` usages — safe only if stored at noon UTC or later
- Check for DST edge: does `new Date().getTimezoneOffset()` appear anywhere? (server timezone dependency)

### Checklist:
- [ ] All date-only storage uses noon UTC via `parseDate()` from `date-utils.ts`
- [ ] iCal DTSTART/DTEND include `TZID=Australia/Sydney`
- [ ] No bare `new Date("YYYY-MM-DD")` (midnight UTC) stored directly
- [ ] Slot availability and appointment conflict use identical date representations
- [ ] No server-timezone-dependent code (`getTimezoneOffset`, `toLocaleDateString` without explicit locale)

---

## Dimension 3: Concurrency & Race Conditions

**Question: What happens when two users perform the same action at the same time?**

- Check appointment booking for serializable transaction with overlap detection
- Check nurse availability creation for atomic duplicate-check-and-create
- Check patient registration/claim for TOCTOU on email uniqueness
- Check import pipeline — does it handle concurrent imports of the same entity?
- Check idempotency key scoping — are keys namespaced per entity and user?

### Checklist:
- [ ] Appointment booking uses serializable transaction with time-overlap check
- [ ] Admin appointment creation has overlap protection
- [ ] Nurse availability uses transaction for duplicate check + create
- [ ] Portal claim/register use transactions for uniqueness checks
- [ ] Import pipeline handles concurrent runs gracefully
- [ ] Idempotency keys scoped by entity + user

---

## Dimension 4: Data Integrity

**Question: Can data be silently corrupted, truncated, or lost?**

- Check Prisma schema types: `Float` for currency (should be `Decimal`), `Float` for integers (should be `Int`)
- Check `onDelete` behaviour: `Restrict` should have user-friendly error handling (catch P2003)
- Check backup endpoint — does it paginate past the 1000-row `findAll` cap?
- Check for cascading deletes that could remove more data than intended
- Check that session tokens are stored as hashes (sha256), not raw JWTs

### Checklist:
- [ ] Currency fields use `Decimal` type, not `Float`
- [ ] Integer fields (day_of_week, size_bytes) use `Int`, not `Float`
- [ ] `onDelete: Restrict` caught with user-friendly 409 error
- [ ] Backup paginates through all records (no silent truncation)
- [ ] Session tokens stored as sha256 hashes in all auth routes
- [ ] No silent data loss on import/export

---

## Dimension 5: Memory & Performance

**Question: Can a single request exhaust the Node.js heap or block the event loop?**

- Check for unbounded queries (`findAll` without pagination in request handlers)
- Check notes endpoints — rendering many notes as watermarked PNGs is expensive
- Check import pipeline `loadExistingRecords` — loads all into memory
- Check backup endpoint — holds all entities in memory simultaneously
- Check AI endpoint `pseudonymMap` — loads all patients/nurses on every query
- Check for N+1 queries in list endpoints

### Checklist:
- [ ] Notes endpoints paginate results
- [ ] Export/backup uses streaming or pagination for large datasets
- [ ] No unbounded `findAll` in request handlers
- [ ] Import memory usage documented/limited
- [ ] AI name resolution doesn't load entire patient table on every query

---

## Dimension 6: Import/Export Robustness

**Question: Will import/export handle real-world files from Excel, Google Sheets, and other CRMs?**

- Check CSV parser for BOM handling (UTF-8 BOM from Excel)
- Check CSV export for formula injection protection (`=`, `+`, `-`, `@` prefixes)
- Check JSON import for multi-entity backup files — does it extract the correct entity?
- Check vCard import for encoding edge cases (UTF-8, quoted-printable)
- Check filename sanitisation in Content-Disposition headers
- Check file size limits and error messages

### Checklist:
- [ ] CSV parser strips UTF-8 BOM
- [ ] CSV export prefixes formula-triggering characters with `'`
- [ ] JSON import accepts multi-entity backup and extracts correct entity
- [ ] Content-Disposition filenames sanitised (no path traversal, no special chars)
- [ ] File size limit enforced with clear error message
- [ ] Import errors are non-destructive (partial import doesn't corrupt existing data)

---

## Dimension 7: Access Control Boundaries

**Question: Can a user access data they shouldn't, or retain access after their role changes?**

- Check nurse note access — is there a recency window, or does any historical appointment grant permanent access?
- Check patient portal — can a patient see other patients' data via ID manipulation?
- Check admin routes — are they properly protected by the proxy?
- Check AI endpoint — can queries reference sensitive tables (User, Session, AuditLog)?
- Check portal profile — can patients edit fields beyond the allowed set?

### Checklist:
- [ ] Nurse note access limited to active appointments (30-day window)
- [ ] Patient portal endpoints filter by `ctx.patient.id` — no cross-patient access
- [ ] AI SQL validator blocks sensitive tables (User, Session, AuditLog, etc.)
- [ ] Portal profile only allows editing of designated fields
- [ ] Sensitive tables excluded from schema description sent to LLM
- [ ] Rate limiting on auth endpoints

---

## Dimension 8: External System Integration

**Question: What happens when external systems fail, return unexpected data, or are slow?**

- Check CalDAV push/delete — is failure handled gracefully? Does local DB stay consistent?
- Check OAuth token storage — are tokens encrypted? Is there a refresh mechanism?
- Check email sending — is it fire-and-forget? What if SMTP is down?
- Check CalDAV/CardDAV sync — what happens if the remote server returns malformed data?
- Check iCal feed — what happens if a subscriber fetches during a server error?

### Checklist:
- [ ] CalDAV operations are fire-and-forget with structured error logging
- [ ] OAuth tokens have TODO for encryption implementation
- [ ] Email failures don't block API responses
- [ ] Malformed external data doesn't crash the import/sync pipeline
- [ ] iCal feed returns valid VCALENDAR even with partial data

---

## Step 2: Run Existing Tests

```bash
npx vitest run tests/unit/sql-safety.test.ts
npx vitest run tests/unit/auth.test.ts
npx vitest run tests/unit/security.test.ts
```

Check coverage gaps — are the edge cases you found covered by tests?

## Step 3: Report

Produce a structured report:

### Critical (breaks core functionality or loses data)
- Description, affected file:line, reproduction steps, fix recommendation

### High (security gap, compliance issue, or data corruption risk)
- Description, affected file:line, fix recommendation

### Medium (incorrect behaviour under uncommon conditions)
- Description, affected file:line, fix recommendation

### Low (cosmetic, defensive improvement, or documentation gap)
- Description, fix recommendation

### Passed Checks
- List edge cases that ARE correctly handled

### Scorecard

| Dimension | Score (/5) | Key Finding |
|-----------|-----------|-------------|
| Input Validation | | |
| Time & Timezone | | |
| Concurrency | | |
| Data Integrity | | |
| Memory & Performance | | |
| Import/Export | | |
| Access Control | | |
| External Integration | | |

## Key Files Reference

| File | Edge Case Role |
|------|---------------|
| `src/app/api/portal/appointments/route.ts` | Patient booking — overlap, validation, date handling |
| `src/app/api/nurse/availability/route.ts` | Nurse slots — duplicate check, time validation |
| `src/app/api/appointment/route.ts` | Admin booking — overlap check |
| `src/app/api/slots/route.ts` | Slot computation — date consistency |
| `src/lib/date-utils.ts` | Shared date parsing (noon UTC pattern) |
| `src/lib/sql-safety.ts` | AI SQL validation — table/function blocking |
| `src/lib/name-resolution.ts` | AI prompt injection surface — name sanitisation |
| `src/lib/parsers.ts` | CSV/JSON/vCard parsing — BOM, encoding, multi-entity |
| `src/lib/import.ts` | Import pipeline — memory, validation, upsert matching |
| `src/lib/ical.ts` | iCal generation — TZID, formatTime, VTIMEZONE |
| `src/lib/route-factory.ts` | Generic CRUD — validation, delete error handling, field limits |
| `src/lib/repository.ts` | findAll 1000-row cap, validateEntity |
| `src/lib/rate-limit.ts` | In-memory rate limiting |
| `src/lib/idempotency.ts` | Idempotency cache — scoping, TTL |
| `src/app/api/backup/route.ts` | Full export — pagination past 1000-row cap |
| `src/app/api/[entity]/export/route.ts` | CSV/JSON/XLSX export — injection, encoding |
| `src/app/api/nurse/records/[id]/notes/route.ts` | Nurse note access — recency window |
| `src/app/api/admin/notes/[id]/route.ts` | Admin notes — pagination |
| `src/app/api/portal/profile/route.ts` | Patient self-update — field validation |
| `src/proxy.ts` | Route enforcement, session verification |
| `prisma/schema.prisma` | Field types, FK constraints, cascading deletes |
| `schema.yaml` | Source of truth for field types and relations |
| `src/engine/field-types.ts` | Type registry — prismaType mapping, validation |

## Known Controls Already in Place

- Appointment booking uses serializable transactions with time-overlap detection
- Nurse availability uses transactional duplicate check
- Portal claim/register use transactions for uniqueness
- Session tokens stored as sha256 hashes in all auth routes
- AI SQL validator blocks sensitive tables, DML keywords, dangerous functions
- Name sanitisation strips control chars, brackets, angle brackets, backticks, CRM_RESOLVED sentinel
- CSV parser strips UTF-8 BOM
- CSV export prefixes formula-triggering characters
- JSON import extracts correct entity from multi-entity backup
- iCal output includes VTIMEZONE and TZID=Australia/Sydney
- Date-only storage uses noon UTC pattern via shared `parseDate()`
- Generic CRUD has 100KB per-field length limit
- Admin notes endpoint is paginated
- Patient delete catches P2003 FK violation with user-friendly 409 error
- Backup paginates through all records (no silent truncation)
- Portal profile validates Australian phone format and address length
- Proxy catches missing SESSION_SECRET gracefully
- Rate limiter has TODO for Redis-backed multi-worker deployment
- CalDAV/CardDAV token encryption has TODO for AES-256-GCM implementation

## Red Lines — Always Flag These

- Any `new Date(dateString)` on a bare `YYYY-MM-DD` without noon-UTC adjustment
- Any `findAll()` without pagination in a request handler
- Any POST/PUT route that skips `validateEntity()` or equivalent
- Any raw JWT stored in the database (must be hashed)
- Any `$queryRawUnsafe` without `validateAiSql()` gating
- Any `split(":").map(Number)` on unvalidated time strings
- Any `Float` type for currency or integer-semantic fields in schema.yaml
- Any access control check without a recency/status filter
- Any `Content-Disposition` filename with unsanitised user input
- Any CSV export without formula injection protection
