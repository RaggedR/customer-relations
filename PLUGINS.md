# Plugin Roadmap

All features beyond the skeleton's CRUD, UI, and CardDAV are plugins. Each plugin is independent and can be enabled/disabled without affecting the core.

The skeleton ships with a default `schema.yaml` that includes a `deal` entity with pipeline stages — this gives basic pipeline tracking without any plugin code.

---

## Phase 1 — Ingestion (get data in)

| Plugin | Description | Depends on |
|---|---|---|
| **ai-extract** | Shared Claude API extraction logic. Takes raw text, returns structured entity data. | — |
| **email-ingest** | Forward/connect email → AI extracts contacts + logs interactions | ai-extract |
| **csv-import** | Bulk import contacts from spreadsheets | — |
| **ocr-ingest** | Upload image → Tesseract OCR → AI extracts contact data (business cards, invoices) | ai-extract |
| **stt-ingest** | Upload phone call recordings → Whisper STT → AI extracts notes + action items | ai-extract |
| **web-form** | Embeddable form for your website → creates contact/lead in CRM | — |
| **api-ingest** | Webhook/API endpoint for external systems to push data in | — |

## Phase 2 — Analytics (your stated needs)

| Plugin | Description | Depends on |
|---|---|---|
| **demographics** | Segment clients by location, industry, spend level. Dashboard widgets. | — |
| **payment-tracker** | Track invoices, flag overdue payments, aging reports | — |
| **marketing-attribution** | Tag contacts with source (Google Ads, referral, etc.), measure ROI per channel | — |
| **reporting** | Custom reports and dashboards, export to PDF/CSV | — |

## Phase 3 — Communication

| Plugin | Description | Depends on |
|---|---|---|
| **email-client** | Send/receive email from within the CRM, linked to contacts | — |
| **whatsapp** | WhatsApp Business messaging integration | — |
| **twilio** | SMS + voice via Twilio | — |
| **inbox** | Unified inbox across all communication channels | email-client |

## Phase 4 — Workflow & Automation

| Plugin | Description | Depends on |
|---|---|---|
| **tasks** | Follow-up reminders tied to contacts ("Call Alice on Friday") | — |
| **automation** | If/then rules: "when contact created → send welcome email" | — |
| **ai-assistant** | AI agent that answers questions about your client base, drafts emails, suggests follow-ups | ai-extract |

## Phase 5 — Data & Access

| Plugin | Description | Depends on |
|---|---|---|
| **rbac** | Roles and permissions (admin, sales, readonly) | — |
| **audit-log** | Who changed what, when — field-level history with soft deletes | — |
| **tags** | Freely categorize contacts with custom tags | — |
| **custom-views** | Kanban boards, filtered lists, saved views | — |
| **search** | Full-text + semantic search (pgvector) across all entities | — |

## Phase 6 — Integrations

| Plugin | Description | Depends on |
|---|---|---|
| **calendar-sync** | Sync meetings via CalDAV (Nephele already supports this) | — |
| **accounting-bridge** | Sync with QuickBooks, Xero, or similar | — |
| **mcp-server** | Expose CRM data to AI tools (Claude, etc.) via MCP protocol | — |

---

## Notes

- **Plugin dependencies** are listed where applicable. Most plugins are fully independent.
- **ai-extract** is a shared foundation — email-ingest, ocr-ingest, stt-ingest, and ai-assistant all use it.
- **CalDAV** comes nearly free since Nephele supports both CardDAV and CalDAV.
- **Pipeline/deals** are not a plugin — they're a default entity in `schema.yaml`. Delete the `deal` entity from the config to remove pipeline tracking.
- Phases are a suggested order, not strict. Implement what you need when you need it.

---

## Inspiration

See [INSPIRATION.md](./INSPIRATION.md) for the open-source projects and architecture references that informed this roadmap.
