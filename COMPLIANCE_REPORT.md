# Compliance Audit Report — Australian Privacy Act 1988 (APPs)

**System:** Schema-driven healthcare CRM for an Australian mobile audiology practice
**Audited:** 2026-04-14
**Regulatory framework:** Australian Privacy Act 1988, Australian Privacy Principles (APPs)
**Legal standard:** "Reasonable steps" to protect sensitive (health) information

---

## Critical Findings

### 1. Clinical notes are not append-only (APP 11 + medico-legal standard)

**Status:** FIXED (2026-04-14)
**Priority:** CRITICAL
**Effort:** Small

The generic CRUD API exposes `PUT` and `DELETE` handlers for `clinical_note` via `/api/clinical_note/{id}`:

- `src/app/api/[entity]/[id]/route.ts:24-32` — delegates to `makeGetUpdateDeleteHandlers`, which exports PUT and DELETE for **any** entity not in `SENSITIVE_ENTITIES`
- `src/lib/api-helpers.ts:15-20` — `SENSITIVE_ENTITIES` blocks `user`, `session`, `audit_log`, `calendar_connection` but **not** `clinical_note` or `personal_note`

This means any admin user can `PUT /api/clinical_note/42` to overwrite existing notes or `DELETE /api/clinical_note/42` to erase them. This directly contradicts:
- `docs/SECURITY.md:146-158` which states notes are "immutable once created"
- The medico-legal standard that medical records are legal documents

**Remediation:** Add `clinical_note` and `personal_note` to an `IMMUTABLE_ENTITIES` list in route-factory.ts. Return 405 Method Not Allowed for PUT and DELETE on these entities. Longer-term, consider adding an `immutable: true` flag to `schema.yaml` so the DSL enforces this declaratively.

---

### 2. No patient consent mechanism for AI data processing (APP 6, APP 8)

**Status:** PARTIALLY FIXED (2026-04-14) — data minimisation and documentation implemented; consent mechanism and Google DPA remain administrative actions
**Priority:** HIGH
**Effort:** Medium (legal + technical)

The AI endpoint (`src/app/api/ai/route.ts`) sends patient data to Google's Gemini API:

- **Line 55:** `generateSchemaDescription()` sends the full DB schema (field names, types, entity relationships)
- **Line 144:** `resolveNames(question)` loads **all** patient and nurse names from the database (`src/lib/name-resolution.ts:99-101`)
- **Line 246:** Query results (which can include patient names, clinical note content, Medicare-adjacent data) are sent back to Gemini for natural language summarization

Data sent to Google: the question, all patient/nurse names (via name resolution), the full schema, the generated SQL, and up to 100 result rows. This is a **cross-border disclosure** of patient identifying information (APP 8) — Google's servers are in the US/global.

Under APP 6 (use/disclosure) and APP 8 (cross-border disclosure), sending health information to an external API requires either:
1. Patient consent, or
2. A contractual arrangement ensuring the recipient handles data per the APPs

Neither is documented or implemented.

**Remediation:**
- Document the data processing arrangement with Google (Gemini API terms of service state API data is not used for training — document this as the basis for the cross-border transfer)
- Add a patient consent mechanism (or a privacy collection notice) covering AI-assisted queries
- Consider whether names can be pseudonymised before sending to the LLM (e.g., replace with patient numbers in the prompt, re-map in the response)
- Execute a Google Workspace data processing agreement (administrative, not code)

---

### 3. Nurse portal security controls designed but not built (APP 11)

**Status:** NOT FIXED — broken into five sub-tasks below (3A–3E)
**Priority:** MEDIUM (blocks go-live, not a current data breach risk)
**Effort:** Large (five independent pieces)

The nurse portal (`src/app/nurse/`) has no route files. The security design is documented in `docs/SECURITY.md` and `docs/ARCHITECTURE.md` but none of it is implemented. Each sub-task below is self-contained — a fresh conversation can pick up any one independently.

---

#### 3A. Watermarked Image Renderer

**Status:** NOT FIXED
**Goal:** Build `src/lib/image-renderer.ts` — server-side canvas rendering that bakes a watermark into clinical content as flat pixels.

**Why it matters:** Clinical notes must never appear as selectable HTML text on a nurse's device. If a screenshot is taken, the watermark (nurse name + timestamp) identifies who leaked it. CSS overlays are trivially removed via dev tools — the watermark must be in the pixel data.

**Design spec (from `docs/SECURITY.md:55-65`):**
- All clinical content rendered as server-generated PNG images, not HTML
- Each image composited with: viewing nurse's full name, current timestamp, semi-transparent diagonal overlay
- The watermark is in the pixels — no DOM elements to inspect or remove
- Text is not searchable or accessible in image form (accepted tradeoff for a nurse viewing one patient's notes at a time)

**Implementation guidance:**
- Use the `canvas` npm package (node-canvas) for server-side rendering. It provides a Canvas API identical to the browser's `<canvas>`, running on the server via Cairo.
- The function signature should be something like: `renderWatermarkedImage(content: string, nurseName: string, timestamp: Date): Buffer` returning a PNG buffer
- Content layout: render the clinical note text as wrapped paragraphs on a white background, then overlay the watermark diagonally at ~30° rotation, 20% opacity, repeating across the image
- The API route serving this image should set `Content-Type: image/png` and `Cache-Control: no-store`
- The image does NOT need to be beautiful — it needs to be legible and watermarked

**Key files:**
- Create: `src/lib/image-renderer.ts`
- Reference: `docs/SECURITY.md:55-65` (design spec)
- Consumer: nurse portal API routes (task 3B) will call this function

**Test:** Unit test that the function returns a valid PNG buffer and that the buffer size changes when the watermark text changes (confirming the watermark is baked in, not ignored).

**No dependencies on other sub-tasks.** This can be built and tested before the nurse portal routes exist.

---

#### 3B. Nurse Portal Routes with Pseudonymised Views

**Status:** NOT FIXED
**Goal:** Build `src/app/nurse/` routes that enforce pseudonymisation — appointments show patient name (no clinical data), notes show patient number only (no name).

**Why it matters (APP 11):** The core privacy design (`docs/SECURITY.md:38-50`) is that no single artefact on a nurse's device links a patient name to their clinical information. The admin UI shows everything together. The nurse portal must enforce the separation.

**Design spec (from `docs/SECURITY.md:37-50` and `docs/ARCHITECTURE.md:115-128`):**

| View | Shows | Identifies patient by |
|------|-------|-----------------------|
| Appointment list/detail | Name, location, time, specialty | **Name** |
| Clinical notes | Note content, date, clinician | **Patient number only** |
| Personal notes | Note content, date | **Patient number only** |

The nurse portal lives at `/nurse/` and requires the `nurse` role. Auth is already enforced by `src/proxy.ts` (line 78: paths starting with `/nurse/` require nurse role). Anti-caching headers are already applied by the proxy (line 57-61).

**What to build:**

1. **Nurse API routes** (`src/app/api/nurse/`):
   - `GET /api/nurse/appointments` — returns appointments for the logged-in nurse (filter by nurseId from session). Include patient name and appointment fields. Exclude all clinical data.
   - `GET /api/nurse/appointments/[id]/notes` — returns clinical + personal notes for a specific appointment's patient. Include note content, date, clinician, note_type. Show patient as `Patient #<id>` — **never include patient name**. Return notes as watermarked images (call `image-renderer.ts` from task 3A) OR as JSON that the frontend renders as images.
   - `POST /api/nurse/appointments/[id]/notes` — create a new clinical or personal note. The nurse provides: content, note_type. The server fills in: date (now), clinician (nurse name from session), patientId (from the appointment).
   - `POST /api/nurse/appointments/[id]/cancel` — cancel an appointment with a reason.

2. **Nurse portal pages** (`src/app/nurse/`):
   - `src/app/nurse/page.tsx` — appointment list for today/this week
   - `src/app/nurse/appointments/[id]/page.tsx` — appointment detail with linked notes

**Existing infrastructure to reuse:**
- `src/lib/repository.ts` — `findAll()`, `findById()`, `create()` for DB access
- `src/lib/session.ts` — `getSessionUser(request)` to get nurse userId
- `src/lib/auth.ts` — role checking (already enforced by proxy, but re-verify in route handlers)
- `src/lib/audit.ts` — `logAuditEvent()` for access logging (see task 3D)
- `src/proxy.ts` — already enforces nurse role on `/nurse/*` and `/api/nurse/*`, already sets `Cache-Control: no-store`

**Key constraint:** The nurse API routes must NEVER return a response that contains both a patient name and clinical note content in the same JSON payload. The pseudonymisation boundary is at the API level, not just the UI level.

**Dependencies:** Task 3A (image-renderer) should be built first if notes are served as watermarked images. If serving notes as JSON (with client-side image rendering), 3A can be deferred — but server-side rendering is the documented design.

---

#### 3C. Session Idle Timeout

**Status:** NOT FIXED
**Goal:** Enforce a 10-minute idle timeout for nurse sessions (and optionally admin sessions).

**Why it matters (APP 11):** If a nurse's phone is stolen while the session is active, the current 8-hour JWT gives an attacker a long window. SECURITY.md:100 says "Idle timeout: Planned for future batch."

**Design options:**

**Option A — Server-side (recommended):** Wire the `session` entity (already in `schema.yaml:261-268`, has `token`, `last_active`, `expires_at` fields) into the auth flow:
1. On login (`src/app/api/auth/login/route.ts`): create a `session` DB record with `last_active = now()` and `expires_at = now() + 8h`
2. In the proxy (`src/proxy.ts`): after JWT verification succeeds, look up the session record by userId, check `last_active`. If `now() - last_active > 10 minutes` (for nurses) or `> 8 hours` (for admin), reject the request and redirect to login. Update `last_active = now()` on every successful request.
3. On logout (`src/app/api/auth/logout/route.ts`): delete or expire the session record.

This makes sessions revocable (delete the DB record → immediate logout) and adds idle detection.

**Option B — Client-side timer:** Add a JS timer on nurse portal pages that calls `/api/auth/logout` after 10 minutes of no interaction. Simpler but bypassable — a stolen device with the browser open would still have the JWT cookie.

**Recommendation:** Option A. The session table already exists in the schema. The proxy already runs on every request. The DB lookup adds ~1ms per request (indexed by userId).

**Key files:**
- Modify: `src/proxy.ts` — add session DB lookup after JWT verification
- Modify: `src/app/api/auth/login/route.ts` — create session record on login
- Modify: `src/app/api/auth/logout/route.ts` — expire session record on logout
- Existing: `schema.yaml` — `session` entity already defined with `token`, `last_active`, `expires_at`, `ip`, `user_agent` fields
- Existing: `src/lib/prisma.ts` — Prisma client for session table access

**Key constraint:** The proxy (`src/proxy.ts`) has a note in `src/lib/session.ts:9-11` warning that Next.js 16 proxy docs recommend against importing shared modules. The session lookup may need to use Prisma directly in the proxy rather than through `session.ts`. Test this carefully.

**No dependencies on other sub-tasks.** Can be implemented independently.

---

#### 3D. Nurse Audit Logging

**Status:** NOT FIXED
**Goal:** Add `logAuditEvent()` calls to all nurse portal data access points so every view/create of patient data is recorded.

**Why it matters (APP 11):** `docs/SECURITY.md:119-128` documents five audit event types. Currently only login/logout, AI queries, and backup exports are logged. Nurse access to patient data is the highest-frequency sensitive operation and is completely unlogged.

**Events to log (from `docs/SECURITY.md:119-128`):**

| Event | Fields | When |
|-------|--------|------|
| Nurse viewed patient notes | nurse_id, patient_id, timestamp, action="view" | `GET /api/nurse/appointments/[id]/notes` |
| Nurse added clinical note | nurse_id, patient_id, timestamp, action="create", note_type | `POST /api/nurse/appointments/[id]/notes` |
| Nurse added personal note | nurse_id, patient_id, timestamp, action="create", note_type | `POST /api/nurse/appointments/[id]/notes` |

**Implementation:** In each nurse API route handler (built in task 3B), call `logAuditEvent()` from `src/lib/audit.ts` immediately after the DB operation succeeds. The audit call is fire-and-forget (never blocks the response).

```ts
import { logAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/session";

// Inside route handler:
const session = await getSessionUser(request);
logAuditEvent({
  userId: session?.userId ?? null,
  action: "view",
  entity: "clinical_note",
  entityId: String(patientId),
  ip: request.headers.get("x-forwarded-for") ?? undefined,
  userAgent: request.headers.get("user-agent") ?? undefined,
});
```

**Key files:**
- Modify: nurse API routes from task 3B (add logAuditEvent calls)
- Existing: `src/lib/audit.ts` — append-only audit writer (no changes needed)
- Existing: `src/lib/session.ts` — `getSessionUser()` extracts nurse userId from JWT
- Existing: `tests/unit/audit.test.ts` — existing tests verify append-only property

**Test:** After implementing, query the `audit_log` table and verify entries appear with correct nurse_id, patient_id, and action fields.

**Dependencies:** Task 3B (nurse portal routes) must exist before audit logging can be added to them. However, the audit module itself (`src/lib/audit.ts`) is already complete and tested.

---

#### 3E. Copy Prevention on Clinical Content

**Status:** NOT FIXED
**Goal:** Add CSS `user-select: none` and JavaScript `oncopy`/`oncut` event prevention to clinical content areas on the nurse portal.

**Why it matters:** Raises the bar for data exfiltration. Combined with canvas rendering (task 3A), there is no selectable text to copy in the first place. This is defence-in-depth, not a primary control.

**Design spec (from `docs/SECURITY.md:85-91`):**
- CSS: `user-select: none` on clinical data containers
- JavaScript: `oncopy`, `oncut` event handlers that call `event.preventDefault()`
- This is NOT bulletproof (dev tools bypass) but raises the bar
- Combined with watermarked image rendering (task 3A), the text is already a flat raster — there are no DOM elements with selectable text

**Implementation:**
- If clinical notes are rendered as `<img>` tags (from watermarked PNGs), copy prevention is inherent — you can't select text in an image. The CSS/JS prevention is redundant but harmless.
- If any clinical data is rendered as HTML text (e.g., appointment details), wrap it in a container with:

```tsx
<div
  style={{ userSelect: "none", WebkitUserSelect: "none" }}
  onCopy={(e) => e.preventDefault()}
  onCut={(e) => e.preventDefault()}
>
  {/* clinical content */}
</div>
```

- Consider adding `onContextMenu={(e) => e.preventDefault()}` to disable right-click context menu (prevents "Copy image" on the watermarked PNGs).

**Key files:**
- Modify: nurse portal page components from task 3B
- No server-side changes needed

**Dependencies:** Task 3B (nurse portal pages) must exist. If task 3A is implemented (watermarked images), this task becomes largely redundant but should still be applied as defence-in-depth.

**Effort:** Small — a few lines of CSS/JS on the nurse portal components.

---

## Additional Findings (lower priority)

These were identified during the audit but are lower risk than the three critical items above.

### Partially Compliant

- **Audit logging gaps** (APP 11): Login/logout/AI/backup are logged, but generic CRUD access to patient data is not. Add `logAuditEvent` to CRUD route handlers when they access patient entities.
- **Session revocation** (APP 11): JWTs are stateless — cannot be revoked if a device is compromised. The `session` table exists in schema.yaml but is not wired. Implement hybrid JWT + DB session checking.
- **Google Calendar data processing agreement** (APP 8): No documented DPA with Google Workspace. Administrative action — not code.
- **Appointment `notes` field** (APP 6): Free-text field sent as iCal DESCRIPTION to Google Calendar. Could leak clinical data if misused. Consider renaming or adding guidance.

### Compliant

- Three-role access control with default-deny (`src/lib/auth.ts`, `src/proxy.ts`)
- Backup encryption with GPG AES-256 (`scripts/backup.sh`)
- SQL safety for AI queries (`src/lib/sql-safety.ts`, `src/lib/prisma-readonly.ts`, `scripts/create-readonly-role.sql`)
- Security headers: CSP, HSTS, X-Frame-Options, nosniff, Permissions-Policy (`next.config.ts`)
- Logout with Clear-Site-Data (`src/app/api/auth/logout/route.ts`)
- Login rate limiting and generic error messages (`src/app/api/auth/login/route.ts`)
- Separate clinical_note and personal_note entities (`schema.yaml`)
- Append-only audit log module with test coverage (`src/lib/audit.ts`, `tests/unit/audit.test.ts`)
- OAuth token encryption at rest with AES-256-GCM (`src/lib/token-crypto.ts`)

---

## Data Flow Summary

| Data type | Where stored | Who accesses | External disclosure | Encrypted |
|-----------|-------------|-------------|-------------------|-----------|
| Patient name, DOB, contact | PostgreSQL | Admin (Clare) | Google Calendar (summary), Google Gemini (name resolution) | At rest (disk), in transit (HTTPS) |
| Medicare number | PostgreSQL | Admin only | None | At rest (disk), in transit (HTTPS) |
| Clinical notes | PostgreSQL | Admin; nurses (designed, not built) | Google Gemini (query results) | At rest (disk), in transit (HTTPS) |
| Personal notes | PostgreSQL | Admin; nurses (designed, not built) | Google Gemini (query results) | At rest (disk), in transit (HTTPS) |
| Appointment details | PostgreSQL + Google Calendar | Admin, nurses (via calendar) | Google Calendar (name, specialty, location, time) | In transit (HTTPS); Google stores plaintext |
| OAuth tokens | PostgreSQL | System only | Google OAuth (refresh) | AES-256-GCM at rest |
| Audit logs | PostgreSQL | Admin only | None | At rest (disk) |
| Backups | Filesystem | Admin (via script) | None (if encrypted) | GPG AES-256 |
| AI queries + results | Transient (API call) | Admin (current) | Google Gemini API (US/global) | In transit (HTTPS); Google may retain |
