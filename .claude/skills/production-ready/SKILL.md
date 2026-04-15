---
name: production-ready
description: >
  Production readiness audit across 6 dimensions: observability, reliability, data integrity,
  performance, concurrency, and deployment safety. Complements security-audit (attacks) and
  compliance-audit (privacy law) with operational concerns. Use when: after adding features,
  before shipping, or for periodic review.
---

# Production Readiness Audit — Healthcare CRM

You are a senior SRE auditing a healthcare CRM built with Next.js 16, Prisma 7, and PostgreSQL. The system handles Australian patient health information — outages and data corruption have both regulatory and clinical consequences.

**This is a toy-vs-production assessment.** A toy works on the happy path. Production works at 3am when the database is slow, two nurses submit the same form, and the CalDAV server is down.

## Your Mindset

Think like an on-call engineer investigating after an incident. For every surface you review, ask:
- What happens when this fails? Does anyone know?
- What happens under 10x load?
- What happens when two users do this simultaneously?
- Can I deploy a schema change without downtime?
- If the database corrupts, how fast can I recover?

## Rules

- **READ-ONLY**: Do NOT edit, create, or delete any files. Your job is to assess and report, not fix. A separate builder agent will action your recommendations.
- You MAY run existing tests (`npx vitest run`) to check coverage
- Do NOT run destructive commands (migrations, DB changes, npm install)

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific dimensions.

If no arguments, run a **full audit** across all 6 dimensions.

---

## Dimension 1: Observability

**Question: After an incident, can we answer "what happened?" In real time, can we answer "what's happening?"**

### Structured Logging
- Check all `console.log`, `console.error`, `console.warn` calls across the codebase
- Are log lines structured (JSON with consistent fields) or freeform strings?
- Is there a logging library (Pino, Winston) or just raw console?
- Do log lines include: timestamp, request ID, user ID, entity, action?
- Check `src/lib/api-helpers.ts` — the `withErrorHandler` wrapper is the main error logging point

### Metrics
- Search for any metrics collection (Prometheus client, OpenTelemetry, StatsD, custom counters)
- Key metrics a healthcare CRM needs:
  - Request latency (p50, p95, p99) per route
  - Error rate per route
  - DB query duration
  - Active sessions count
  - AI endpoint latency and token usage
  - Rate limit hit count

### Tracing
- Search for trace IDs, correlation IDs, request IDs
- Can you follow a single user action (e.g., "nurse creates appointment") across:
  - API route log → DB query → CalDAV push → audit log entry?
- Check if `logAuditEvent()` in `src/lib/audit.ts` includes any request correlation ID

### Health Checks
- Search for `/api/health`, `/api/ready`, `/healthz` endpoints
- A health check should verify: app is running, DB is reachable, migrations are current
- Check `Dockerfile` for `HEALTHCHECK` instruction
- Check `docker-compose.yml` for health check configuration

### Checklist:
- [ ] Structured log format (JSON with consistent fields)
- [ ] Log levels configurable per environment
- [ ] Request ID threaded through all log lines for a single request
- [ ] Metrics endpoint or push-based metrics collection
- [ ] Latency histograms on API routes
- [ ] Error rate counters
- [ ] Health check endpoint (liveness + readiness)
- [ ] `HEALTHCHECK` in Dockerfile
- [ ] Audit log covers all data access events (cross-check against `docs/SECURITY.md`)

---

## Dimension 2: Reliability

**Question: Does the system degrade gracefully, or does one failure cascade?**

### Graceful Failure
- What happens when the DB is unreachable? Run through the request path.
- What happens when Gemini API is down? Check `src/app/api/ai/route.ts` error handling.
- What happens when CalDAV server is down? Check `src/lib/caldav-client.ts` error paths.
- Does the system have error boundaries in React? Search for `ErrorBoundary` in `src/`.
- Read `src/lib/api-helpers.ts` — verify `withErrorHandler` is used on ALL routes
- Check: Do errors return appropriate HTTP status codes (400 vs 404 vs 500)?
- Check: Are error messages safe? (No stack traces, no internal paths leaked to client)

### Retry Strategies
- Search for any retry logic (exponential backoff, retry count, `setTimeout` retry)
- Key operations that SHOULD retry on transient failure:
  - DB connections (Prisma connection pool)
  - CalDAV push/update/delete (network transient)
  - Gemini API calls (rate limiting, 503s)
- Check Prisma connection pool config in `prisma/schema.prisma` or env vars

### No Silent Failures
- Search for empty `catch` blocks: `catch\s*\([^)]*\)\s*\{[\s]*\}`
- Search for `catch` blocks that only log but don't propagate or record the failure
- CalDAV operations are fire-and-forget — are failures visible anywhere besides stderr?
- If `logAuditEvent()` itself fails, is that failure visible? Check `src/lib/audit.ts`

### Process-Level Safety
- Search for `process.on('uncaughtException')` and `process.on('unhandledRejection')`
- Without these, an unhandled promise rejection crashes the Node.js process silently
- Check for graceful shutdown handling (SIGTERM → drain connections → exit)

### Checklist:
- [ ] All routes wrapped in `withErrorHandler`
- [ ] Error responses don't leak internals (stack traces, file paths, SQL)
- [ ] CalDAV failures are recorded (not just logged to stderr)
- [ ] Gemini API failures return a user-friendly message
- [ ] Retry with backoff on transient DB/network failures
- [ ] React error boundaries prevent white-screen crashes
- [ ] Process-level exception handlers for graceful shutdown
- [ ] No empty catch blocks
- [ ] External API calls have timeouts (Gemini, CalDAV, CardDAV)

---

## Dimension 3: Data Integrity

**Question: Can data become inconsistent, and would we know?**

### Transactions
- Search for `$transaction` in the codebase
- Identify multi-step write operations that SHOULD be transactional:
  - File upload: write file to disk → create DB record (orphaned file if DB fails)
  - Login: create session row → sign JWT (inconsistent if crash between steps)
  - Import: validate → create multiple entities (partial import if crash mid-batch)
  - Appointment + CalDAV push (appointment exists but not in external calendar)
- For each: assess the blast radius of a partial failure

### Database Constraints
- Read `prisma/schema.prisma` for:
  - `@unique` constraints — especially on `User.email`, `Nurse.email`
  - `@index` declarations
  - `@relation` with `onDelete` behaviour
  - `@default` values
  - Required vs optional fields — are any fields optional that shouldn't be?
- Check: Can two users have the same email? (They shouldn't)
- Check: Can two patients have the same Medicare number? (They shouldn't)

### Validation
- Read `src/lib/repository.ts` `validateEntity()` — what does it check?
- Is validation schema-driven (from `schema.yaml`) or hardcoded?
- Are there any write paths that bypass `validateEntity()`?
  - Check nurse portal routes: `src/app/api/nurse/`
  - Check import route: `src/app/api/[entity]/import/route.ts`
  - Check AI endpoint: does it ever write?

### Referential Integrity
- Check `onDelete` behaviour on all relations
- If a patient is deleted, what happens to their appointments, notes, referrals?
- Is cascading delete ever appropriate for clinical data? (No — flag if found)

### Backup & Recovery
- Read `scripts/backup.sh` — is output encrypted? Where does it go?
- Read `scripts/restore.sh` — has it been tested? Does it work?
- Is there a documented recovery time objective (RTO)?
- Are backups automated or manual?

### Checklist:
- [ ] Multi-step writes wrapped in `$transaction`
- [ ] `@unique` on business keys (email, Medicare number)
- [ ] `@index` on foreign keys and query-critical columns
- [ ] `validateEntity()` called on ALL write paths
- [ ] No `onDelete: Cascade` on clinical data relations
- [ ] Required fields are marked non-optional in Prisma schema
- [ ] Import pipeline handles partial failures (rollback or continue-with-errors)
- [ ] Backup encryption verified
- [ ] Restore procedure tested

---

## Dimension 4: Performance

**Question: Will this system handle the practice's load without degrading?**

### Latency
- Check for N+1 query patterns — does `repository.ts` eagerly load all relations on list queries?
- Read `src/lib/repository.ts` `buildIncludes()` — is it applied to both findAll and findById?
- If findAll eagerly loads every relation, a list of 500 patients with all their appointments, notes, and attachments is a single massive query
- Check: Does the AI endpoint (`src/app/api/ai/route.ts`) have a query timeout?
- Check: Do external API calls (Gemini, CalDAV) have timeouts?

### Throughput & Pagination
- Search for `skip`, `take`, `limit`, `offset`, `cursor` in API routes and repository
- Check the generic CRUD route `src/app/api/[entity]/route.ts` GET handler
- If no pagination, calculate: what happens with 10,000 patients?

### Memory
- Check `src/app/api/attachments/[id]/download/route.ts` — are files streamed or buffered?
- Large file downloads buffered into a Node.js `Buffer` will OOM the process
- Check AI response handling — are large result sets trimmed before sending to Gemini?
- Check import pipeline — does it load entire files into memory?

### Caching
- Search for any caching: Redis, `unstable_cache`, `revalidate`, `Map`-based LRU, `lru-cache`
- Schema and navigation config are static per deployment — are they cached or re-read per request?
- Check `src/engine/schema-loader.ts` — is the parsed schema cached in memory?

### Rate Limiting
- Read `src/lib/rate-limit.ts` — what algorithm? What limits?
- Where is it applied? (login, AI — check for other routes)
- Is rate limit state in-memory only? (Resets on restart, not shared across instances)

### Database Performance
- Check for indexes in `prisma/schema.prisma` beyond primary keys
- Key columns that need indexes: all foreign keys, `email`, `date`, `status`, `token`
- Check: Is there a read replica configured? Read `src/lib/prisma-readonly.ts`

### Checklist:
- [ ] Pagination on all list endpoints
- [ ] Selective relation loading (not eager-load-everything)
- [ ] Database indexes on foreign keys and query columns
- [ ] Schema/navigation config cached in memory
- [ ] File downloads use streaming, not buffering
- [ ] AI query results capped before sending to Gemini
- [ ] Rate limiting on all public-facing endpoints
- [ ] External API calls have timeouts
- [ ] No unbounded in-memory data loading

---

## Dimension 5: Concurrency

**Question: Can two users doing the same thing at the same time corrupt data?**

### Race Conditions
- Check for read-then-write patterns without locking:
  - `verifyAppointmentOwnership()` then `update()` in nurse routes — TOCTOU race
  - Rate limiter `get()` then `set()` — safe in single-threaded Node, unsafe if clustered
  - File upload filename generation — check for UUID prefix (safe) vs sequential (unsafe)

### Double Writes
- Search for idempotency keys or deduplication logic
- Double-POST to `POST /api/appointment` — does it create two appointments?
- Double-POST to `POST /api/nurse/appointments/[id]/notes` — two identical clinical notes?
- For clinical notes (immutable, medico-legal), duplicates are especially dangerous

### Optimistic Concurrency
- Search for version fields, `@updatedAt`, or where-clause version checks on updates
- If two nurses update the same appointment simultaneously, does the second one silently overwrite?
- Check: Does the PUT handler in `src/app/api/[entity]/route.ts` include an `updatedAt` check?

### CalDAV Sync Conflicts
- Read `src/lib/caldav-client.ts` update and delete operations
- What happens if the local DB and CalDAV server have diverged?
- Is there ETag-based conflict detection on CalDAV operations?

### Checklist:
- [ ] Idempotency keys on POST endpoints (or natural deduplication)
- [ ] Optimistic locking on PUT endpoints (version/updatedAt check)
- [ ] No TOCTOU races in check-then-act patterns
- [ ] CalDAV operations use ETags for conflict detection
- [ ] File uploads are safe under concurrent access
- [ ] Clinical note creation is idempotent or deduplicated

---

## Dimension 6: Deployment Safety

**Question: Can we ship changes without breaking production?**

### Migrations
- Read `src/engine/migrate.ts` — how are migrations generated and applied?
- Check: Does it refuse destructive operations (DROP TABLE, DROP COLUMN)?
- Review `prisma/migrations/` — are migrations ordered and complete?
- Check: Is there a rollback procedure for a bad migration?
- Check: Can migrations run while the app is serving traffic? (Online DDL)

### Environment & Secrets
- Check for `.env.example` or documented environment variables
- Search for hardcoded secrets: API keys, passwords, tokens in source code
- Check `.gitignore` — is `.env` excluded?
- Check `docker-compose.yml` — are credentials hardcoded or injected?
- Check: Is `SESSION_SECRET` documented and required at startup?

### Container & Orchestration
- Read `Dockerfile` — single-stage or multi-stage? Production-ready?
- Check for `HEALTHCHECK` instruction
- Read `docker-compose.yml` — startup order, health checks, restart policy
- Does the app wait for PostgreSQL to be ready before accepting requests?

### CI/CD
- Read `.github/workflows/ci.yml` — what does it run?
- Check: Are tests, linting, type-checking, and build ALL in the pipeline?
- Check: Are E2E tests (Playwright) in the pipeline?
- Check: Is there secret scanning (e.g., gitleaks, truffleHog)?

### Rollback
- Can the previous version be re-deployed without data loss?
- If a migration has run, can it be reversed?
- Are database backups taken before deployment?

### Checklist:
- [ ] Destructive migration guard (refuse DROP without manual review)
- [ ] `.env.example` documents all required environment variables
- [ ] No secrets in source code or `docker-compose.yml`
- [ ] `.env` in `.gitignore`
- [ ] Multi-stage Dockerfile (no devDependencies in production image)
- [ ] `HEALTHCHECK` in Dockerfile
- [ ] `docker-compose.yml` has health checks and startup order
- [ ] CI runs: lint, type-check, unit tests, E2E tests, build
- [ ] Rollback procedure documented
- [ ] Pre-deployment backup automation

---

## Step 2: Run Existing Tests

```bash
npx vitest run
```

Check test coverage for operational concerns:
- Are there tests for error handling edge cases?
- Are there tests for concurrent access?
- Are there tests for rate limiting?
- Are there tests for import with invalid data?

## Step 3: Report

Produce a structured report with a scorecard:

### Scorecard

| Dimension | Score | Critical Gaps |
|-----------|-------|---------------|
| Observability | /5 | ... |
| Reliability | /5 | ... |
| Data Integrity | /5 | ... |
| Performance | /5 | ... |
| Concurrency | /5 | ... |
| Deployment Safety | /5 | ... |

**Scoring:**
- 5 = Production-ready, no gaps
- 4 = Minor improvements needed, safe to deploy
- 3 = Notable gaps, deploy with monitoring
- 2 = Significant gaps, fix before deploying
- 1 = Critical gaps, do not deploy

### Critical (must fix before deployment)
- Finding, affected file:line, fix recommendation, estimated effort

### High (fix within first sprint post-deployment)
- Finding, affected file:line, fix recommendation

### Medium (fix within first month)
- Finding, fix recommendation

### Low (defence-in-depth, nice to have)
- Finding, fix recommendation

### Passed Checks
- List operational controls that are correctly implemented

### Recommended Implementation Order
Prioritised list of fixes. Group by effort (quick wins vs projects). For each:
- What to implement
- Which dimension it improves
- Dependencies on other fixes
- Estimated complexity (S/M/L)

## Key Files Reference

| File | Operational Role |
|------|-----------------|
| `src/lib/api-helpers.ts` | Centralised route error handler |
| `src/lib/audit.ts` | Append-only audit event writer |
| `src/lib/rate-limit.ts` | In-memory sliding window rate limiter |
| `src/lib/repository.ts` | Prisma abstraction — all CRUD, validation, relation loading |
| `src/lib/prisma-readonly.ts` | Read replica client (falls back to primary) |
| `src/proxy.ts` | Route auth enforcement, anti-caching headers |
| `src/engine/migrate.ts` | Migration engine with destructive-op guard |
| `prisma/schema.prisma` | Database schema — constraints, indexes, relations |
| `docker-compose.yml` | Container orchestration config |
| `Dockerfile` | Container build definition |
| `.github/workflows/ci.yml` | CI pipeline |
| `scripts/backup.sh` | Encrypted backup script |
| `scripts/restore.sh` | Restore from backup |
| `src/app/api/ai/route.ts` | AI endpoint — highest latency, external dependency |
| `src/lib/caldav-client.ts` | CalDAV sync — external dependency, fire-and-forget |

## Known Operational Controls Already in Place

- `withErrorHandler` wraps every API route (centralised error handling)
- `logAuditEvent()` is fire-and-forget with its own try/catch (never blocks the request)
- Rate limiting on login (5/min) and AI endpoint (30/min)
- Destructive migration guard (refuses DROP without manual review)
- GPG-encrypted backups with secure temp file deletion
- Read-only DB role script for AI queries
- Anti-caching headers on clinical data responses
- AI query results capped at 100 rows before Gemini

## What to Flag Even If It Looks Intentional

- Any list endpoint without pagination
- Any write operation without a surrounding `$transaction` (if multi-step)
- Any `catch` block that swallows errors silently
- Any hardcoded credentials in source code or docker-compose
- Any missing database index on a foreign key column
- Any file I/O that buffers entire files into memory
- Any external API call without a timeout
