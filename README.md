# Customer Relations

A schema-driven healthcare CRM for a fictional Australian audiology practice. Built as a learning project to explore how far a declarative approach can take a full-featured clinical management system.

## What it does

The entire data model lives in `schema.yaml` -- entities, fields, relations, validation rules, and external format mappings (vCard, iCal, CSV, XLSX). A startup engine reads this file, generates the Prisma schema, and runs migrations automatically. The UI structure is similarly declared in `navigation.yaml`, which defines windows, transitions, visible fields, and portal layouts.

Three interfaces share the same backend:

- **Admin CRM** -- floating-window desktop UI for clinic staff. Search, detail panels, calendar, AI chat, PDF/XLSX export, file attachments.
- **Nurse portal** -- restricted view for clinicians. Availability management, patient records, pseudonymised clinical notes with watermarking and auto-close timers.
- **Patient portal** -- self-service appointment booking, profile management, appointment history.

### Notable features

- **AI natural-language queries** via Google Gemini -- translates questions to SQL with privacy guardsrails (data minimisation, off-topic refusal, fuzzy name matching)
- **CalDAV/CardDAV sync** -- bidirectional calendar and contact synchronisation
- **Privacy compliance** -- designed against the Australian Privacy Principles (APPs): three-role auth, audit logging, immutable clinical notes, encrypted backups, watermarked canvas rendering
- **Import/export** -- CSV, JSON, XLSX, PDF, vCard, iCal with foreign-key round-trip fidelity

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 via Prisma 7 |
| Styling | Tailwind CSS v4, shadcn/ui |
| AI | Google Gemini |
| Auth | Custom session + JWT (jose) |
| Email | Resend |
| Testing | Vitest (unit/integration), Playwright (E2E) |

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or Docker)

### With Docker

```bash
docker compose up
```

This starts PostgreSQL and the app on `http://localhost:3000`. Schema generation and migrations run automatically on startup.

### Without Docker

```bash
cp .env.example .env        # configure DATABASE_URL, SESSION_SECRET, etc.
npm install
npm run dev                  # generates schema, runs migrations, starts dev server
```

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session encryption key |
| `TOKEN_ENCRYPTION_KEY` | Yes | JWT token encryption |
| `GOOGLE_API_KEY` | No | Gemini AI chat |
| `CARDDAV_PASSWORD` | No | CalDAV/CardDAV sync |
| `BACKUP_PASSPHRASE` | No | Encrypted backup archives |
| `RESEND_API_KEY` | No | Transactional email |

## Project structure

```
schema.yaml              # Source of truth: data model
navigation.yaml          # Source of truth: UI structure
prisma/schema.prisma     # Auto-generated -- do not edit
src/
  engine/                # Schema engine: YAML -> Prisma -> migrations
  app/api/               # API routes (entity CRUD, auth, calendar, AI, backup)
  app/nurse/             # Nurse portal pages
  app/portal/            # Patient portal pages
  components/            # React components (calendar, AI chat, floating windows)
  lib/                   # Business logic (auth, audit, CalDAV, import/export, privacy)
  plugins/               # Plugin system
tests/
  unit/                  # ~25 unit tests (auth, schema, parsers, SQL safety, etc.)
  integration/           # Round-trip and edge-case tests
  e2e/                   # Playwright specs (CRUD, auth, calendar, security, fuzz)
```

## Testing

```bash
npm test                 # run all unit + integration tests
npm run test:watch       # watch mode
npx playwright test      # run E2E tests (requires dev server)
```

## Architecture

Two orthogonal dimensions define the system:

1. **UI rendering pipeline** -- schema.yaml -> navigation.yaml -> layout engine -> React components -> API routes. Adding a new entity or field is a YAML change, not a code change.

2. **Security/compliance stack** -- three-role auth (admin/nurse/patient), rate limiting, SQL injection prevention, audit logging, immutable clinical records, pseudonymised notes, watermarked rendering.

These intersect at the API layer, where route-factory.ts generates CRUD endpoints from the schema while the compliance middleware enforces access control and audit trails.

## License

[MIT](LICENSE)
