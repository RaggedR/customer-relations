# Module Reference

Interface documentation for every module in the system. Organised by progressive disclosure:
1. **Quick Reference** — one-line summary per module
2. **Dependency Map** — how modules relate
3. **Detailed Interfaces** — full signatures, dependencies, and consumers

For architecture rationale (the *why*), see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Quick Reference

### Engine (internal — accessed only via Schema Facade)

| Module | Purpose | Exports |
|--------|---------|---------|
| `engine/schema-loader` | Parse + validate `schema.yaml` | `loadSchema`, `getSchema`, 11 types |
| `engine/field-types` | Field type registry (Prisma type, validation, HTML input, normalize) | `fieldTypes`, `getFieldType`, `validateFieldValue` |
| `engine/naming` | YAML ↔ runtime name conventions | `toPascalCase`, `toSnakeCase`, `reverseRelationKey`, `foreignKeyName` |
| `engine/prisma-generator` | YAML → `prisma/schema.prisma` | `generatePrismaSchema`, `writePrismaSchema` |
| `engine/migrate` | Safe auto-migration (blocks `DROP TABLE`/`DROP COLUMN`) | `runMigration`, `generatePrismaClient` |
| `engine/startup` | Orchestration: load → generate → migrate → client | `startupSchemaEngine` |

### Schema Facade (sole bridge to engine)

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/schema` | Single public interface for all schema functionality | ~20 re-exports + 7 own functions |

### Business Logic

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/repository` | Generic CRUD abstraction over Prisma | `findAll`, `findById`, `create`, `update`, `remove`, `validateEntity` |
| `lib/import` | Schema-driven import/upsert pipeline | `importEntities` |
| `lib/parsers` | File format parsing (CSV, XLSX, JSON, vCard) | `parseFile`, `detectFormat` |
| `lib/navigation` | Runtime navigation model (transitions, titles) | `transition`, `windowTitle`, 4 types |
| `lib/navigation-loader` | Server-side YAML loader for `navigation.yaml` | `loadNavigationYaml` |

### Security (independent of schema pipeline)

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/auth` | JWT session management + role hierarchy | `signSession`, `verifyToken`, `hasRole`, `requiresRole` |
| `lib/audit` | Append-only patient data access logging | `logAuditEvent` |
| `lib/sql-safety` | AI-generated SQL validation (defence in depth) | `validateAiSql` |
| `proxy` | Next.js global request interceptor (role-based access) | `proxy` |

### Interop (external format sync)

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/vcard` | Schema-driven vCard 3.0 generation and parsing | `generateVCard`, `generateVCards`, `parseVCard`, `parseVCards` |
| `lib/ical` | Schema-driven iCal VEVENT generation and parsing | `makeUid`, `generateVEvent`, `generateCalendarFeed`, `parseVEvent` |
| `lib/caldav-client` | Push/update/delete appointments on CalDAV servers | `pushAppointment`, `updateAppointment`, `deleteAppointment`, `fetchBusySlots` |
| `lib/carddav-auth` | Basic auth + address book resolution for CardDAV | `checkAuth`, `addressBookToEntity` |

### AI Support

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/name-resolution` | Fuzzy name matching via Levenshtein distance | `resolveNames`, `levenshtein` |

### API Layer

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/route-factory` | Generate standard CRUD route handlers | `makeListCreateHandlers`, `makeGetUpdateDeleteHandlers` |
| `lib/api-helpers` | Error handling wrapper for route handlers | `withErrorHandler` |
| `lib/generate-schema-description` | Schema → PostgreSQL DDL string for AI context | `generateSchemaDescription` |

### UI Support

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/renderers` | Field rendering (Strategy), entity summaries (Interpreter) | `renderFieldValue`, `renderEntitySummary`, `recordDisplayName`, 2 format helpers |
| `lib/layout` | Window geometry, typography, spacing constants | `layout`, `windowPosition` |

### Infrastructure

| Module | Purpose | Exports |
|--------|---------|---------|
| `lib/prisma` | PrismaClient singleton (Prisma v7 + driver adapter) | `prisma` |
| `lib/utils` | Tailwind class merging | `cn` |

### Hooks (UI state management)

| Module | Purpose | Exports |
|--------|---------|---------|
| `hooks/use-app-config` | Fetch schema + nav, derive hierarchy | `useAppConfig` |
| `hooks/use-window-manager` | Floating window state machine | `useWindowManager` |

---

## Dependency Map

```
┌────────────── src/engine/ (internal) ─────────────────┐
│  schema-loader ← field-types                          │
│  prisma-generator ← schema-loader, field-types, naming│
│  migrate (standalone — child_process only)             │
│  startup ← schema-loader, prisma-generator, migrate   │
│  naming (standalone — zero imports)                    │
└──────────────────────┬────────────────────────────────┘
                       │ (sole bridge)
                       ▼
           src/lib/schema.ts (Facade)
   ┌───────────┬───────┼────────┬──────────────┐
   ▼           ▼       ▼        ▼              ▼
repository  navigation import  parsers   generate-schema-
   │            │       │ ↘     ↗          description
   │            ▼       ▼  ▼  ▼
   │         layout  repository
   │
   │       renderers.tsx (React-aware)
   │            ↑ types from schema.ts
   ▼
route-factory ──→ api-helpers
   ↑
   ├─────────────────────────────────┐
   ▼                                 ▼
[entity]/route.ts             appointment/route.ts
patient/route.ts              calendar/route.ts
nurse/route.ts                carddav/route.ts
(shadow routes)               (specialized routes)

── Security stack (independent) ──

proxy.ts ──→ auth.ts         (standalone — no schema dependency)
audit.ts ──→ prisma.ts       (standalone — no schema dependency)
sql-safety.ts                (standalone — zero imports)

── Interop stack ──

vcard.ts ──→ schema.ts
ical.ts  ──→ schema.ts
caldav-client.ts ──→ ical.ts, repository.ts
carddav-auth.ts  (standalone — zero local imports)
```

Key properties:
- **No circular dependencies.** The graph is a clean DAG.
- **Single entry to engine.** Only `schema.ts` imports from `@/engine/`.
- **Security stack is independent.** Auth, audit, and SQL safety have no dependency on the schema or navigation layers.
- **High fan-in modules** (`schema`: ~21 importers, `repository`: ~13, `api-helpers`: ~14) are expected — all have stable interfaces.

---

## Detailed Interfaces

### Engine Layer

#### `engine/schema-loader`

Parse and validate `schema.yaml`. Caches the result for subsequent `getSchema()` calls.

```ts
function loadSchema(schemaPath?: string): SchemaConfig
function getSchema(): SchemaConfig

interface SchemaConfig { entities: Record<string, EntityConfig> }
interface EntityConfig {
  label?: string; label_singular?: string
  fields: Record<string, FieldConfig>
  relations?: Record<string, RelationConfig>
  representations?: RepresentationsConfig
  upsert_keys?: string[]; display?: DisplayConfig
  sidebar_addable?: boolean; exportable?: boolean
}
interface FieldConfig { type: string; required?: boolean; values?: string[] }
interface RelationConfig { type: "belongs_to"; entity: string }
interface DisplayConfig { title?: string; subtitle?: string | string[]; badge?: string; summary?: string; summary_max?: number; actions?: DisplayAction[] }
interface DisplayAction { label: string; href: string }
interface RepresentationsConfig { vcard?: VCardRepresentation; ical?: ICalRepresentation; csv?: CsvRepresentation; json?: JsonRepresentation }
```

**Depends on:** `engine/field-types` (for validation)
**Imported by:** `lib/schema` (Facade), `engine/prisma-generator`, `engine/startup`

---

#### `engine/field-types`

Field type registry. Each entry defines DB type, validation, HTML input, and optional normalization.

```ts
const fieldTypes: Record<string, FieldTypeDefinition>
function getFieldType(typeName: string): FieldTypeDefinition
function validateFieldValue(typeName: string, value: unknown, options?: { values?: string[] }): boolean

interface FieldTypeDefinition {
  prismaType: string
  validate: (value: unknown) => boolean
  htmlInputType: string
  normalize?: (value: unknown) => unknown
}
```

12 registered types: `string`, `text`, `email`, `phone`, `url`, `number`, `date`, `datetime`, `enum`, `boolean`, `time`, `json`.

**Depends on:** nothing
**Imported by:** `lib/schema` (Facade), `engine/schema-loader`, `engine/prisma-generator`

---

#### `engine/naming`

The contract between YAML names and runtime identifiers. Single source of truth for name transforms.

```ts
function toPascalCase(str: string): string          // "clinical_note" → "ClinicalNote"
function toSnakeCase(str: string): string            // "dateOfBirth" → "date_of_birth"
function reverseRelationKey(entityName: string): string  // "referral" → "referrals"
function foreignKeyName(relationName: string): string    // "patient" → "patientId"
```

**Depends on:** nothing
**Imported by:** `lib/schema` (Facade), `engine/prisma-generator`

---

#### `engine/prisma-generator`

Translates parsed `SchemaConfig` into a Prisma schema file.

```ts
function generatePrismaSchema(schema: SchemaConfig): string
function writePrismaSchema(schema: SchemaConfig): void
```

**Depends on:** `engine/schema-loader`, `engine/field-types`, `engine/naming`
**Imported by:** `engine/startup`

---

#### `engine/migrate`

Safe auto-migration. Blocks destructive operations (`DROP TABLE`/`DROP COLUMN`) — writes them to disk for manual review but does not apply.

```ts
function runMigration(): void
function generatePrismaClient(): void
```

**Depends on:** `child_process`, `fs`, `path` only (no local imports)
**Imported by:** `engine/startup`

---

#### `engine/startup`

Orchestrates the full startup sequence. Can be run as a script (`npx ts-node src/engine/startup.ts`).

```ts
function startupSchemaEngine(): void
```

**Depends on:** `engine/schema-loader`, `engine/prisma-generator`, `engine/migrate`
**Imported by:** entry point only (script execution)

---

### Schema Facade

#### `lib/schema`

The single public interface for all schema functionality. GoF Facade pattern — no code outside `src/engine/` should import from `@/engine/` directly.

**Re-exports from engine:**
- `getSchema`, `loadSchema`, `fieldTypes`, `getFieldType`, `validateFieldValue`
- `toPascalCase`, `toSnakeCase`, `reverseRelationKey`, `foreignKeyName`
- All type interfaces (`SchemaConfig`, `EntityConfig`, `FieldConfig`, etc.)

**Own logic:**

```ts
function deriveHierarchy(schema: SchemaConfig): SchemaHierarchy
function entityLabel(name: string, schema?: SchemaConfig): string
function entityLabelSingular(name: string, schema?: SchemaConfig): string
function getRepresentations(entityName: string): RepresentationsConfig | undefined
function getVCardRepresentation(entityName: string): VCardRepresentation | undefined
function getICalRepresentation(entityName: string): ICalRepresentation | undefined
function getCsvRepresentation(entityName: string): CsvRepresentation
function getJsonRepresentation(entityName: string): JsonRepresentation | undefined
function reverseMapping(mapping: Record<string, string>): Record<string, string>
function findReverseRelationKey(record: Record<string, unknown>, propertyEntity: string): string | null

interface SchemaHierarchy {
  firstOrder: string[]
  propertiesOf: Record<string, string[]>
  parentOf: Record<string, { entity: string; foreignKey: string }[]>
}
```

**Depends on:** `engine/schema-loader`, `engine/field-types`, `engine/naming`
**Imported by:** ~21 files (repository, navigation, import, parsers, renderers, route-factory, vcard, ical, generate-schema-description, most components, several API routes)

---

### Business Logic

#### `lib/repository`

Generic CRUD abstraction. Hides Prisma model lookup, include building, input transformation, and naming conventions.

```ts
function validateEntity(entityName: string, data: Record<string, unknown>): string[]
async function findAll(entityName: string, options?: {
  search?: string; sortBy?: string; sortOrder?: "asc" | "desc"
  filterBy?: Record<string, unknown>
  dateRange?: { field: string; from: string; to: string }
}): Promise<unknown[]>
async function findById(entityName: string, id: number): Promise<unknown | null>
async function create(entityName: string, data: Record<string, unknown>): Promise<unknown>
async function update(entityName: string, id: number, data: Record<string, unknown>): Promise<unknown>
async function remove(entityName: string, id: number): Promise<unknown>
```

`filterBy` accepts both schema relation names (`{ patient: 5 }`) and Prisma FK keys (`{ patientId: 5 }`).

**Depends on:** `lib/prisma`, `lib/schema`
**Imported by:** `lib/route-factory`, `lib/import`, `lib/caldav-client`, ~8 API routes

---

#### `lib/import`

Schema-driven import/upsert pipeline. Five stages: normalise headers → build relation maps → load existing → per-row process → report.

```ts
async function importEntities(entityName: string, rawRows: Row[], options?: ImportOptions): Promise<ImportResult>

interface ImportOptions { upsertKeys?: string[]; skipInvalid?: boolean }
interface ImportResult { total: number; created: number; updated: number; skipped: number; errors: string[] }
```

**Depends on:** `lib/schema`, `lib/repository`, `lib/parsers` (Row type)
**Imported by:** `app/api/[entity]/import/route.ts`

---

#### `lib/parsers`

Parse any file format into row objects. Auto-detects format from extension.

```ts
async function parseFile(buffer: Buffer, filename: string, entityName?: string): Promise<Row[]>
function detectFormat(filename: string): "xlsx" | "csv" | "json" | "vcf" | null

type Row = Record<string, unknown>
```

Supported formats: XLSX/XLS, CSV, JSON, vCard.

**Depends on:** `exceljs`, `lib/schema`
**Imported by:** `app/api/[entity]/import/route.ts`, `lib/import` (Row type)

---

#### `lib/navigation`

Runtime navigation model. Parses transitions and resolves window titles with template interpolation.

```ts
function transition(nav: NavigationConfig, key: { from: string; to: string }, ctx: TransitionContext, schema?: SchemaConfig): Omit<WindowState, "zIndex">
function windowTitle(nav: NavigationConfig, win: WindowState, schema?: SchemaConfig): string

interface NavigationConfig { windows: Record<string, WindowDef>; transitions: TransitionDef[] }
interface WindowDef { role: WindowRole; titleTemplate: string; component: string; features?: string[]; floating?: boolean }
interface TransitionDef { from: string; to: string; on: string; idTemplate: string }
interface WindowState { id: string; type: string; entityName?: string; entityId?: number; displayName?: string; propertyEntity?: string; parentKey?: string; label?: string; initialValues?: Record<string, string>; zIndex: number }
```

**Depends on:** `lib/layout` (WindowRole type), `lib/schema` (labels)
**Imported by:** `components/dashboard-shell`, `lib/navigation-loader`, `components/window-content`

---

#### `lib/navigation-loader`

Server-side YAML loader for `navigation.yaml`. Must NOT be imported from client components.

```ts
function loadNavigationYaml(): NavigationConfig
```

**Depends on:** `lib/navigation` (types), `lib/layout` (WindowRole)
**Imported by:** `app/api/navigation/route.ts`

---

### Security

#### `lib/auth`

JWT session management and role hierarchy. No framework dependency — pure cryptographic operations.

```ts
async function signSession(payload: SessionPayload, secret: string, expiresIn?: string): Promise<string>
async function verifyToken(token: string, secret: string): Promise<SessionPayload | null>
function hasRole(payload: SessionPayload, required: Role): boolean
function requiresRole(pathname: string): Role | null

type Role = "admin" | "nurse" | "patient"
interface SessionPayload { userId: string; role: Role }
```

Role hierarchy: admin (3) > nurse (2) > patient (1). Higher roles can access lower-role routes.

**Depends on:** `jose` (external JWT library only)
**Imported by:** `proxy.ts`

---

#### `lib/audit`

Append-only audit log for patient health information access. Fire-and-forget — never blocks the calling request.

```ts
async function logAuditEvent(event: AuditEvent): Promise<void>

interface AuditEvent { userId: string; action: string; entity: string; entityId: string; details?: string; ip?: string; userAgent?: string }
```

**Depends on:** `lib/prisma`
**Imported by:** `app/api/ai/route.ts`, `app/api/patient/[id]/export/route.ts`

---

#### `lib/sql-safety`

AI-generated SQL validation. Defence in depth — complements a read-only DB role.

```ts
function validateAiSql(sql: string): SqlValidationResult

interface SqlValidationResult { safe: boolean; reason?: string }
```

Five-stage pipeline: block comments → block multi-statement → require SELECT/WITH → scan for DML/DDL keywords (outside string literals) → block system catalog access.

**Depends on:** nothing (zero imports)
**Imported by:** `app/api/ai/route.ts`

---

#### `proxy`

Next.js 16 global request interceptor. Enforces role-based access and anti-caching headers for sensitive portals.

```ts
async function proxy(request: NextRequest): Promise<NextResponse>
const config: { matcher: string[] }
```

**Depends on:** `lib/auth`
**Imported by:** Next.js runtime (not statically imported by application code)

---

### Interop

#### `lib/vcard`

Schema-driven vCard 3.0 generation and parsing. Reads `representations.vcard.mapping` from `schema.yaml`.

```ts
function generateVCard(entityName: string, record: Row): string
function generateVCards(entityName: string, records: Row[]): string
function parseVCard(entityName: string, vcardText: string): Row
function parseVCards(entityName: string, text: string): Row[]
```

**Depends on:** `lib/schema`
**Imported by:** `app/api/carddav/` routes

---

#### `lib/ical`

Schema-driven iCal VEVENT generation and parsing. Reads `representations.ical` from `schema.yaml`.

```ts
function makeUid(entityName: string, id: unknown): string
function generateVEvent(record: Row, entityName?: string): string
function generateCalendarFeed(appointments: Row[], calendarName?: string): string
function parseVEvent(icalText: string, entityName?: string): Row
```

**Depends on:** `lib/schema`
**Imported by:** `lib/caldav-client`, `app/api/calendar/[nurseId]/feed.ics/route.ts`

---

#### `lib/caldav-client`

Push/update/delete appointments on external CalDAV servers (Google Calendar, Apple, Radicale). All operations fire-and-forget.

```ts
async function pushAppointment(appointment: Row): Promise<void>
async function updateAppointment(appointment: Row): Promise<void>
async function deleteAppointment(appointmentId: number, nurseId: number): Promise<void>
async function fetchBusySlots(nurseId: number, dateFrom: string, dateTo: string): Promise<{ start: Date; end: Date }[]>
```

**Depends on:** `tsdav`, `lib/ical`, `lib/repository`
**Imported by:** `app/api/appointment/route.ts`, `app/api/appointment/[id]/route.ts`

---

#### `lib/carddav-auth`

Basic auth and address book → entity name resolution for CardDAV routes.

```ts
function checkAuth(request: Request): boolean
function addressBookToEntity(addressbook: string): string | null
```

**Depends on:** nothing (reads `CARDDAV_PASSWORD` from env)
**Imported by:** `app/api/carddav/` routes

---

### AI Support

#### `lib/name-resolution`

Fuzzy name resolution for the AI query endpoint. Matches person names in natural language questions against the database using Levenshtein distance.

```ts
async function resolveNames(question: string): Promise<NameResolution>
function levenshtein(a: string, b: string): number

interface NameResolution { question: string; clarify?: string }
```

Distance thresholds: 0-1 = auto-resolve, 2-3 = ask user to confirm, >3 = no match.

**Depends on:** `lib/repository`
**Imported by:** `app/api/ai/route.ts`

---

### API Layer

#### `lib/route-factory`

Generates standard CRUD route handlers. Shadow routes (e.g. `patient/route.ts`) are 2-line re-exports from this factory.

```ts
function makeListCreateHandlers(entityName: string): { GET: RouteHandler; POST: RouteHandler }
function makeGetUpdateDeleteHandlers(entityName: string): { GET: RouteHandler; PUT: RouteHandler; DELETE: RouteHandler }
```

**Depends on:** `lib/schema`, `lib/repository`, `lib/api-helpers`
**Imported by:** `app/api/[entity]/route.ts`, `app/api/[entity]/[id]/route.ts`, `app/api/patient/route.ts`, `app/api/nurse/route.ts`, and their `[id]` variants

---

#### `lib/api-helpers`

Standardised error handling wrapper. Maps "Unknown entity"/"No Prisma model" errors to 404.

```ts
async function withErrorHandler(label: string, fn: () => Promise<NextResponse>): Promise<NextResponse>
```

**Depends on:** `next/server`
**Imported by:** `lib/route-factory`, ~13 API route files

---

#### `lib/generate-schema-description`

Converts the schema into a PostgreSQL DDL string for the AI query endpoint's system prompt. Single consumer — kept separate from the Facade to avoid bloating it with AI-specific logic.

```ts
function generateSchemaDescription(exclude?: string[]): string
```

Default excluded entities: `user`, `session`, `audit_log`, `calendar_connection`.

**Depends on:** `lib/schema`
**Imported by:** `app/api/ai/route.ts`

---

### UI Support

#### `lib/renderers`

Three GoF patterns: Strategy (field rendering), Interpreter (display DSL), Facade (schema access).

```ts
function renderFieldValue(value: unknown, field: FieldConfig, mode?: RenderMode): React.ReactNode
function renderEntitySummary(entityName: string, record: Record<string, unknown>, entityConfig: EntityConfig, mode?: RenderMode): EntitySummary
function recordDisplayName(record: Record<string, unknown>, entityConfig?: EntityConfig): string
function formatDateForInput(val: unknown): string
function formatDatetimeForInput(val: unknown): string

type RenderMode = "detail" | "list"
interface EntitySummary { title: React.ReactNode; subtitle?: React.ReactNode; badge?: React.ReactNode; summary?: React.ReactNode; actions?: Array<{ label: string; href: string }> }
```

**Depends on:** `lib/schema` (types only), `components/linkify`
**Imported by:** `components/entity-detail-panel`, `components/entity-search-panel`, `components/entity-form-panel`, `components/patient-property-panel`

---

#### `lib/layout`

All visual/spatial constants. Components import from here instead of hardcoding sizes.

```ts
type WindowRole = "search" | "detail" | "property" | "form" | "ai" | "calendar"

const layout: {
  sidebar: { widthClass: string; widthPx: number }
  window: {
    cascadeOffset: number; minSize: { width; height }; edgePadding: number; titleBarHeight: number
    sizes: Record<string, { width; height }>     // 5 roles (calendar excluded — not floating)
    positions: Record<string, { x; y }>
  }
  text: Record<string, string>       // Tailwind class presets
  spacing: Record<string, string>    // Tailwind class presets
}

function windowPosition(role: keyof typeof layout.window.positions, index: number): { x: number; y: number }
```

**Depends on:** nothing
**Imported by:** `lib/navigation`, `lib/navigation-loader`, `components/dashboard-shell`, `components/sidebar`, `components/floating-window`

---

### Infrastructure

#### `lib/prisma`

PrismaClient singleton. Uses Prisma v7 driver adapter (`PrismaPg`). Reused across hot reloads in development.

```ts
const prisma: PrismaClient
```

**Depends on:** `@prisma/client`, `@prisma/adapter-pg`
**Imported by:** `lib/repository`, `lib/audit`, `app/api/ai/route.ts`, `app/api/patient/[id]/export/route.ts`

---

#### `lib/utils`

Tailwind class merging utility.

```ts
function cn(...inputs: ClassValue[]): string
```

**Depends on:** `clsx`, `tailwind-merge`
**Imported by:** UI components (`button`, `input`, `label`, `dialog`, `separator`, `textarea`, `tooltip`), `app/layout.tsx`

---

### Hooks

#### `hooks/use-app-config`

Fetches schema and navigation config on mount, derives the entity hierarchy.

```ts
function useAppConfig(): AppConfig

interface AppConfig {
  schema: SchemaConfig | null
  nav: NavigationConfig | null
  hierarchy: SchemaHierarchy | null
}
```

**Depends on:** `lib/schema`, `lib/navigation`
**Imported by:** `components/dashboard-shell`

---

#### `hooks/use-window-manager`

Floating window state machine: open, close, focus, z-index tracking.

```ts
function useWindowManager(): WindowManager

interface WindowManager {
  openWindows: WindowState[]
  addWindow: (win: Omit<WindowState, "zIndex">) => void
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  navigate: (win: Omit<WindowState, "zIndex">) => void
}
```

**Depends on:** `lib/navigation` (WindowState type)
**Imported by:** `components/dashboard-shell`
