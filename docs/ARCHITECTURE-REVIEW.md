# Architecture Review — 2026-04-14

Full review using Ousterhout's "A Philosophy of Software Design" principles.
Produced by `/architect` skill. Findings below are prioritised for action.

## Overall Verdict

The architecture is fundamentally sound. The two-dimensional model (UI pipeline × security stack) achieves real independence. The dependency graph is a clean DAG with no cycles. The schema-driven approach delivers on its promise.

**Strongest quality:** The schema engine pipeline (`loadSchema` → `writePrismaSchema` → `runMigration` → `generatePrismaClient`). Textbook deep-module design.

**Weakest quality:** Generic/specific duality — excellent generic components coexist with entity-specific duplicates that will drift.

---

## Priority Refactors

### P1: Generate AI Schema Description from schema.yaml — RESOLVED
- **Status:** Fixed. `generateSchemaDescription()` in `src/lib/generate-schema-description.ts` dynamically generates DDL from `getSchema()`. The hardcoded `SCHEMA_DESCRIPTION` was removed.

### P2: Eliminate Duplicate Entity-Specific Routes — RESOLVED
- **Status:** Fixed. The `hearing-aid/export/` and `hearing-aid/import/` routes were removed. Generic `[entity]/export` and `[entity]/import` handle all entities.

### P3: Extract Shared Entity Label Source of Truth — RESOLVED
- **Status:** Fixed. `schema.yaml` has `label` and `label_singular` fields. `entityLabel()` in `src/lib/schema.ts` reads from them. The duplicate `formatLabel` in navigation.ts was removed.

### P4: Extract CardDAV Auth to Shared Module — RESOLVED
- **Status:** Fixed. `checkAuth()` lives in `src/lib/carddav-auth.ts`, imported by all 3 carddav route files.

### P5: Narrow parsers.ts Public Interface — RESOLVED
- **Status:** Fixed. `buildHeaderMap` and `normaliseRows` are no longer exported.

### P6: Remove Dead Components — RESOLVED
- **Status:** Fixed. `PatientDetailPanel` and `PatientFormPanel` were deleted.

---

## Information Leaks Found

| # | What | Where | Severity |
|---|------|-------|----------|
| 1 | Duplicated entity label map | `navigation.ts` + `schema-hierarchy.ts` | HIGH |
| 2 | AI schema description is second source of truth | `ai/route.ts` SCHEMA_DESCRIPTION | HIGH |
| 3 | `field-types.ts` mixes DB + UI concerns | `htmlInputType` alongside `prismaType` | MEDIUM |
| 4 | `ical.ts` pretends to be generic | Hardcodes `"appointment"` entity name | MEDIUM |
| 5 | `toSnakeCase` defined in 4 places | repository.ts + 3 components | LOW |
| 6 | CalDAV/CardDAV connection types not exported | Local interfaces in 2 client modules | LOW |

---

## Repeated Code Patterns

| Pattern | Occurrences | Fix |
|---------|-------------|-----|
| try/catch → console.error → 500 response | 17 API routes | Extract `withErrorHandler` wrapper |
| Schema entity existence check | 9 API routes | Already in generic route; entity-specific routes duplicate it |
| Multipart form-data parse guard | 3 routes | Extract to shared middleware/helper |
| CardDAV `checkAuth()` | 3 carddav routes | Extract to `carddav-auth.ts` |
| `toSnakeCase()` utility | 4 files | Export from `src/lib/utils.ts` |

---

## Module Depth Assessment

| Module | Depth | Notes |
|--------|-------|-------|
| `sql-safety.ts` | ★★★★★ | Cleanest module. 1 export, pure, no deps |
| `import.ts` | ★★★★★ | 1 entry point hides 348 lines of complexity |
| `audit.ts` | ★★★★★ | 1 function, 35 lines, does one thing |
| `schema-loader.ts` | ★★★★ | Deep pipeline, but exports 12 types (too many) |
| `repository.ts` | ★★★★ | Good CRUD abstraction, clean interface |
| `auth.ts` | ★★★★ | 4 functions, each complete and independent |
| `parsers.ts` | ★★ | 8 exports, several are internal helpers |
| `representations.ts` | ★★ | 6 getters for what should be 1 generic getter |
| `field-types.ts` | ★★ | Mixes DB and UI concerns in one record |

---

## Interface Documentation Gaps

- `repository.ts` — `findAll` options (`filterBy`, `dateRange`, `sortBy`) undocumented
- `import.ts` — `upsertKeys` behaviour undocumented
- `parsers.ts` — `parseFile` return type and error behaviour undocumented
- `representations.ts` — behaviour when no representation block exists undocumented
- `caldav-client.ts` — error handling (all ops swallow errors) undocumented
- `proxy.ts` — hybrid session model (JWT in proxy, DB check in DAL) undocumented

---

## Design Decisions to Add to ARCHITECTURE.md

1. Why `patient/` and `nurse/` route directories exist (Next.js App Router constraint)
2. AI schema description is a second source of truth (tech debt, plan to auto-generate)
3. CalDAV/CardDAV sync is fire-and-forget (deliberate, don't block UI)
4. `$queryRawUnsafe` is used intentionally in AI endpoint (document mitigations)
