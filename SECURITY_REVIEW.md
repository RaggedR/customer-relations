# Security Review — 2026-04-14

Results of full security audit. Work is broken into four batches.

---

## Batch 1: Quick Wins

Mechanical fixes, low-risk, independently testable.

| ID | Severity | Issue | File | Fix |
|----|----------|-------|------|-----|
| H2 | High | `sortBy` allows arbitrary field names into Prisma `orderBy` — timing/ordering side-channel | `src/lib/repository.ts:203-204` | Validate `sortBy` against entity schema fields |
| M8 | Medium | Case-sensitive route matching — `/Nurse/` bypasses auth on case-insensitive filesystems | `src/lib/auth.ts:67-76` | Lowercase `pathname` before matching |
| M1 | Medium | File upload has no size limit — disk exhaustion DoS | `src/app/api/attachments/upload/route.ts` | Reject files > 50MB before writing |
| M2 | Medium | MIME type trusted from browser — spoofable | `src/app/api/attachments/upload/route.ts:101` | Whitelist allowed MIME types |
| M3 | Medium | Download route missing `X-Content-Type-Options: nosniff` | `src/app/api/attachments/[id]/download/route.ts:55-61` | Add header |
| M5 | Medium | SQL error responses leak Prisma internals | `src/app/api/ai/route.ts:192-196` | Log full error, return generic message |
| L5 | Low | `Infinity` accepted as valid number | `src/lib/schema.ts` (validateFieldValue) | Add `isFinite()` check |

---

## Batch 2: Auth Wiring

Design decisions required — login flow, cookie attributes, default-deny routing.

| ID | Severity | Issue | File | Fix |
|----|----------|-------|------|-----|
| C3 | Critical | No login route exists — session cookie never set, HttpOnly/Secure/SameSite unverifiable | No file | Implement login route with proper cookie attributes |
| H1 | High | Root path `/` and non-prefixed paths require no auth — default is open | `src/lib/auth.ts:62-78` | Invert default: require admin for unmatched routes |
| H4 | High | AI endpoint audit logs `userId: null` — anonymous audit trail | `src/app/api/ai/route.ts:201` | Extract userId from session cookie |
| L6 | Low | No idle session timeout — 8h fixed JWT, SECURITY.md says 10min idle | `src/lib/auth.ts:23` | Add sliding window or short-lived tokens with refresh |
| L2 | Low | No CSRF protection | Proxy | SameSite=Strict + optional CSRF token |

---

## Batch 3: Backup Hardening

Partly deployment decisions (GPG key management).

| ID | Severity | Issue | File | Fix |
|----|----------|-------|------|-----|
| C1 | Critical | Backup API returns plaintext patient data, script stores unencrypted | `scripts/backup.sh`, `src/app/api/backup/route.ts` | Pipe through `gpg --symmetric` in script |
| C2 | Critical | No audit logging on backup export | `src/app/api/backup/route.ts:49` | Add `logAuditEvent()` call |

---

## Batch 4: Defence-in-Depth

Hardening layers — rate limiting, CSP, token encryption, read-only DB role.

| ID | Severity | Issue | File | Fix |
|----|----------|-------|------|-----|
| H3 | High | No rate limiting on AI endpoint or login | Entire codebase | Add per-session rate limiting middleware |
| M4 | Medium | Name resolution injects patient names into Gemini prompt — stored prompt injection | `src/lib/name-resolution.ts:140` | Sanitise names or use structured format |
| M6 | Medium | OAuth tokens stored plaintext in DB | `src/lib/caldav-client.ts:20-21` | Encrypt with `aes-256-gcm` + env var key |
| M7 | Medium | Import pipeline has no file size limit — OOM risk | `src/lib/parsers.ts:246` | Add size check before parsing |
| L3 | Low | No Content-Security-Policy header | Proxy | Add CSP: `script-src 'self'` |
| — | Low | No read-only PostgreSQL role for AI queries | DB config | `CREATE ROLE crm_readonly; GRANT SELECT ON ALL TABLES` |
