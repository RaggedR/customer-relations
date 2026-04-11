# Plan: Data Interoperability — Sync, Import, Export

## Context

Clare's practice needs data flowing in and out: appointments syncing to nurses' Google Calendars, patient/nurse contacts syncing to phones, and the ability to import/export data in multiple formats from unknown source systems. Priority: sync first, then import/export.

### Architectural Decision: Schema-Driven Representations

Every entity has multiple external representations (vCard, iCal, CSV, JSON, PDF). These mappings belong in `schema.yaml` alongside the data model, not buried in code. The existing `carddav.mapping` is already this pattern — we generalise it into a `representations` block:

```yaml
patient:
  fields: ...
  relations: ...
  representations:
    vcard:
      mapping:
        name: FN
        phone: TEL
        email: EMAIL
        address: ADR
        date_of_birth: BDAY
    csv:
      headers:
        name: "Patient Name"
        phone: "Contact Number"
    json:
      include_relations: [referral, hearing_aid, clinical_note]

appointment:
  fields: ...
  relations: ...
  representations:
    ical:
      mapping:
        date: DTSTART_DATE
        start_time: DTSTART_TIME
        end_time: DTEND_TIME
        location: LOCATION
        notes: DESCRIPTION
      summary_template: "{patient.name} — {specialty}"
```

The import engine, export engine, CalDAV server/client, and CardDAV server/client all read these mappings from the schema. Adding a new export column or changing a vCard property = YAML edit, no code change.

This replaces the existing `carddav:` block — `representations.vcard:` is the new home for that config.

### Hearing Aid Sub-Objects
Database stays flat (14 columns, queryable by AI). JSON representation groups fields using `representations.json.groups`:
```yaml
hearing_aid:
  representations:
    json:
      groups:
        device: [make, model, serial_number]
        consumables: [battery_type, wax_filter, dome]
        programming: [programming_cable, programming_software]
        admin: [hsp_code, warranty_end_date, last_repair_details, repair_address]
```
Import flattens groups back into columns. Export groups columns into sub-objects.

### Document Export Convention
Patient data exports as a directory (or ZIP):
```
{patient-slug}/
  patient.json                                    ← structured data
  referral-letters/
    {date}-{original-filename}.pdf
  test-results/
    {date}-{original-filename}.pdf
  clinical-documents/
    {date}-{original-filename}.pdf
```
JSON contains relative `path` pointers to documents. On import, system looks for files at those relative paths.

### Patient/Nurse Fields
Fixed schema, but determined **after talking to Clare**. Current fields are a starting point. Schema-driven architecture means changing fields = edit YAML + restart.

### What Already Exists
- **CalDAV:** Nothing (discussed, deferred)
- **CardDAV:** `.well-known/carddav` stub redirects to non-existent `/api/carddav/`. Schema-loader has `CardDAVConfig`/`CardDAVMapping` types ready. No entity has `carddav:` configured yet.
- **Hearing aid export:** Done (xlsx/csv/json) at `/api/hearing-aid/export`
- **Hearing aid import:** Backend done (xlsx/csv/json), no UI
- **Patient export:** Done (json/pdf) at `/api/patient/[id]/export`
- **Patient import:** Not started
- **Generic import:** Not started

### Design Decisions
- **CalDAV:** Both client AND server. Client pushes appointments to Google Calendar. Server lets external apps subscribe to our calendar.
- **CardDAV:** Both client AND server. Client pushes contacts to Google Contacts. Server lets phones connect to us for contacts.
- **Import:** Format-agnostic, schema-driven. Handle whatever format the source system exports.
- **Source system:** Unknown — build to handle xlsx/csv/json generically

---

## Phase 0 — Representations Infrastructure

### 0.1 Extend schema types
**File:** `src/engine/schema-loader.ts`
- Replace `CardDAVConfig`/`CardDAVMapping` with generic `RepresentationsConfig`
- New types:
  ```typescript
  interface VCardRepresentation {
    mapping: Record<string, string>; // field → vCard property
  }
  interface ICalRepresentation {
    mapping: Record<string, string>; // field → iCal property
    summary_template?: string;
  }
  interface CsvRepresentation {
    headers?: Record<string, string>; // field → column header (defaults to field name)
  }
  interface JsonRepresentation {
    include_relations?: string[];
  }
  interface RepresentationsConfig {
    vcard?: VCardRepresentation;
    ical?: ICalRepresentation;
    csv?: CsvRepresentation;
    json?: JsonRepresentation;
  }
  ```
- Add `representations?: RepresentationsConfig` to `EntityConfig`
- Remove old `carddav?: CardDAVConfig` (replaced by `representations.vcard`)
- Update validation to check that mapped fields exist

### 0.2 Update schema.yaml
Add `representations` blocks to patient, nurse, and appointment entities. Remove old `carddav:` if any entity had it (none currently do).

### 0.3 Representation reader utility
**New file:** `src/lib/representations.ts`
- `getRepresentation(entityName, format)` — reads the mapping from cached schema
- Used by vcard.ts, ical.ts, parsers.ts, export routes

---

## Phase 1 — CalDAV Sync (Both Client and Server)

### 1A — CalDAV Client (push appointments to external calendars)

#### 1A.1 Install tsdav
```
npm install tsdav
```

#### 1A.2 Create CalDAV client utility
**New file:** `src/lib/caldav-client.ts`

Four functions, all async, all fail silently:
- `pushAppointment(calendarConnection, appointment, patient, nurse)` — creates VEVENT
- `updateAppointment(calendarConnection, appointment, patient, nurse)` — updates VEVENT
- `deleteAppointment(calendarConnection, appointmentId)` — deletes VEVENT
- `fetchBusySlots(calendarConnection, dateFrom, dateTo)` — reads events for availability

VEVENT format:
```
BEGIN:VCALENDAR
BEGIN:VEVENT
UID: appointment-{id}@customer-relations
DTSTART: {date}T{start_time}:00
DTEND: {date}T{end_time}:00
SUMMARY: {patient.name} — {specialty}
LOCATION: {location}
DESCRIPTION: {notes}
END:VEVENT
END:VCALENDAR
```

#### 1A.3 Wire into appointment routes
**Files:** `src/app/api/appointment/route.ts`, `src/app/api/appointment/[id]/route.ts`
- After create → look up nurse's calendar_connection → `pushAppointment()`
- After update → `updateAppointment()`
- After delete → `deleteAppointment()`
- All fire-and-forget (don't block the HTTP response)

#### 1A.4 Google OAuth2 flow (production)
**New files:**
- `src/app/api/nurse/[id]/connect-calendar/route.ts` — redirects to Google OAuth2 consent
- `src/app/api/auth/google/callback/route.ts` — exchanges code for tokens, stores in `calendar_connection`

Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
Google CalDAV endpoint: `https://apidata.googleusercontent.com/caldav/v2/`
Scopes: `https://www.googleapis.com/auth/calendar`

**UI:** Add "Connect Calendar" button to nurse detail panel. Shows "Connected" badge if `calendar_connection` exists.

### 1B — CalDAV Server (external apps subscribe to our calendar)

#### 1B.1 Serve calendar feeds
**New files under `src/app/api/caldav/`:**

| Method | Route | What it does |
|--------|-------|-------------|
| PROPFIND | `/api/caldav/` | List available calendars (one per nurse + one "all") |
| PROPFIND | `/api/caldav/{nurseId}/` | List events for a nurse's calendar |
| GET | `/api/caldav/{nurseId}/{appointmentId}.ics` | Individual VEVENT |
| PUT | `/api/caldav/{nurseId}/{appointmentId}.ics` | Create/update from external client |
| DELETE | `/api/caldav/{nurseId}/{appointmentId}.ics` | Delete from external client |
| REPORT | `/api/caldav/{nurseId}/` | Sync changes (calendar-multiget, sync-collection) |

Also update the existing `.well-known/caldav` to redirect here (currently only `.well-known/carddav` exists).

#### 1B.2 iCal feed (simple alternative)
**New file:** `src/app/api/calendar/[nurseId]/feed.ics/route.ts`

Serves a read-only `.ics` feed per nurse. Any calendar app can subscribe to this URL. Simpler than full CalDAV — no PROPFIND/REPORT, just a GET that returns all events as a VCALENDAR.

#### 1B.3 Auth
CalDAV server auth: Basic auth with env var `CALDAV_SERVER_PASSWORD`. Nurse adds the URL + password once.

### 1.test Test with Radicale (client) + macOS Calendar (server)
- **Client test:** Point a `calendar_connection` at Radicale → create appointment → VEVENT appears
- **Server test:** Add our CalDAV URL to macOS Calendar → appointments appear

---

## Phase 2 — CardDAV Sync (Both Client and Server)

### 2A — CardDAV Server (phones connect to us for contacts)

Clare adds our URL to her phone's contacts app → all patients and nurses appear.

### 2A.1 Add CardDAV mapping to schema.yaml
```yaml
patient:
  carddav:
    enabled: true
    mapping:
      name: "FN"
      phone: "TEL"
      email: "EMAIL"
      address: "ADR"
      date_of_birth: "BDAY"

nurse:
  carddav:
    enabled: true
    mapping:
      name: "FN"
      phone: "TEL"
      email: "EMAIL"
```

### 2A.2 Create CardDAV server routes
**New files under `src/app/api/carddav/`:**

The CardDAV protocol is HTTP + WebDAV extensions. Key methods:

| Method | Route | What it does |
|--------|-------|-------------|
| PROPFIND | `/api/carddav/` | List available address books |
| PROPFIND | `/api/carddav/patients/` | List patient contacts (vCards) |
| PROPFIND | `/api/carddav/nurses/` | List nurse contacts (vCards) |
| GET | `/api/carddav/patients/{id}.vcf` | Get individual patient vCard |
| GET | `/api/carddav/nurses/{id}.vcf` | Get individual nurse vCard |
| PUT | `/api/carddav/patients/{id}.vcf` | Update patient from phone edit (two-way sync) |
| REPORT | `/api/carddav/patients/` | Sync changes (multiget, sync-collection) |

### 2A.3 vCard generation from schema
**New file:** `src/lib/vcard.ts`

Reads the `carddav.mapping` from schema.yaml and generates vCard 3.0:
```
BEGIN:VCARD
VERSION:3.0
FN:Margaret Thompson
TEL:0412345678
EMAIL:margaret@example.com
ADR:42 Beach Rd, Frankston
BDAY:1945-03-15
UID:patient-21@customer-relations
REV:2026-04-10T12:00:00Z
END:VCARD
```

Schema-driven: the mapping config determines which fields become which vCard properties. Adding a field to the mapping = it appears in contacts.

### 2A.4 Authentication
Basic auth with env var `CARDDAV_PASSWORD`. Clare enters this once when adding the account to her phone.

### 2B — CardDAV Client (push contacts to external address books)

Push patient/nurse contacts to Google Contacts, iCloud, or any CardDAV server.

#### 2B.1 Create CardDAV client utility
**New file:** `src/lib/carddav-client.ts`

Uses tsdav (which supports both CalDAV and CardDAV):
- `pushContact(connection, entity, record)` — creates/updates vCard on external server
- `deleteContact(connection, entityName, id)` — deletes vCard
- `fetchContacts(connection)` — reads all contacts (for initial import)

#### 2B.2 Sync triggers
- On patient/nurse create → push vCard to connected address books
- On patient/nurse update → update vCard
- On patient/nurse delete → delete vCard
- Fire-and-forget, same pattern as CalDAV client

#### 2B.3 Contact connection entity
Add to schema.yaml:
```yaml
contact_connection:
  fields:
    provider: { type: enum, values: [google, apple, carddav_generic] }
    addressbook_url: { type: string }
    access_token: { type: string }
    refresh_token: { type: string }
    token_expiry: { type: datetime }
  relations:
    nurse: { type: belongs_to, entity: nurse }
```

Each nurse can connect their address book. Patient/nurse contacts get pushed to all connected address books.

### 2.test Test
- **Server:** Add CardDAV account in macOS Contacts → patients and nurses appear → edit a contact on phone → database updates
- **Client:** Connect to Radicale → create a patient → vCard appears in Radicale

---

## Phase 3 — Generic Import (Format-Agnostic)

### 3.1 Schema-driven import engine
**New file:** `src/lib/import.ts`

One function: `importEntities(entityName, data, options)`

- Accepts parsed data (array of row objects)
- Maps column names to schema fields using fuzzy header matching (case-insensitive, strip spaces/underscores)
- Validates each row against the entity schema
- Handles unknown fields: log them, skip them, or prompt user for mapping
- Upsert logic: configurable key fields (e.g. `name + date_of_birth` for patients)
- Returns `{ created, updated, skipped, errors[] }`

### 3.2 File parsers
**New file:** `src/lib/parsers.ts`

Parse any input format into row objects:
- **xlsx/xls** — ExcelJS (already a dependency)
- **csv** — hand-rolled or use existing csv parsing
- **json** — `JSON.parse()`, handle both array and `{ entities: [...] }` formats
- **vCard (.vcf)** — parse into field objects using the reverse of the CardDAV mapping

### 3.3 Generic import API route
**New file:** `src/app/api/[entity]/import/route.ts`

`POST /api/{entity}/import` (multipart form, field: `file`)
- Detects format from file extension
- Parses to row objects
- Calls `importEntities(entityName, rows)`
- Returns summary

### 3.4 No import UI needed
Import is just an API call. Any client (curl, script, browser, another system) can POST to `/api/{entity}/import`. No UI button required.

### 3.5 Schema adaptation
Robin's key concern: "depending on what form the data comes in we will need to change the fields."

Two approaches:
- **A) Map on import:** Unknown columns are ignored. User manually adds fields to schema.yaml first.
- **B) Auto-extend schema:** Unknown columns trigger a prompt: "The import file has columns X, Y, Z that don't exist in the schema. Add them?" If yes, append to schema.yaml and re-run the schema engine.

Recommend **A for MVP** (explicit schema control) with **B as a future enhancement**.

---

## Phase 4 — Generic Export (All Entities)

### 4.1 Extend generic export to all entities
**New file:** `src/app/api/[entity]/export/route.ts`

`GET /api/{entity}/export?format=xlsx|csv|json`
- Schema-driven: reads field definitions from schema.yaml
- Generates column headers from field names
- Includes related entities (e.g. patient export includes referrals, hearing aids)
- Reuse the patterns from the existing hearing-aid export

### 4.2 No export UI needed
Export is just an API call: `GET /api/{entity}/export?format=json`. Existing patient PDF/JSON export buttons already call the API. No new UI required.

---

## Files Summary

### New files
| File | Purpose |
|------|---------|
| `src/lib/caldav-client.ts` | CalDAV client — push appointments to external calendars |
| `src/lib/carddav-client.ts` | CardDAV client — push contacts to external address books |
| `src/lib/vcard.ts` | Schema-driven vCard generation/parsing |
| `src/lib/ical.ts` | VEVENT generation/parsing |
| `src/lib/import.ts` | Generic schema-driven import engine |
| `src/lib/parsers.ts` | File format parsers (xlsx/csv/json/vcf) |
| `src/app/api/caldav/**` | CalDAV server routes |
| `src/app/api/carddav/**` | CardDAV server routes |
| `src/app/api/calendar/[nurseId]/feed.ics/route.ts` | Read-only iCal feed per nurse |
| `src/app/api/nurse/[id]/connect-calendar/route.ts` | Google OAuth2 for calendar |
| `src/app/api/auth/google/callback/route.ts` | OAuth2 callback |
| `src/app/api/[entity]/import/route.ts` | Generic import endpoint |
| `src/app/api/[entity]/export/route.ts` | Generic export endpoint |
| `src/app/api/backup/route.ts` | JSON full-export for backup |
| `scripts/backup.sh` | pg_dump backup script |
| `scripts/restore.sh` | pg restore script |

### Modified files
| File | Change |
|------|--------|
| `schema.yaml` | Add `carddav:` mapping to patient and nurse |
| `navigation.yaml` | Add import/export features, connect-calendar button |
| `src/components/entity-detail-panel.tsx` | "Connect Calendar" button on nurse detail |
| `src/components/entity-search-panel.tsx` | Import/Export buttons |
| `src/app/api/appointment/route.ts` | Wire CalDAV push on create |
| `src/app/api/appointment/[id]/route.ts` | Wire CalDAV update/delete |

---

## Phase 5 — Database Backup & Recovery

### 5.1 Backup script
**New file:** `scripts/backup.sh`

```bash
pg_dump customer_relations > backup-$(date +%Y%m%d-%H%M%S).sql
```

Options:
- **Full dump** (SQL): `pg_dump` — portable, human-readable, can restore to any PostgreSQL
- **Custom format**: `pg_dump -Fc` — compressed, supports selective restore
- **JSON export**: dump all entities via the API — schema-agnostic, works even if PostgreSQL version changes

### 5.2 Restore script
**New file:** `scripts/restore.sh`

```bash
psql customer_relations < backup-file.sql
```

With safety: prompt for confirmation, check that the target database exists, option to restore to a different database name first (test the restore before overwriting production).

### 5.3 Scheduled backups
- Cron job or npm script: `npm run backup`
- Configurable destination: local directory, or push to cloud storage (S3, Google Cloud Storage)
- Retention: keep last N backups, delete older ones

### 5.4 Backup UI (optional)
Add to admin sidebar or settings:
- "Download Backup" button → triggers `pg_dump` → serves the SQL file as download
- "Restore from Backup" → file upload → confirms → runs restore
- Last backup timestamp visible

### 5.5 Backup via JSON export (schema-driven)
Alternative to `pg_dump` — export all entities as a single JSON file:
```json
{
  "exported_at": "2026-04-11T12:00:00Z",
  "schema_version": "current schema.yaml hash",
  "entities": {
    "patient": [...],
    "nurse": [...],
    "appointment": [...],
    ...
  }
}
```
This is more portable than `pg_dump` — it can be imported into a different database engine, or even a different system entirely. The import engine (Phase 3) already handles JSON.

---

## Implementation Order

```
Phase 0 — Representations Infrastructure
  0a. Extend schema-loader.ts types (RepresentationsConfig)
  0b. Add representations blocks to schema.yaml
  0c. src/lib/representations.ts (reader utility)

Phase 1 — CalDAV
  1a. npm install tsdav
  1b. src/lib/ical.ts (VEVENT generation)
  1c. src/lib/caldav-client.ts (push to external calendars)
  1d. Wire into appointment routes
  1e. CalDAV server routes (external apps subscribe to us)
  1f. iCal feed per nurse (simple read-only alternative)
  1g. Google OAuth2 routes
  1h. Test with Radicale (client) + macOS Calendar (server)

Phase 2 — CardDAV
  2a. Add carddav mapping to schema.yaml
  2b. src/lib/vcard.ts (vCard generation + parsing)
  2c. CardDAV server routes (phones connect to us)
  2d. src/lib/carddav-client.ts (push to external address books)
  2e. contact_connection entity + schema:generate
  2f. Wire push triggers on patient/nurse create/update/delete
  2g. Test with macOS Contacts (server) + Radicale (client)

Phase 3 — Import
  3a. src/lib/parsers.ts (xlsx/csv/json/vcf)
  3b. src/lib/import.ts (schema-driven upsert)
  3c. src/app/api/[entity]/import/route.ts
  3d. Import UI button

Phase 4 — Export
  4a. src/app/api/[entity]/export/route.ts (generic, all entities)
  4b. Export UI dropdown

Phase 5 — Backup & Recovery
  5a. scripts/backup.sh + scripts/restore.sh
  5b. npm run backup / npm run restore scripts
  5c. JSON full-export endpoint (/api/backup)
  5d. Scheduled backup (cron or startup hook)
```

---

## Verification

1. **CalDAV:** Create appointment → VEVENT appears in Radicale → edit appointment → VEVENT updates → delete → gone
2. **CardDAV:** Add account in macOS Contacts → patients and nurses appear → edit a contact → database updates
3. **Import:** Upload a CSV of patients → records created → upload same CSV → records updated (upsert)
4. **Export:** Download patient list as xlsx → open in Excel → all fields present
