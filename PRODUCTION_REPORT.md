# Production Readiness Audit — Healthcare CRM

**Date:** 2026-04-14
**Branch:** `security/compliance-hardening`
**Auditor:** Claude Opus 4.6 (automated SRE review)
**Stack:** Next.js 16, Prisma 7, PostgreSQL 16, Gemini AI

---

## Test Results

**355 passed, 9 failed, 15 skipped** across 24 test files.

The 9 failures are all in `tests/unit/proxy.test.ts` — the proxy mock doesn't account for the `prisma.session.findUnique` call added during session hardening. These are test maintenance issues, not production bugs.

---

## Scorecard

| Dimension | Score | Critical Gaps |
|-----------|-------|---------------|
| Observability | 1/5 | No structured logging, no metrics, no health check, no request IDs |
| Reliability | 2/5 | No retry logic, no error boundaries, CalDAV failures invisible |
| Data Integrity | 2/5 | Zero `$transaction` usage, missing `@unique`/`@index`, no FK constraints |
| Performance | 1/5 | No pagination anywhere, N+1 eager loading, file downloads buffered |
| Concurrency | 1/5 | No idempotency, no optimistic locking, TOCTOU races |
| Deployment Safety | 2/5 | Hardcoded creds in docker-compose, single-stage Dockerfile, no health check |

---

## Critical (must fix before deployment)

### C1. No pagination on list endpoints

**Affected:** `src/lib/repository.ts:137` (`findAll`), all GET list routes
**Impact:** With 10,000 patients, a single GET eagerly loads every patient with ALL relations (referrals, notes, hearing aids, claims, appointments, attachments). This will OOM the process or timeout.
**Fix:** Add `skip`/`take` parameters to `findAll()` with a default page size (e.g., 50). Every list endpoint must accept `?page=` or `?cursor=`.
**Effort:** M

### C2. No `$transaction` on multi-step writes

**Affected:** `src/app/api/attachments/upload/route.ts:119-138`, `src/app/api/auth/login/route.ts:107-116`, `src/lib/import.ts:125-176`
**Impact:**
- File upload writes to disk then creates a DB record — crash between steps → orphaned file with patient data
- Login creates a session row then signs JWT — partial failure → ghost session
- Import creates/updates rows one-by-one — crash mid-import → partial data with no indication of what succeeded
**Fix:** Wrap in `prisma.$transaction()`. For import, batch rows in a transaction with rollback-on-error option.
**Effort:** M

### C3. Missing `@unique` constraints on business keys

**Affected:** `prisma/schema.prisma`
**Impact:** Nothing prevents two users with the same email, two patients with the same Medicare number, or two nurses with the same registration number. `User.email` especially — `findFirst` in login means non-deterministic auth if duplicates exist.
**Fix:** Add `@unique` to `User.email`, `Patient.medicare_number`, `Nurse.email`, `Nurse.registration_number`.
**Effort:** S

### C4. No database indexes on foreign keys

**Affected:** `prisma/schema.prisma` — `patientId`, `nurseId`, `userId`, `clinical_noteId` columns
**Impact:** Every relation filter, join, and cascade scan is a sequential scan. With even modest data volumes, list queries on appointments-by-nurse or notes-by-patient will degrade.
**Fix:** Add `@@index([patientId])`, `@@index([nurseId])`, etc. to every model with FK fields.
**Effort:** S

### C5. No health check endpoint

**Affected:** No `/api/health` route, no `HEALTHCHECK` in `Dockerfile`
**Impact:** Container orchestrators (Docker, K8s) can't distinguish a running-but-broken app from a healthy one. If the DB goes down, the app still accepts traffic and returns 500s.
**Fix:** Create `/api/health` that pings the DB. Add `HEALTHCHECK` to `Dockerfile`.
**Effort:** S

---

## High (fix within first sprint post-deployment)

### H1. File downloads buffer entire file into memory

**Affected:** `src/app/api/attachments/[id]/download/route.ts:49`
**Impact:** `fs.readFile()` loads the entire file into a Node.js Buffer. A 50MB file (the configured max upload) = 50MB heap allocation per concurrent download. Five concurrent downloads = 250MB. This can OOM the process.
**Fix:** Use `fs.createReadStream()` and stream the response.
**Effort:** S

### H2. Hardcoded credentials in `docker-compose.yml`

**Affected:** `docker-compose.yml:8-9,22`
**Impact:** `POSTGRES_PASSWORD: crm_dev_password` and full `DATABASE_URL` with password are in the committed docker-compose file. Anyone with repo access knows the DB password.
**Fix:** Use environment variable substitution (`${POSTGRES_PASSWORD}`) or a `.env` file referenced by `env_file:`. Create `.env.example` documenting all required vars.
**Effort:** S

### H3. Single-stage Dockerfile includes devDependencies

**Affected:** `Dockerfile`
**Impact:** Production image includes all dev dependencies (test frameworks, dev tools), increasing image size and attack surface.
**Fix:** Multi-stage build: build stage with full `npm ci`, production stage with `npm ci --omit=dev`.
**Effort:** S

### H4. N+1 eager loading on list queries

**Affected:** `src/lib/repository.ts:29-56` (`buildIncludes`)
**Impact:** `findAll("patient")` includes all forward AND reverse relations. For a patient with 5 entity types pointing at it, this is 5 JOINs on every list query. The same `buildIncludes` is called for both `findAll` and `findById`.
**Fix:** Only load relations on `findById`. For `findAll`, return flat records with FK IDs only. Load relations on demand.
**Effort:** M

### H5. No React error boundaries

**Affected:** No `ErrorBoundary` components in `src/`
**Impact:** An unhandled JS error in any component crashes the entire page (white screen). For a clinical user mid-appointment, this means losing context.
**Fix:** Add `error.tsx` files at layout boundaries per Next.js convention.
**Effort:** S

### H6. No process-level exception handlers

**Affected:** No `process.on('uncaughtException')` or `process.on('unhandledRejection')`
**Impact:** An unhandled promise rejection (e.g., from a fire-and-forget audit log that somehow bypasses its catch) crashes the Node.js process silently. In production, this means the container restarts with no diagnostic information.
**Fix:** Add handlers in an instrumentation file or server entry point. Log the error and exit gracefully.
**Effort:** S

### H7. Rate limit state is in-memory only

**Affected:** `src/lib/rate-limit.ts:34` (Map-based storage)
**Impact:** Rate limits reset on every restart. If running multiple instances (cluster, horizontal scaling), each instance has its own counter — an attacker can hit N × limit across N instances.
**Fix:** Document as intentional for single-instance deployment. For multi-instance, migrate to Redis-backed limiter.
**Effort:** M (for Redis) / S (for documentation)

### H8. Proxy tests failing (9 tests)

**Affected:** `tests/unit/proxy.test.ts`
**Impact:** CI is red. The proxy mocks don't include `prisma.session.findUnique`, which was added during session hardening. Tests pass at the unit level but the mock is stale.
**Fix:** Update the mock to provide `session.findUnique` returning a valid session object.
**Effort:** S

---

## Medium (fix within first month)

### M1. No structured logging

**Affected:** 49 `console.log/error/warn` calls across 21 files
**Impact:** Logs are freeform strings with no consistent format. In a production log aggregator (CloudWatch, Datadog), you can't filter by user, entity, request ID, or latency.
**Fix:** Adopt Pino (lightweight, JSON output). Create a logger instance that attaches request context.
**Effort:** M

### M2. No retry logic on external calls

**Affected:** `src/lib/caldav-client.ts`, `src/app/api/ai/route.ts`
**Impact:** Transient network failures (503, timeout, DNS blip) cause immediate failure with no recovery attempt. CalDAV pushes silently fail; AI queries return errors to the user.
**Fix:** Add retry with exponential backoff (2-3 attempts) for CalDAV operations and Gemini API calls.
**Effort:** M

### M3. CalDAV failures are invisible beyond stderr

**Affected:** `src/lib/caldav-client.ts:95-100,146-149,183-187`
**Impact:** CalDAV push/update/delete failures are logged to `console.error` but never recorded in the audit log. If an appointment exists locally but not in the external calendar, no one knows unless they're watching stderr.
**Fix:** Add `logAuditEvent` calls for CalDAV sync failures with the connection ID and error message.
**Effort:** S

### M4. No optimistic locking on updates

**Affected:** `src/lib/route-factory.ts:138-148` (PUT handler), `src/lib/repository.ts:252-274` (`update`)
**Impact:** Two users editing the same patient simultaneously — last write wins silently. The second save overwrites the first user's changes with no warning.
**Fix:** Accept `updatedAt` in PUT body, add `where: { id, updatedAt }` to Prisma update. Return 409 on mismatch.
**Effort:** M

### M5. No idempotency on POST endpoints

**Affected:** All POST create endpoints
**Impact:** Network retry or double-click creates duplicate records. For clinical notes (medico-legal, immutable), duplicate entries are especially dangerous — they could appear in medical reports.
**Fix:** Accept `Idempotency-Key` header on POST. Check before creating. Natural deduplication for entities with upsert keys.
**Effort:** M

### M6. TOCTOU race in nurse appointment ownership

**Affected:** `src/lib/nurse-helpers.ts:34-44` + `src/app/api/nurse/appointments/[id]/cancel/route.ts:52`
**Impact:** `verifyAppointmentOwnership()` checks that the appointment belongs to the nurse, then a separate `prisma.appointment.update()` modifies it. Between check and write, the appointment could be reassigned. Low probability in a small practice but architecturally unsound.
**Fix:** Combine check and write: `prisma.appointment.update({ where: { id, nurseId } })`.
**Effort:** S

### M7. No CalDAV ETag conflict detection

**Affected:** `src/lib/caldav-client.ts:107-150` (updateAppointment)
**Impact:** Updates search for the event by UID string match in the data, then overwrite. No ETag comparison means concurrent modifications to the external calendar are silently overwritten.
**Fix:** Store and compare ETags from CalDAV responses. Use `If-Match` header on updates.
**Effort:** M

### M8. `docker-compose.yml` has no health checks or readiness order

**Affected:** `docker-compose.yml:20-21`
**Impact:** `depends_on: db` only ensures the db container starts, not that PostgreSQL is ready to accept connections. The app may crash on startup if it tries to connect before the DB is ready.
**Fix:** Add `healthcheck` to the db service (`pg_isready`) and use `depends_on: db: condition: service_healthy`.
**Effort:** S

### M9. CI pipeline is incomplete

**Affected:** `.github/workflows/ci.yml`
**Impact:** CI runs unit tests and type-check only. No linting, no E2E tests, no build verification, no secret scanning.
**Fix:** Add: `npm run lint`, `npm run build`, Playwright E2E tests (already written), `gitleaks` for secret scanning.
**Effort:** M

### M10. AI endpoint has no query timeout

**Affected:** `src/app/api/ai/route.ts:286`
**Impact:** If Gemini returns a complex SQL query that scans a large table, `$queryRawUnsafe` will run indefinitely, holding a DB connection.
**Fix:** Set `statement_timeout` on the readonly connection string, or wrap in `SET LOCAL statement_timeout = '5s'`.
**Effort:** S

---

## Low (defence-in-depth, nice to have)

### L1. No `.env.example` documenting required environment variables

Required vars: `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_API_KEY`, `DATABASE_URL_READONLY`, `BACKUP_PASSPHRASE`.
**Fix:** Create `.env.example` with placeholder values.
**Effort:** S

### L2. No API versioning

All routes are unversioned (`/api/patient` not `/api/v1/patient`). No strategy for breaking changes during rolling deploys.
**Fix:** Document as a known limitation. Consider versioning when the API stabilizes.
**Effort:** L

### L3. CalDAV `fetchCalendarObjects` fetches ALL objects for update/delete

`src/lib/caldav-client.ts:126-129` fetches every calendar object to find the one matching the UID. With many calendar events, this is slow.
**Fix:** Use `REPORT` with filter by UID.
**Effort:** M

### L4. Nullable FK fields that shouldn't be nullable

`prisma/schema.prisma`: `patientId Int?` on `Referral`, `ClinicalNote`, `PersonalNote`, `HearingAid`, `ClaimItem` — a clinical note without a patient is meaningless. These should be required.
**Fix:** Change `Int?` to `Int` (requires migration with data check).
**Effort:** S

### L5. No `onDelete` behavior specified on relations

If a patient is deleted, their appointments, notes, and attachments become orphaned (FK set to null). For clinical data, cascading delete is inappropriate — deletes should be soft-deletes or blocked.
**Fix:** Add `onDelete: Restrict` on clinical relations.
**Effort:** S

---

## Passed Checks

- `withErrorHandler` wraps all primary routes (via route factory or direct wrapping)
- Error responses don't leak internals (generic "Internal server error" with no stack traces)
- No empty catch blocks in `src/`
- Rate limiting on login (5/min) and AI endpoint (30/min)
- Destructive migration guard (refuses DROP TABLE/COLUMN without manual review)
- GPG-encrypted backups with `shred` cleanup of temp files
- Read-only DB role for AI queries (`prisma-readonly.ts`)
- Anti-caching headers on nurse and patient portals (`Cache-Control: no-store`)
- AI query results capped at 100 rows before Gemini
- Column redaction + pseudonymisation before AI disclosure
- Audit logging on: login, logout, patient record access, note creation, AI queries, backup export, external disclosure
- File upload: UUID prefix (safe for concurrency), MIME type allowlist, size limit (50MB), path traversal prevention
- Filename sanitisation on upload and download
- `X-Content-Type-Options: nosniff` on file downloads
- `Clear-Site-Data` header on logout
- Session revocation via DB record deletion
- Nurse idle timeout (10 minutes)
- Schema caching in memory (loaded once, reused)
- Login doesn't reveal whether email exists
- SQL safety validation on AI-generated queries
- Immutable entity support (blocks PUT/DELETE/import)
- Sensitive entity blocklist (blocks CRUD/export/import on auth tables)

---

## Recommended Implementation Order

### Batch 1 — Foundations (1 day)

Quick wins that harden the database, fix CI, and close deployment gaps. All items are small, independent, and can land in a single session.

| # | What | Dimension | Effort |
|---|------|-----------|--------|
| 1 | C3: Add `@unique` on `User.email`, `Patient.medicare_number`, `Nurse.email` | Data Integrity | S |
| 2 | C4: Add `@@index` on all FK columns | Performance | S |
| 3 | C5: Create `/api/health` endpoint + `HEALTHCHECK` in Dockerfile | Observability | S |
| 4 | H2: Move credentials to env vars in docker-compose | Deployment | S |
| 5 | H8: Fix proxy test mocks | Deployment | S |
| 6 | L1: Create `.env.example` | Deployment | S |
| 7 | M8: Add health check + `condition: service_healthy` to docker-compose | Deployment | S |

**Exit criteria:** All tests green, `docker compose up` works with `.env` file, DB has proper constraints and indexes.

---

### Batch 2 — Operational Safety (1-2 weeks)

Fixes the ways the system can break under real-world usage: concurrent writes, large datasets, crashes, and missing visibility. Each item is 1-2 days and independent of the others (except H4 which depends on C1).

| # | What | Dimension | Depends On |
|---|------|-----------|------------|
| 8 | C1: Add pagination to `findAll()` and all list endpoints | Performance | — |
| 9 | H4: Split `buildIncludes` — flat on list, relations on detail | Performance | C1 |
| 10 | H1: Stream file downloads | Performance | — |
| 11 | H3: Multi-stage Dockerfile | Deployment | — |
| 12 | H5: Add `error.tsx` error boundaries | Reliability | — |
| 13 | H6: Add process-level exception handlers | Reliability | — |
| 14 | C2: Wrap multi-step writes in `$transaction` | Data Integrity | — |
| 15 | M6: Combine ownership check + update in nurse routes | Concurrency | — |
| 16 | M3: Audit log CalDAV failures | Observability | — |
| 17 | M10: Add query timeout on AI readonly connection | Performance | — |
| 18 | M9: Expand CI (lint, build, E2E, secret scanning) | Deployment | — |

**Exit criteria:** List endpoints paginated, no unbounded queries, file downloads streamed, multi-step writes transactional, CI pipeline covers lint + build + E2E, production Dockerfile is multi-stage.

---

### Batch 3 — Production Maturity (2-3 weeks)

Cross-cutting infrastructure for observability, conflict resolution, and resilience. These are larger initiatives that benefit from the Batch 2 foundations being in place.

| # | What | Dimension | Depends On |
|---|------|-----------|------------|
| 19 | M1: Structured logging (Pino + request context) | Observability | — |
| 20 | M4: Optimistic locking on PUT endpoints | Concurrency | — |
| 21 | M5: Idempotency keys on POST endpoints | Concurrency | — |
| 22 | M2: Retry with backoff on CalDAV + Gemini | Reliability | — |
| 23 | M7: CalDAV ETag conflict detection | Concurrency | M2 |

**Exit criteria:** All logs are structured JSON with request IDs, concurrent edits return 409 instead of silently overwriting, POST endpoints are idempotent, external calls retry on transient failure, CalDAV sync uses ETags for conflict detection.
