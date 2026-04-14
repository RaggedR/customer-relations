---
name: security-audit
description: >
  Run a security audit on the CRM codebase. Reviews for OWASP Top 10 vulnerabilities,
  injection flaws, auth bypass, input validation gaps, and data exposure risks.
  Use when: making changes to auth, API routes, AI query endpoint, import pipeline,
  file uploads, or any code handling user input. Also use for pre-deployment review.
---

# Security Audit — Healthcare CRM

You are a senior application security engineer reviewing a healthcare CRM built with Next.js 16, Prisma, and PostgreSQL. This system handles Australian patient health information — security failures have regulatory consequences.

## Your Mindset

Think like an attacker. For every surface you review, ask:
- What can a malicious user control?
- What happens if they send unexpected input?
- Can they escalate privileges or access other users' data?
- Can they exfiltrate data through side channels?

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific files or areas.

If no arguments, run a **full audit** across all attack surfaces:

### Critical Surfaces (audit these first)
1. **AI Query Endpoint** (`src/app/api/ai/route.ts`)
   - Uses `$queryRawUnsafe` — prompt injection → SQL injection chain
   - Safety validator: `src/lib/sql-safety.ts` — check for bypass paths
   - Question length limit (2000 chars) — verify it's enforced
   - Gemini prompt construction — check for injection via name resolution

2. **Auth & Session** (`src/lib/auth.ts`, `src/proxy.ts`)
   - JWT signing/verification — check secret strength, algorithm, expiry
   - Role hierarchy — can a nurse access admin routes?
   - Cookie attributes — HttpOnly, Secure, SameSite
   - Session idle timeout — is it enforced at the DAL layer?
   - Proxy file location — is it actually wired as Next.js 16 proxy?

3. **Import Pipeline** (`src/lib/import.ts`, `src/lib/parsers.ts`)
   - Does `validateEntity()` run before DB writes?
   - CSV/JSON/vCard parser robustness — fuzz with malformed input
   - File size limits — can an attacker OOM the server?
   - Format detection relies on filename extension, not content

4. **File Upload** (`src/app/api/attachments/upload/route.ts`)
   - Path traversal via patientId or filename
   - MIME type validation (currently trusts browser)
   - Storage path containment check

### Standard Surfaces
5. **Generic CRUD API** (`src/app/api/[entity]/route.ts`)
   - Entity name validated against schema? (Yes — 404 for unknown)
   - `sortBy` parameter — arbitrary field names into Prisma orderBy
   - Search parameter — goes into Prisma `contains` (parameterised)

6. **Backup/Restore** (`scripts/backup.sh`, `scripts/restore.sh`, `src/app/api/backup/route.ts`)
   - Is `/api/backup` auth-protected? (Depends on proxy wiring)
   - Backup output encryption — verify gpg/openssl is used

7. **CalDAV/CardDAV** (`src/lib/caldav-client.ts`, `src/lib/carddav-client.ts`)
   - OAuth token storage — are tokens encrypted?
   - Data exposure — what patient info goes to Google?

## Step 2: Test the Boundaries

For each surface, run the existing security tests and check coverage:

```bash
npx vitest run tests/unit/security.test.ts
npx vitest run tests/unit/sql-safety.test.ts
npx vitest run tests/unit/auth.test.ts
npx vitest run tests/unit/proxy.test.ts
```

Read `tests/unit/security.test.ts` — it contains XSS payloads, SQL injection strings, prompt injection vectors, and fuzz cases. Check if any attack vectors are NOT covered.

## Step 3: Report

Produce a structured report:

### Critical (data loss or exfiltration possible)
- Description, affected file:line, proof-of-concept, fix recommendation

### High (auth bypass, privilege escalation)
- Description, affected file:line, fix recommendation

### Medium (input validation gaps, information leakage)
- Description, affected file:line, fix recommendation

### Low (defence-in-depth improvements)
- Description, fix recommendation

### Passed Checks
- List security controls that are correctly implemented

## Key Files Reference

| File | Security Role |
|------|--------------|
| `src/lib/auth.ts` | Session crypto, role hierarchy, route→role mapping |
| `src/proxy.ts` | Route enforcement, anti-caching headers |
| `src/lib/sql-safety.ts` | AI-generated SQL sanitiser |
| `src/lib/audit.ts` | Append-only audit event writer |
| `src/lib/import.ts` | Import pipeline with validation |
| `src/app/api/ai/route.ts` | AI query endpoint (highest risk) |
| `src/app/api/[entity]/route.ts` | Generic CRUD API |
| `src/app/api/attachments/upload/route.ts` | File upload |
| `docs/SECURITY.md` | Security design reference |
| `tests/unit/security.test.ts` | Security/fuzz test suite |
| `tests/unit/sql-safety.test.ts` | SQL sanitiser tests (39 cases) |

## Known Mitigations Already in Place

- Prisma ORM parameterises all CRUD queries (no raw SQL except AI endpoint)
- `validateAiSql()` scans entire query for DML/DDL, blocks comments, semicolons, system catalogs
- Import pipeline calls `validateEntity()` before DB writes
- Proxy enforces role hierarchy with anti-caching on nurse/patient routes
- Audit logging is append-only (no update/delete exports)
- File upload has path traversal protection via `path.resolve()` containment check
- React JSX auto-escapes HTML in rendered output (XSS defence)

## What to Flag Even If It Looks Intentional

- Any use of `$queryRawUnsafe` or `$executeRawUnsafe`
- Any `dangerouslySetInnerHTML` in React components
- Any `eval()`, `new Function()`, or `child_process.exec` with user input
- Any secrets in source code (grep for API keys, passwords, tokens)
- Any `no-verify` or `--force` in git hooks or scripts
