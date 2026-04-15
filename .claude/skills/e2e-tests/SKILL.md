---
name: e2e-tests
description: >
  Write Playwright E2E tests for the healthcare CRM, automating items from HUMAN_TESTS_TODO.md.
  Use when: adding new features that need E2E coverage, expanding test coverage for existing
  features, or when asked to automate manual test items. Reads the checklist, writes spec files,
  and runs them.
---

# E2E Test Writer — Healthcare CRM

You are writing Playwright E2E tests for a healthcare CRM built with Next.js 16, Prisma, and PostgreSQL. The tests automate the manual checklist in `HUMAN_TESTS_TODO.md`.

## Before You Start

1. **Read the manual checklist** to understand what needs testing:
   ```
   HUMAN_TESTS_TODO.md
   ```

2. **Read existing specs** to match the established patterns:
   ```
   tests/e2e/calendar.spec.ts   — UI interaction patterns
   tests/e2e/fuzz.spec.ts       — random action / resilience patterns
   ```

3. **Read the Playwright config**:
   ```
   playwright.config.ts
   ```

4. **Read the app structure** to know what URLs and APIs exist:
   ```
   schema.yaml                         — entities and field types
   navigation.yaml                     — UI navigation graph
   src/app/api/                        — API routes
   src/app/nurse/                      — nurse portal pages
   src/app/login/page.tsx              — login page
   ```

5. **Check for test credentials** — E2E tests need to log in. Check `.env` or the `user` table for existing admin/nurse accounts. If none exist, the global setup must create them.

## Conventions

### Imports and Structure
```typescript
import { test, expect } from "playwright/test";

test.describe("Section Name", () => {
  test("descriptive test name", async ({ page }) => {
    // ...
  });
});
```

### Test Data Isolation
- Prefix ALL test data with `[E2E]` (e.g., `[E2E] Ada Lovelace`)
- Clean up in `afterAll` — delete all `[E2E]`-prefixed records
- This matches the existing `[ROUNDTRIP]` convention in integration tests

### Locator Strategy (match existing specs)
- CSS selectors: `page.locator("button:has-text('Delete')")`
- Role-based: `page.getByRole("button", { name: "Ask AI" })`
- Text-based: `page.locator("text=Today")`
- Wait with `page.waitForTimeout()` after interactions (100-1500ms)
- Guard with `if (count > 0)` when elements may not exist

### Browser vs API Tests
- **Browser tests** for UI flows: CRUD forms, navigation, AI chat, nurse portal
- **API context tests** for security: XSS, SQL injection, auth fuzz, import fuzz
  ```typescript
  test("rejects SQL injection in name", async ({ request }) => {
    const res = await request.post("/api/patient", {
      data: { name: "'; DROP TABLE \"Patient\"; --" }
    });
    expect(res.ok()).toBeTruthy();
    // Verify it saved as literal text, not executed
  });
  ```

### Auth
- Use global setup with `storageState` for admin and nurse sessions
- Admin state: `tests/e2e/.auth/admin.json`
- Nurse state: `tests/e2e/.auth/nurse.json`
- Configure `projects` in `playwright.config.ts` to use different auth states

## File Organization

```
tests/e2e/
├── helpers/
│   ├── auth.ts              — loginAsAdmin(), loginAsNurse(), getApiContext()
│   ├── fixtures.ts          — E2E_PREFIX, createPatient(), createNurse(), cleanup()
│   └── setup.ts             — global setup: login, save storageState
├── calendar.spec.ts         — EXISTING (Section 3 partial)
├── fuzz.spec.ts             — EXISTING
├── crud.spec.ts             — Sections 1-4: patients, nurses, appointments, clinical data
├── import-export.spec.ts    — Sections 5-7: attachments, single export, bulk roundtrip
├── ai-chat.spec.ts          — Section 9: AI queries, privacy notice, data minimisation
├── navigation.spec.ts       — Section 11: sidebar, drill-down, window positioning
├── auth.spec.ts             — Sections 13 + 20: login flow, session, cookie fuzz
├── nurse-portal.spec.ts     — Section 14: nurse dashboard, watermarked images, access control
├── security.spec.ts         — Sections 16-19: XSS, SQL injection, prompt injection, import fuzz
├── edge-cases.spec.ts       — Sections 15, 21, 22: error handling, concurrency, boundary values
└── backup-api.spec.ts       — Section 10: backup API endpoint (not shell scripts)
```

## Implementation Order

### Batch 1: Foundation + CRUD (~35 tests)
Write the helpers first, then:
- `crud.spec.ts` — Sections 1-4: full CRUD for patients, nurses, appointments, clinical data including immutability checks (405 on clinical note edit/delete)
- `navigation.spec.ts` — Section 11: sidebar shows only first-order entities, drill-down chain, window uniqueness

### Batch 2: Import/Export + AI (~25 tests)
- `import-export.spec.ts` — Sections 5-7: file upload, single-entity export (PDF/JSON/XLSX), bulk CSV/JSON/vCard/iCal roundtrip
- `ai-chat.spec.ts` — Section 9: privacy notice banner, data queries, fuzzy name resolution, off-topic refusal, data minimisation (Medicare/phone/email redacted)
- `backup-api.spec.ts` — Section 10: GET /api/backup with/without auth, verify response structure

### Batch 3: Auth + Security (~45 tests)
- `auth.spec.ts` — Sections 13, 20: login/logout flow, session creation/deletion, cookie fuzz (garbage, empty, forged, oversized), protected routes without auth
- `nurse-portal.spec.ts` — Section 14: nurse login redirect, assigned appointments only, watermarked PNG images (not text), access control (403 on /api/patient, /api/ai)
- `security.spec.ts` — Sections 16-19: XSS payloads in forms (verify rendered as text), SQL injection via fields and params, prompt injection in AI chat, malicious import files

### Batch 4: Edge Cases (~15 tests)
- `edge-cases.spec.ts` — Sections 15, 21, 22: invalid input handling, concurrent edits (multiple browser contexts), boundary values (midnight, future dates, large numbers, long strings)

## Items That Require a Human

These items in `HUMAN_TESTS_TODO.md` are marked `[HUMAN]` and cannot be automated:

| Section | Item | Reason |
|---------|------|--------|
| 6 | Open exported files in native apps | Requires macOS Preview/Excel |
| 7 | Open vCard in Contacts app / iCal in Calendar app | macOS app integration |
| 8 | Point CardDAV client at server | Requires macOS Contacts configuration |
| 8 | CalDAV client: create appointment, verify sync | Requires macOS Calendar configuration |
| 10 | Run `./scripts/backup.sh` | Shell script + GPG encryption |
| 10 | Run `./scripts/restore.sh` | Shell script + GPG decryption |
| 12 | Add/remove field in schema.yaml + restart server | Dev workflow: file edit + server restart |
| 12 | Verify destructive migration is BLOCKED | Dev workflow: requires inspecting migration output |

## Verification

After writing each batch:
```bash
# Run specific spec
npx playwright test tests/e2e/<file>.spec.ts

# Run all e2e tests
npx playwright test

# Run with visible browser for debugging
npx playwright test --headed tests/e2e/<file>.spec.ts

# Run specific test by title
npx playwright test -g "test name substring"
```

## Config Changes Required

**`playwright.config.ts`** — add globalSetup and auth projects:
```typescript
globalSetup: "./tests/e2e/helpers/setup.ts",
projects: [
  { name: "admin", use: { storageState: "tests/e2e/.auth/admin.json" } },
  { name: "nurse", use: { storageState: "tests/e2e/.auth/nurse.json" } },
  { name: "no-auth", use: {} },
],
```

**`package.json`** — add script:
```json
"test:e2e": "npx playwright test"
```

**`.gitignore`** — add:
```
tests/e2e/.auth/
```
