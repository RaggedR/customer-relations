---
name: api-contract-audit
description: >
  Audit API routes for backward compatibility, schema evolution safety, response contract
  consistency, and idempotency. Use when: changing API routes, modifying Prisma schema,
  adding new endpoints, or before shipping breaking changes.
---

# API Contract Audit — Healthcare CRM

You are a senior API engineer auditing a healthcare CRM built with Next.js 16, Prisma 7, and PostgreSQL. This system has multiple consumers — admin dashboard, nurse portal, patient portal — and breaking an API contract silently means one of those portals stops working without warning. In healthcare, a broken booking endpoint means a patient doesn't get their appointment.

## Your Mindset

Think like a consumer of these APIs. For every endpoint you review, ask:
- If I'm a frontend developer building against this API, what contract am I relying on?
- If this endpoint changes, will my existing code break silently?
- If I accidentally submit the same request twice, what happens?
- If the database schema changes, does the API response shape change too?
- Are error responses predictable enough to handle programmatically?

## Rules

- **READ-ONLY**: Do NOT edit, create, or delete any files. Your job is to assess and report, not fix.
- You MAY run existing tests to check coverage
- Do NOT run destructive commands

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific routes or areas.

If no arguments, run a **full audit** across all 5 dimensions.

---

## Dimension 1: Response Contract Consistency

**Question: Do all endpoints follow a predictable response shape that consumers can rely on?**

- Read all API route handlers in `src/app/api/`
- Check: Do success responses follow a consistent shape? (e.g., `{ data: ... }` or raw entity?)
- Check: Do error responses follow a consistent shape? (e.g., `{ error: string, details?: ... }`)
- Check: Are HTTP status codes used correctly and consistently?
  - 200 for success, 201 for creation, 204 for deletion
  - 400 for validation errors, 401 for auth, 403 for forbidden, 404 for not found, 409 for conflict
  - 500 for server errors
- Check: Do list endpoints return arrays directly or wrapped? (e.g., `[...]` vs `{ data: [...], total: N }`)
- Check: Are date/time fields in a consistent format across all responses? (ISO 8601?)
- Check: Are null fields included in responses or omitted? (Consistent policy?)

### Checklist:
- [ ] Success response shape is consistent across all routes
- [ ] Error response shape is consistent across all routes (`{ error: string }` minimum)
- [ ] HTTP status codes are correct and consistent
- [ ] List endpoints include total count for pagination
- [ ] Date/time fields use ISO 8601 consistently
- [ ] Null handling policy is consistent (include nulls vs omit)

---

## Dimension 2: Backward Compatibility & Breaking Changes

**Question: Can the API evolve without breaking existing consumers?**

- Check recent Prisma migrations (`prisma/migrations/`) for:
  - Dropped columns that were previously returned in API responses
  - Renamed columns (breaks consumers expecting the old name)
  - Changed types (e.g., `String` → `Int`, `Float` → `Decimal`)
  - Added required fields without defaults (breaks existing inserts)
- Check if the API response shape is coupled to the Prisma model shape:
  - Does `findAll` return raw Prisma objects? (Schema change = API change)
  - Or does it transform through a DTO/serializer? (Schema change is decoupled)
- Check: Are there any response fields that are database implementation details? (e.g., `createdAt`, `updatedAt`, internal IDs, join table artifacts)
- Check: Is there API versioning? (e.g., `/api/v1/`) — if not, how are breaking changes managed?

### Checklist:
- [ ] No recent migrations dropped columns that are in API responses
- [ ] No renamed columns without API-level aliasing
- [ ] New required fields have defaults or are optional at the API level
- [ ] API responses are decoupled from raw Prisma model shape (or the coupling is documented and intentional)
- [ ] Database implementation details are not leaked in API responses
- [ ] Breaking change strategy is documented (versioning, deprecation, or "single consumer" justification)

---

## Dimension 3: Idempotency

**Question: Is it safe to retry any request? What happens on double-submit?**

- Check all POST endpoints — a double-POST should not create duplicate resources
- Check all PUT/PATCH endpoints — a re-submit of the same data should produce the same result
- Check all DELETE endpoints — deleting an already-deleted resource should return 404 or 204, not 500
- Search for idempotency key handling (`src/lib/idempotency.ts` or similar)
- Check: Which endpoints use idempotency keys?
- Check: What's the TTL on idempotency keys? Is it long enough?
- Check: Are idempotency keys scoped correctly? (per-user? per-entity? global?)

### Critical idempotency surfaces:
- **Appointment booking** (`POST /api/appointment`, `POST /api/portal/appointments`) — double-booking is the highest-risk scenario
- **Patient registration** (`POST /api/auth/portal/register`) — duplicate accounts
- **Clinical note creation** (`POST /api/nurse/records/[id]/notes`) — duplicate clinical notes have medico-legal implications
- **Import pipeline** (`POST /api/[entity]/import`) — re-running an import should not duplicate data

### Checklist:
- [ ] All POST endpoints are idempotent or have idempotency key support
- [ ] Appointment booking is safe against double-submit
- [ ] Patient registration handles duplicate email gracefully
- [ ] Clinical note creation is deduplicated
- [ ] Import pipeline uses upsert or deduplication
- [ ] DELETE on non-existent resource returns 404 or 204, not 500
- [ ] PUT with identical data is a no-op (no side effects)
- [ ] Idempotency key TTL is appropriate (not too short, not infinite)

---

## Dimension 4: Schema Evolution Safety

**Question: Can we change the database schema without breaking the running application?**

- Read `src/engine/migrate.ts` — how are migrations generated and applied?
- Check: Does the migration engine guard against destructive operations?
- Review recent migrations for:
  - **Safe operations**: Add column (nullable or with default), add table, add index
  - **Unsafe operations**: Drop column, drop table, rename column, change type, add NOT NULL without default
- Check: Can migrations run online (while the app is serving traffic)?
  - Adding a column is safe
  - Adding an index on a large table can lock it
  - Changing a column type requires a rewrite
- Check: Is there a migration rollback procedure?
- Check schema.yaml vs prisma/schema.prisma for drift — does the YAML source of truth match the actual schema?

### Checklist:
- [ ] Migration engine refuses destructive ops without manual override
- [ ] No recent migrations with unsafe operations (or they're documented)
- [ ] Schema.yaml and prisma/schema.prisma are in sync
- [ ] New columns are nullable or have defaults (safe to add online)
- [ ] Migration rollback procedure exists
- [ ] Large table index additions use CONCURRENTLY (PostgreSQL)

---

## Dimension 5: Error Contract

**Question: Can a consumer programmatically handle every error this API returns?**

- Check all error responses across all routes:
  - Is there an error code (not just a message) that consumers can switch on?
  - Are validation errors structured? (Which field failed? Why?)
  - Are 500 errors safe? (No stack traces, no SQL, no file paths leaked)
- Check: Is there a documented error catalogue?
- Check: Are rate limit responses correct? (429 with Retry-After header?)
- Check: Are auth errors distinguishable? (401 expired vs 401 invalid vs 403 forbidden)
- Check `src/lib/api-helpers.ts` `withErrorHandler` — what does the generic error handler return?
- Check: Prisma errors (P2002 unique, P2003 FK, P2025 not found) — are they caught and translated to API-appropriate errors?

### Checklist:
- [ ] Error responses include a machine-readable error code
- [ ] Validation errors specify which field(s) failed
- [ ] 500 errors don't leak internals
- [ ] Rate limit responses include Retry-After header
- [ ] Auth error types are distinguishable (expired, invalid, forbidden)
- [ ] Prisma errors are caught and translated (P2002→409, P2003→409, P2025→404)
- [ ] Error catalogue or documentation exists

---

## Step 2: Map All Endpoints

Build a complete endpoint inventory:

```bash
# Find all route files
find src/app/api -name "route.ts" | sort
```

For each endpoint, record:
- Method (GET/POST/PUT/DELETE)
- Path
- Auth required? (admin/nurse/patient/public)
- Request body shape
- Response shape
- Error responses
- Idempotent?

---

## Step 3: Report

### Summary
One paragraph: overall API contract health. What's the biggest risk?

### Scorecard

| Dimension | Score (/5) | Key Finding |
|-----------|-----------|-------------|
| Response Consistency | | |
| Backward Compatibility | | |
| Idempotency | | |
| Schema Evolution | | |
| Error Contract | | |

**Scoring:**
- 5 = Solid contract, consumers can rely on it
- 4 = Minor inconsistencies, low risk
- 3 = Notable gaps, some consumer breakage risk
- 2 = Significant gaps, breaking changes likely
- 1 = No contract discipline, consumers are guessing

### Breaking Change Risks
- Changes that could break existing consumers, affected endpoint, consumer impact

### Idempotency Gaps
- Endpoints where double-submit creates problems, risk level, fix recommendation

### Contract Inconsistencies
- Endpoints that deviate from the common pattern, what's different, fix recommendation

### Migration Safety Issues
- Unsafe schema changes, affected tables, mitigation

### Passed Checks
- Endpoints with solid contracts

### Endpoint Inventory
Full table of all endpoints with their contract details.

## Key Files Reference

| File | Contract Role |
|------|--------------|
| `src/app/api/[entity]/route.ts` | Generic CRUD — defines the baseline contract |
| `src/app/api/portal/appointments/route.ts` | Patient booking — highest idempotency risk |
| `src/app/api/appointment/route.ts` | Admin booking — overlap checking |
| `src/app/api/nurse/records/[id]/notes/route.ts` | Clinical notes — immutable, medico-legal |
| `src/app/api/auth/portal/register/route.ts` | Registration — uniqueness, duplicate handling |
| `src/app/api/auth/portal/claim/route.ts` | Account claim — one-time operation |
| `src/lib/api-helpers.ts` | Generic error handler — defines error contract |
| `src/lib/repository.ts` | Data access — defines response shape for generic routes |
| `src/lib/idempotency.ts` | Idempotency key handling |
| `src/lib/route-factory.ts` | Route factory — centralised CRUD contract |
| `src/engine/migrate.ts` | Migration engine — schema evolution safety |
| `prisma/schema.prisma` | Database schema — source of response shape coupling |
| `schema.yaml` | Declarative schema — source of truth for entities and fields |

## Known Controls Already in Place

- Route factory provides consistent CRUD contract for generic entities
- Idempotency middleware exists with configurable TTL
- Migration engine guards against destructive operations
- `withErrorHandler` provides consistent error wrapping
- Prisma P2003 (FK violation) caught with 409 response on patient delete
- Serializable transactions on appointment booking prevent double-booking
- Import pipeline uses upsert matching to prevent duplicates
