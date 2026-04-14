# Architecture

## Overview

This is a schema-driven healthcare CRM for a mobile audiology practice. It manages patients, clinical notes, appointments, hearing aids, referrals, billing claims, and nurse scheduling.

The architecture has **two independent dimensions** — a UI rendering pipeline and a security/compliance stack. They are orthogonal: changing a theme doesn't affect audit logging, adding a schema field doesn't change auth rules.

```
              UI Rendering Pipeline (vertical)
                        │
schema.yaml ──▶ engine ──▶ DB ──▶ repository ──▶ API routes ──▶ UI
                                                    │
                          Security/Compliance Stack (horizontal)
                          auth │ audit │ access control │ image render
```

---

## Dimension 1: UI Rendering Pipeline

Controls how data becomes pixels. Five layers, each with its own language and rate of change:

| # | Layer | File | Language | What changes | Change frequency |
|---|-------|------|----------|-------------|-----------------|
| 1 | Data model | `schema.yaml` | YAML | Add a field, add an entity | Weekly |
| 2 | Navigation model | `navigation.yaml` | YAML (directed graph) | Add a window type, change drill-down paths | Weekly |
| 3 | Layout | `src/lib/layout.ts` | TypeScript | Window sizes, positions, spacing | Monthly |
| 4 | Theme | `src/app/globals.css` | CSS custom properties | Colours, fonts | Rarely |
| 5 | Components | `src/components/*.tsx` | React/TypeScript | How things render | As needed |

### Why five layers?

Each layer can change independently. Adding a new entity (e.g., "invoice") means editing `schema.yaml` and `navigation.yaml` — no TypeScript, no React. The engine generates the Prisma schema, auto-migrates the database, and the generic CRUD API + UI components handle the rest.

### Schema engine (`src/engine/`)

The engine is the heart of the system. At startup (before the Next.js server starts), it:

1. **Loads** `schema.yaml` — validates entities, fields, relations, representations
2. **Generates** `prisma/schema.prisma` — translates YAML field types to Prisma types
3. **Migrates** the database — runs `prisma migrate diff` to compute SQL, then `prisma migrate deploy`. **Safety gate**: any migration containing `DROP TABLE` or `DROP COLUMN` is written to disk for manual review but NOT auto-applied
4. **Regenerates** the Prisma client

Key files:
- `schema-loader.ts` — parse + validate `schema.yaml`, type definitions
- `field-types.ts` — field type registry (maps `type: phone` → Prisma type, validation, HTML input type)
- `prisma-generator.ts` — YAML → Prisma schema
- `migrate.ts` — safe auto-migration with destructive operation blocking
- `startup.ts` — orchestration entry point

**No code outside `src/engine/` imports from `@/engine/` directly.** The Schema Facade (`src/lib/schema.ts`) is the sole bridge — see below.

### Schema Facade (`src/lib/schema.ts`) — GoF Facade pattern

The engine is an internal subsystem with three modules. The rest of the codebase (lib, API routes, components) accesses schema functionality exclusively through a single Facade module. This hides the engine's internal file structure — it could be refactored from 3 files to 10 without touching any consumer code.

```
┌───────────── src/engine/ (internal) ─────────────────────┐
│                                                           │
│   schema-loader.ts    field-types.ts    naming.ts         │
│   prisma-generator.ts    migrate.ts    startup.ts         │
│                                                           │
└─────────────────────────┬─────────────────────────────────┘
                          │
                          │  (single entry point)
                          ▼
    ╔═════════════════════════════════════════════════════╗
    ║                                                     ║
    ║   src/lib/schema.ts  (THE Facade)                   ║
    ║                                                     ║
    ║   Re-exports:     getSchema, loadSchema             ║
    ║                   types (EntityConfig, etc.)        ║
    ║                   fieldTypes, validateFieldValue    ║
    ║                   toPascalCase, toSnakeCase         ║
    ║                   reverseRelationKey, foreignKeyName║
    ║                                                     ║
    ║   Own logic:      deriveHierarchy (UI structure)    ║
    ║                   entityLabel, entityLabelSingular  ║
    ║                   get{Csv,VCard,ICal,Json}Rep...    ║
    ║                   reverseMapping                    ║
    ║                                                     ║
    ╚════════════════════════╤════════════════════════════╝
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         src/lib/       src/app/api/   src/components/
    (repository,       (route handlers) (React UI)
     import, parsers,
     navigation, etc.)
```

The Facade provides three categories of exports:

1. **Re-exports** from engine internals — `getSchema`, types, field-type registry, naming conventions. Consumers get what they need without knowing which engine file it lives in.
2. **Derived logic** — hierarchy derivation (which entities are first-order vs properties), display labels. These compute over the schema but aren't part of the engine's core responsibility.
3. **Representation getters** — `getCsvRepresentation`, `getVCardRepresentation`, etc. These adapt internal schema structure to external format expectations (an element of the GoF Adapter pattern within the Facade).

### Navigation model

The sidebar → popup → detail structure is a **directed graph** declared in YAML, not coded in TypeScript. `navigation.yaml` defines window types and legal transitions between them. The runtime navigation system (`src/lib/navigation.ts`) traverses this graph.

Key insight: the schema hierarchy (which entities appear in the sidebar vs as drill-down properties) is **derived at runtime** from `belongs_to` relations in `schema.yaml`. Entities with no `belongs_to` are first-order (sidebar). Entities that belong to a first-order entity are its properties.

### Representations

External format mappings (vCard, iCal, CSV, JSON) are declared in the `representations:` block of `schema.yaml`. The system reads these mappings to generate and parse external formats — no code changes needed to remap a vCard property or CSV column header.

---

## Dimension 2: Security/Compliance Stack

Controls who can see what, and what happens when they do. Required for Australian Privacy Act compliance (health information is "sensitive information" under APP 3).

### Three roles, three portals

| Role | Interface | Access scope |
|------|-----------|-------------|
| **Admin (Clare)** | Full CRM UI at `/(admin)` | Everything — patients, notes, billing, Medicare, audit logs |
| **Nurse** | Nurse portal at `/nurse` + Google Calendar | Assigned appointments, clinical/personal notes (by patient number only), cancel with reason |
| **Patient** | Patient portal at `/portal` | Browse available slots, book, view own appointments, cancel (24hr fee policy) |

```
src/app/
├── (admin)/     ← Clare's full dashboard (existing UI, wrapped in route group)
├── nurse/       ← Nurse portal: watermarked images, limited clinical access
└── portal/      ← Patient portal: self-service booking
```

### Auth (`src/proxy.ts` + `src/lib/auth.ts`)

Next.js proxy (renamed from middleware in v16) runs on every request. It inspects the URL path and enforces:
- `/(admin)/*` → requires admin session (Clare)
- `/nurse/*` → requires nurse session
- `/portal/*` → requires patient session
- `/api/*` → auth checked per endpoint

`src/lib/auth.ts` is the single source of truth for session creation, verification, and role checking. Not a framework — a module.

### Audit logging (`src/lib/audit.ts`)

Tracks **access to patient health information** only:
- Nurse viewed patient notes
- Nurse added a clinical/personal note
- Admin exported patient records
- Admin viewed Medicare numbers

Does NOT track: appointment bookings, confirmations, cancellations, login/logout.

Stored in a dedicated database table. Immutable — audit records are never deleted or modified.

### Nurse portal security controls

Clinical data displayed to nurses is protected by multiple layers:

1. **Pseudonymisation** — Appointment images show patient name (no clinical data). Note images show patient number only (no name). No single artefact links name to health information.
2. **Watermarked image rendering** (`src/lib/image-renderer.ts`) — All clinical content rendered as server-generated canvas images with nurse name + timestamp baked into pixels. NOT CSS overlays (trivially removed via dev tools).
3. **No copy/paste** — CSS `user-select: none` + JS event prevention on clinical content
4. **Aggressive anti-caching** — `Cache-Control: no-store`, `Pragma: no-cache`, `Clear-Site-Data` on logout
5. **Session-only access** — No service worker, no localStorage for clinical data, 10-minute idle timeout, no offline mode
6. **Audit logging** — Every patient record view/edit logged with nurse ID, patient ID, timestamp

### Clinical notes

- **Append-only** — Notes are immutable once created. The medico-legal standard. Corrections are new notes referencing the original.
- Nurses can create clinical and personal notes. Cannot edit or delete.
- Admin (Clare) can mark a note as retracted but the original text is never erased.
- Notes displayed to nurses show patient number only, never patient name.

### Encryption

- **In transit**: HTTPS everywhere
- **At rest**: Full-disk encryption on deployment machine (FileVault/LUKS). Column-level encryption is not needed for a single-practitioner practice.
- **Backups**: `scripts/backup.sh` output must be encrypted (gpg/openssl). Backups contain all patient data in plaintext.

### Email (`src/lib/email.ts`)

Stubs — interface defined, implementation deferred. Required emails:
- Cancellation notification to patient (with rebook link)
- Cancellation notification to admin (nurse name + reason)
- Appointment reminders (future feature)

---

## Appointment Lifecycle

```
Patient books slot on portal ──▶ status: requested
   ──▶ pushed to nurse's Google Calendar as iTIP invite
Nurse taps "Yes" in calendar app ──▶ CRM reads ACCEPTED ──▶ status: confirmed
Nurse cancels via portal (reason required) ──▶ status: cancelled
   ──▶ email to patient (rebook link)
   ──▶ email to admin (nurse name, reason)
Patient cancels via portal ──▶ status: cancelled
   ──▶ nurse notified
   ──▶ if within 24 hours: charged full fee
```

Nurses interact via **Google Calendar** for low-stakes actions (availability, confirm) and **the nurse portal** for high-stakes actions (cancel). The friction is proportional to the consequence.

### Scheduler

Computes available appointment slots by:
1. Reading nurse availability from Google Calendar free/busy (`VFREEBUSY`)
2. Reading nurse specialties from the `nurse_specialty` entity
3. Intersecting availability with requested specialty + date range
4. Tie-breaking: if multiple nurses available for the same slot, choose the nurse with fewest shifts that week

---

## Data Flow

### At startup

```
schema.yaml ──▶ schema-loader ──▶ prisma-generator ──▶ prisma/schema.prisma
                                                              │
                                                     prisma migrate diff
                                                              │
                                                     prisma migrate deploy
                                                              │
                                                     prisma generate
```

### At runtime (generic entity request)

```
GET /api/patient
      │
      ▼
proxy.ts ──▶ auth check (who is this? what role?)
      │
      ▼
[entity]/route.ts ──▶ audit.ts (if accessing patient data)
      │
      ▼
repository.ts ──▶ findAll(entityName)
      │
      ▼
Prisma client ──▶ PostgreSQL
      │
      ▼
JSON response (or watermarked image for nurse portal)
```

### At runtime (nurse viewing clinical notes)

```
GET /nurse/patient/1042/notes
      │
      ▼
proxy.ts ──▶ verify nurse session
      │
      ▼
audit.ts ──▶ log: "Nurse Sarah viewed patient #1042 notes"
      │
      ▼
repository.ts ──▶ fetch notes for patient 1042
      │
      ▼
image-renderer.ts ──▶ render each note as watermarked PNG
      │                 (nurse name + timestamp in pixels)
      ▼
Response with no-cache headers
```

---

## Directory Structure

```
customer-relations/
├── schema.yaml                  ← entity definitions (source of truth)
├── navigation.yaml              ← window types + transitions (UI source of truth)
├── docker-compose.yml           ← postgres:16 + app
├── Dockerfile
├── prisma/
│   └── schema.prisma            ← AUTO-GENERATED from schema.yaml, do not edit
├── scripts/
│   ├── backup.sh                ← pg_dump + JSON export (must encrypt output)
│   ├── restore.sh
│   └── seed.ts
├── src/
│   ├── engine/                  ← schema engine: load → generate → migrate
│   │   ├── schema-loader.ts
│   │   ├── field-types.ts
│   │   ├── prisma-generator.ts
│   │   ├── migrate.ts
│   │   └── startup.ts
│   ├── lib/                     ← business logic + cross-cutting concerns
│   │   ├── prisma.ts            ← PrismaClient singleton
│   │   ├── schema.ts            ← Schema Facade (GoF Facade pattern — sole bridge to engine)
│   │   ├── repository.ts        ← generic CRUD
│   │   ├── navigation.ts        ← runtime navigation model
│   │   ├── auth.ts              ← session management, role verification
│   │   ├── audit.ts             ← patient data access logging
│   │   ├── image-renderer.ts    ← watermarked canvas rendering
│   │   └── email.ts             ← notification stubs
│   ├── proxy.ts                ← global auth + anti-caching headers (Next.js 16 proxy)
│   ├── app/
│   │   ├── api/                 ← all API routes
│   │   │   ├── auth/            ← login/logout/session
│   │   │   ├── [entity]/        ← generic CRUD (catch-all)
│   │   │   ├── appointment/     ← specialized: CalDAV push
│   │   │   ├── backup/          ← full JSON export
│   │   │   ├── carddav/         ← CardDAV server
│   │   │   └── calendar/        ← iCal feeds
│   │   ├── (admin)/             ← Clare's dashboard (route group)
│   │   ├── nurse/               ← Nurse portal
│   │   └── portal/              ← Patient portal
│   └── components/              ← React components
├── docs/
│   ├── ARCHITECTURE.md          ← this file
│   └── SECURITY.md              ← security & compliance details
└── tests/
```

---

## Dependency Graph

Module-level dependency graph. Arrows point from consumer → dependency.

```
                    ┌───────────── src/engine/ (internal) ────────────┐
                    │  schema-loader   field-types   naming           │
                    │  prisma-generator   migrate     startup         │
                    └────────────────────┬───────────────────────────┘
                                         │ (sole bridge)
                                         ▼
                            src/lib/schema.ts (Facade)
                    ┌────────────┬───────┼────────┬──────────────┐
                    ▼            ▼       ▼        ▼              ▼
              repository    navigation  import  parsers   generate-schema-
                 │               │        │ ↘      ↗       description
                 │               ▼        ▼  ▼   ▼
                 │            layout   repository
                 │
                 │          renderers.tsx (Strategy + Interpreter patterns)
                 │               ↑ imports types from schema.ts
                 ▼
          route-factory ──→ api-helpers
                 ↑
    ┌────────────┼────────────────────────────┐
    ▼            ▼                            ▼
[entity]/    patient/route.ts            appointment/route.ts
route.ts     nurse/route.ts              calendar/route.ts
             (shadow routes)             carddav/route.ts
                                         (specialized routes)

  ── Security stack (independent) ──

  proxy.ts ──→ auth.ts        (standalone — no schema dependency)
  audit.ts ──→ prisma.ts      (standalone — no schema dependency)
  sql-safety.ts               (standalone — zero imports)
```

Key properties:
- **No circular dependencies.** The graph is a clean DAG.
- **Single entry to engine.** Only `schema.ts` imports from `@/engine/`.
- **Security stack is independent.** Auth, audit, and SQL safety have no dependency on the schema or navigation layers.
- **High fan-in modules** (schema: 21 importers, repository: 13) are expected — both have stable interfaces.

---

## Key Principles

1. **Schema is the source of truth.** Adding an entity or field should require only YAML edits in most cases. The engine, API, and UI derive behaviour from the schema.
2. **Navigation is data, not code.** The sidebar → window → detail structure is a directed graph in YAML, not TypeScript if-chains.
3. **Migrations never destroy data.** The engine blocks `DROP TABLE`/`DROP COLUMN` from auto-applying. Destructive changes require manual review.
4. **The two dimensions are independent.** UI rendering (schema → navigation → layout → theme → components) and security/compliance (auth → audit → access control → image rendering) can be worked on, tested, and reasoned about separately.
5. **Friction matches consequence.** Low-stakes nurse actions (confirm) happen in Google Calendar. High-stakes actions (cancel) require the portal. Clinical data is rendered as images, not selectable text.

---

## Design Decisions

Decisions that are implicit in the code but important for future contributors.

### Why shadow routes and the generic catch-all both exist

Next.js App Router routing precedence: a static directory (`patient/`) always beats the dynamic catch-all (`[entity]/`). Entities that have specialized sub-routes (e.g. `patient/[id]/export/`) require a static directory, which then shadows the generic CRUD. These shadow routes use the **route factory** (`src/lib/route-factory.ts`) — each is a thin 2-line re-export, not a logic copy.

The generic catch-all (`[entity]/route.ts`, `[entity]/[id]/route.ts`) also delegates to the same route factory. It handles entities that need only standard CRUD and have no specialized sub-routes. Both paths produce identical behaviour — the factory is the single source of truth for CRUD logic.

### Why `schema.ts` is the Schema Facade (GoF Facade pattern)

`src/lib/schema.ts` is the single public interface for all schema-related functionality outside `src/engine/`. No file in `lib/`, `app/api/`, or `components/` should import directly from `@/engine/` — everything goes through the Facade.

The engine is an internal subsystem (YAML loading, Prisma generation, migrations) with three modules (`schema-loader.ts`, `field-types.ts`, `naming.ts`). The Facade re-exports what consumers need and adds its own logic (hierarchy derivation, label helpers, representation getters). This means the engine's internal file structure can change without affecting any consumer code.

Previously this responsibility was split across two partial facades (`schema-hierarchy.ts` and `representations.ts`), and multiple API routes bypassed them by importing from `@/engine/` directly. The consolidation into one module seals the boundary: `@/engine/` imports appear only inside `schema.ts`.

The five representation getters (`getCsvRepresentation`, `getVCardRepresentation`, etc.) are intentionally one-liners. They trade function count for call-site clarity: callers name exactly which representation they need rather than navigating a generic accessor and optional-chaining through the result.

### Why `field-types.ts` couples DB, validation, UI, and normalization

The four concerns (Prisma type, validation function, HTML input type, persistence normalization) all vary together when a new field type is added. A single registry entry ensures they can't diverge — adding a `phone` type automatically activates phone validation and the `tel` input. The optional `normalize` function converts any accepted input representation to the canonical form Prisma expects (e.g. string or Date → Date for date fields), eliminating implicit format contracts between modules. Splitting into separate registries would require coordinated edits across multiple files for every new type.

### Why `audit.ts` swallows errors

Audit logging is fire-and-forget. If an audit write fails, the clinical operation has already completed. Blocking the response for an audit failure would be worse than the missing log entry — the failure is still logged to stderr for operational visibility.

### Import/upsert pipeline

The import engine (`src/lib/import.ts`) processes uploaded data in five stages:

1. **Normalise headers** — map column names to schema field names using the CSV representations and case-insensitive matching
2. **Build relation maps** — for each `belongs_to` relation, load all parent records and build a name→ID lookup
3. **Load existing records** — fetch all records of the target entity for upsert matching
4. **Per row**: resolve relations → coerce types → strip unknown fields → validate against schema → find existing record by upsert keys → create or update
5. **Report** — return counts of created, updated, skipped, and error messages

Upsert keys (which fields uniquely identify a record for update-vs-create decisions) are declared in `schema.yaml` under `upsert_keys:` per entity.

### Why `import.ts` owns header normalisation

`buildHeaderMap` and `normaliseRows` were originally in `parsers.ts` but moved to `import.ts`. Import is the sole consumer of header normalisation — having these functions in `parsers.ts` would have exported private helpers that leaked implementation detail about the import pipeline into an unrelated module. The move follows the information-hiding principle: private helpers belong in the module that uses them.

### Why no code outside `src/engine/` imports from `@/engine/` directly

The engine (`src/engine/`) is an internal subsystem — it loads YAML, generates Prisma schemas, and runs migrations. All non-engine code imports from the Schema Facade (`src/lib/schema.ts`) instead. This enforces the architectural layering: `components → lib → engine`, with `schema.ts` as the sole bridge. See "Why `schema.ts` is the Schema Facade" above.

### Why `engine/naming.ts` exists

The schema-driven architecture has an implicit contract: how YAML names map to runtime identifiers (Prisma model names, DB column names, FK fields, reverse-relation keys). These conventions are the most critical shared knowledge in the system — the Prisma generator, repository, import engine, and UI detail panel all need to agree on them.

`naming.ts` lives in the engine layer (not `lib/`) because the engine must be self-contained — it should never import from `lib/`. All four functions are re-exported through the Schema Facade (`lib/schema.ts`), which is the canonical import path for all consumers.

The four naming conventions:
- `toPascalCase(entityName)` — YAML entity → Prisma model name (e.g. `"clinical_note"` → `"ClinicalNote"`)
- `toSnakeCase(fieldName)` — YAML field → DB column name (e.g. `"dateOfBirth"` → `"date_of_birth"`)
- `reverseRelationKey(entityName)` — entity → Prisma reverse-relation field (e.g. `"referral"` → `"referrals"`)
- `foreignKeyName(relationName)` — relation → FK column name (e.g. `"patient"` → `"patientId"`)

### Why `generate-schema-description.ts` is a separate module

`generate-schema-description.ts` converts the schema into a PostgreSQL DDL string for the AI query endpoint's system prompt. It could live in the Schema Facade (`schema.ts`), but it has a single consumer (the AI route) and introduces its own concerns — Prisma-to-SQL type mapping and infrastructure entity exclusion — that are irrelevant to every other schema consumer. Keeping it separate avoids bloating the Facade with AI-specific logic.

### Why `navigation.transition()` takes `{ from, to }` not a string

The transition lookup uses a structured `{ from: "sidebar", to: "search" }` key rather than a concatenated string like `"sidebar→search"`. The structured form is type-safe, IDE-completable, and avoids a hidden dependency on a Unicode arrow character (U+2192) that would silently fail if mistyped.

### Why `renderers.tsx` lives in `lib/`, not `engine/`

The engine layer (`src/engine/`) is framework-free — no React dependency. The rendering module needs React for JSX output (badges, linkified text), so it sits one layer up in `lib/`. It imports types through the Schema Facade, preserving the architectural boundary: `components → lib → engine`.

The rendering strategy registry in `renderers.tsx` parallels the field-type registry in `engine/field-types.ts`. Both are indexed by the same field type strings. But they serve different layers: `field-types.ts` maps types to DB/validation/input concerns; `renderers.tsx` maps types to display concerns. Keeping them separate maintains the engine's framework independence.

### Why `display` metadata lives in `schema.yaml`, not TypeScript

The `display` block on entities (`title`, `subtitle`, `badge`, `summary`) follows the same pattern as the existing `representations` block — it's rendering metadata declared alongside the data model. A new entity's display can be configured with zero TypeScript changes. The schema loader already validates per-entity optional config blocks; `display` uses the same pattern.

Badge colors (e.g. `paid=emerald`, `rejected=red`) remain in TypeScript (`STATUS_COLORS` lookup in `renderers.tsx`) because they encode CSS semantics that belong in the presentation layer, not the data schema.

### Why hardcoded policies moved to YAML config

Three UI policies were previously hardcoded in `dashboard-shell.tsx`:
- `EXPORTABLE = new Set(["patient"])` → now `exportable: true` in `schema.yaml`
- `NON_FLOATING_ROLES = new Set(["calendar"])` → now `floating: false` in `navigation.yaml`
- `addableEntities` including `"appointment"` → now `sidebar_addable: true` in `schema.yaml`

These are configuration decisions, not code decisions. Declaring them in YAML means adding a new exportable entity or a new sidebar-addable child entity requires no TypeScript changes.

---

## GoF Design Patterns

Three Gang of Four patterns are applied in the rendering layer:

### Strategy Pattern — `src/lib/renderers.tsx`

The field-type rendering registry maps field type strings to render functions, parameterized by `RenderMode` (`"detail"` or `"list"`). This parallels the existing `field-types.ts` strategy table in the engine layer but produces React nodes instead of Prisma types.

```
Engine layer:  field-types.ts  →  { prismaType, validate, htmlInputType }  (framework-free)
Lib layer:     renderers.tsx   →  render(value, mode) → ReactNode          (React-aware)
```

Adding a new field type requires adding one entry to each registry — no component changes. Adding a new rendering mode (e.g. `"compact"`) requires one new branch inside the strategy, not changes at every call site.

### Interpreter Pattern — `schema.yaml` display blocks + `renderEntitySummary`

The `display` block in `schema.yaml` is a mini-DSL:
- `title: "name"` — field reference
- `title: "{ear} — {make} {model}"` — template expression with `{field}` interpolation
- `subtitle: [date, start_time]` — array of field references
- `badge: status` — enum field rendered as a colored pill
- `summary: content` / `summary_max: 100` — truncated text preview
- `actions: [{ label: "Download", href: "/api/attachments/{id}/download" }]` — URL-based actions with template interpolation

`renderEntitySummary` interprets this DSL into an `EntitySummary` data structure. Components destructure the result and apply their own layout. Adding a new entity's display requires only YAML — no TypeScript.

Entities without a `display` block get auto-derived summaries (first field as title, first enum as badge, first string/email as subtitle).

### Facade Pattern — `src/lib/schema.ts` (extended)

The Schema Facade was already the sole bridge to the engine. It now also exposes `DisplayConfig` types and `findReverseRelationKey` (the naming-convention heuristic for locating child arrays on API responses, previously duplicated in components).

---

## The DSL

The system has a domain-specific language. It is not configuration — configuration parameterizes fixed behavior. This DSL **generates** behavior: adding a new entity to `schema.yaml` creates database tables, API endpoints, UI windows, import/export capabilities, and validation rules. That is generative, not parametric.

### Source files

The DSL has two source files. They are the only files a practitioner needs to edit for most changes.

| File | What it expresses | Grammar |
|------|-------------------|---------|
| `schema.yaml` | Data model, field types, relations, display rendering, external format mappings, capabilities, upsert identity | Entity declarations |
| `navigation.yaml` | Window types, transition graph, UI features | Navigation flow |

### Grammar

The DSL's grammar has grown incrementally. Each grammar rule was added when a new behavioral dimension needed to be expressed declaratively rather than in TypeScript.

| Production rule | Syntax | Example | What it generates |
|----------------|--------|---------|-------------------|
| Entity + fields | `entity: { fields: { name: { type: string } } }` | `patient` | DB table, Prisma model, CRUD API, UI components |
| Relations | `relations: { patient: { type: belongs_to, entity: patient } }` | `referral → patient` | Foreign keys, includes, hierarchy derivation |
| Field types | `type: email` | `email` field | Prisma type, validation, HTML input, normalization |
| Display: title | `title: name` or `title: "{ear} — {make} {model}"` | Hearing aid title | Record display name, list rendering |
| Display: subtitle | `subtitle: [date, start_time]` | Appointment subtitle | Secondary text with field joining |
| Display: badge | `badge: status` | Claim item status pill | Colored enum rendering |
| Display: summary | `summary: content` / `summary_max: 100` | Clinical note preview | Truncated text |
| Display: actions | `actions: [{ label: Download, href: "/api/attachments/{id}/download" }]` | Attachment download | URL-based actions with template interpolation |
| Representations | `representations: { vcard: { mapping: { name: FN } } }` | Patient → vCard | Import parsing, export generation |
| Upsert keys | `upsert_keys: [name, date_of_birth]` | Patient identity | Import deduplication |
| Capabilities | `exportable: true`, `sidebar_addable: true` | Patient export button | UI feature flags |
| Window types | `search: { role: search, component: EntitySearchPanel }` | Search window | Window sizing, positioning, rendering |
| Transitions | `from: sidebar, to: search, on: click entity` | Sidebar → search | Legal UI navigation paths |

### Template interpolation

The DSL has a single expression syntax: `{field}` template interpolation. It appears in:

- **Display titles**: `"{ear} — {make} {model}"` → `"left — Phonak Audeo"`
- **Display actions**: `"/api/attachments/{id}/download"` → `"/api/attachments/42/download"`
- **Navigation IDs**: `"detail-{entity}-{id}"` → `"detail-patient-7"`
- **iCal summaries**: `"{patient.name} — {specialty}"` → `"John Smith — Audiology"`

This gives the language some expressiveness beyond flat configuration but keeps it far from Turing-complete.

### Compilation pipeline

The DSL is compiled by a pipeline distributed across modules. Each module is an interpreter for a different target domain.

```
schema.yaml + navigation.yaml              ← source code
        │
  schema-loader.ts                          ← parser + type checker
  (validates referential integrity:
   field refs, relation targets,
   enum values, representation
   mappings, upsert keys, display
   block references)
        │
  field-types.ts                            ← terminal symbol table
  (maps type names → Prisma type,           (12 entries: string, text,
   validation, HTML input, normalize)         email, phone, url, number,
        │                                     date, datetime, enum,
  naming.ts                                   boolean, time, json)
  (morphology: how names transform
   between YAML, Prisma, DB, and UI)
        │
  ┌─────┴────────────────────────┐
  │                              │
  prisma-generator.ts         renderers.tsx
  (schema → Prisma DDL)      (display DSL → React nodes)
  = code generator            = display interpreter
  │                              │
  repository.ts               navigation.ts
  (entity def → CRUD ops)    (transitions → window states)
  = persistence interpreter   = flow interpreter
  │
  import.ts
  (representations + entity def → upsert pipeline)
  = import/export interpreter
```

Each interpreter reads the same parsed AST (the `SchemaConfig` / `NavigationConfig` types) but produces different output for its target domain. The interpreters are independent — changing the display interpreter doesn't affect the persistence interpreter.

### Type checker

The `validateSchema` function in `schema-loader.ts` is the DSL's type checker. It enforces:

- Every field has a known type (terminal symbol validation)
- Every relation targets an existing entity (referential integrity)
- Every enum field has a `values` array (type-specific constraints)
- Representation mappings reference real fields (cross-block consistency)
- Upsert keys reference real fields or valid relation-name patterns
- Display blocks reference real fields (title, subtitle, badge, summary)
- Display actions have required `label` and `href` strings

Errors are reported with `Entity "name".field` paths — structured diagnostics, not generic parse failures.

### When to extend the grammar

Extend the DSL when:

1. **The behavior varies per entity** — if different entities need different values for the same behavioral dimension, it belongs in schema.yaml, not TypeScript.
2. **The behavior is data, not logic** — if it can be expressed as a field reference, a template string, or a flag, it's a grammar extension. If it requires conditionals or loops, it's an escape to TypeScript.
3. **More than one entity will use it** — a grammar rule for a single entity is premature abstraction.

Accept the TypeScript escape when:

1. **The behavior requires computation** — sorting algorithms, complex validation, third-party API calls. The DSL is declarative; computation belongs in the interpreters.
2. **The behavior is truly one-off** — if exactly one entity will ever need it, a hardcoded check is simpler than a grammar rule. But watch for the second instance — that's the signal to promote it.
3. **The behavior crosses interpreter boundaries** — if it requires coordination between the display interpreter and the persistence interpreter, it may be too complex for the DSL to express cleanly.

### Design principle

The DSL exists to solve one half of the expression problem: adding new entities is easy (write YAML, everything works). The other half — adding new behavioral dimensions — requires growing the grammar (new production rules, new type-checking, new interpreter logic). Each grammar extension should be driven by a concrete need, not anticipated future requirements.

The DSL's lifecycle stage is "mini-language" — it has template interpolation and structured declarations but no control flow. This is the right level of expressiveness for a domain-specific CRM configuration language. Resist the temptation to add conditionals.
