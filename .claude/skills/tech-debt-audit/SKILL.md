---
name: tech-debt-audit
description: >
  Audit the CRM codebase for technical debt across 6 dimensions: dead code, accidental complexity,
  cargo culting, dependency health, TODO/FIXME archaeology, and duplication. Use when: after rapid
  feature shipping, before major refactors, or for periodic hygiene checks.
---

# Technical Debt Audit — Healthcare CRM

You are a senior engineer assessing the accumulated technical debt in a healthcare CRM built with Next.js 16, Prisma 7, and PostgreSQL. Technical debt isn't inherently bad — it's a deliberate or accidental trade-off between shipping speed and long-term maintainability. Your job is to find it, quantify it, and distinguish the debt that's quietly compounding from the debt that's safely dormant.

## Your Mindset

Think like an engineer who just inherited this codebase. For every surface you review, ask:
- Would a new team member understand why this exists?
- Is this a shortcut that saved time, or a shortcut that will cost time?
- Is this pattern here because it solves a problem, or because it was copied without thought?
- If we needed to change this, how many files would we have to touch?
- Is this complexity earning its keep?

## Rules

- **READ-ONLY**: Do NOT edit, create, or delete any files. Your job is to find and report, not fix.
- You MAY run existing tests, linting, or analysis commands
- Do NOT run destructive commands

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific files or areas.

If no arguments, run a **full audit** across all 6 dimensions.

---

## Dimension 1: Dead Code & Orphaned Files

**Question: How much of this codebase is no longer reachable or used?**

- Search for exported functions/types that are never imported elsewhere
- Check for commented-out code blocks (more than 3 lines)
- Look for files that aren't imported by any other file
- Check for unused dependencies in `package.json` (installed but never imported)
- Look for orphaned test files (testing modules that no longer exist)
- Check for unused CSS classes in `src/app/globals.css`
- Check for schema.yaml entity fields that exist in the schema but aren't rendered in navigation.yaml

### Checklist:
- [ ] No commented-out code blocks longer than 3 lines
- [ ] No exported functions/types with zero importers
- [ ] No orphaned files (not imported by anything)
- [ ] No unused dependencies in package.json
- [ ] No orphaned test files
- [ ] No unused CSS classes (beyond utility classes)
- [ ] No schema fields that are defined but never surfaced

---

## Dimension 2: Accidental Complexity

**Question: Where is the codebase more complex than the problem demands?**

- Look for abstraction layers that have only one implementation (interface with one implementor)
- Find wrapper functions that just pass through to another function without adding value
- Check for configuration that could be convention (parameters that are always the same value)
- Look for indirection that requires reading 3+ files to understand a single operation
- Find feature flags, environment checks, or conditional paths that are always the same in practice
- Check for over-engineered error handling (catching, wrapping, re-throwing without adding context)

### Checklist:
- [ ] No single-implementation abstractions (unless designed for future extension with clear intent)
- [ ] No pass-through wrapper functions
- [ ] No always-same-value parameters (should be defaults or constants)
- [ ] No 3+ file indirection chains for simple operations
- [ ] No dead conditional branches (feature flags that are always on/off)
- [ ] Error handling adds context at each level, not just re-wraps

---

## Dimension 3: Cargo Culting

**Question: Are there patterns copied without understanding why they exist?**

- Look for design patterns applied where simpler code would suffice (e.g., factory pattern for a single type, strategy pattern with one strategy)
- Check for boilerplate that's copy-pasted across routes — is the boilerplate necessary or vestigial?
- Look for type assertions (`as`, `as unknown as`) that suggest the types don't fit the actual usage
- Find `try/catch` blocks copied from other routes that catch errors that can't occur in this context
- Check for configuration objects with fields that are never read
- Look for middleware or hooks that are registered but have no effect

### Checklist:
- [ ] No unnecessary design patterns (patterns should solve an actual problem)
- [ ] Boilerplate across routes is genuinely necessary (not copy-paste residue)
- [ ] Type assertions are documented with why they're needed
- [ ] Error handling matches the actual error surface (not copied from a different context)
- [ ] Configuration objects don't have vestigial fields
- [ ] All registered middleware/hooks are active and necessary

---

## Dimension 4: Dependency Health

**Question: Are our dependencies maintained, secure, and appropriately scoped?**

Run these commands to gather data:
```bash
# Check for outdated packages
npm outdated 2>/dev/null || true

# Check for known vulnerabilities
npm audit --json 2>/dev/null | head -100 || true

# Check package.json for dependency count
cat package.json | grep -c '":'
```

- Count total dependencies (dependencies + devDependencies) — flag if over 80
- Check for dependencies that duplicate functionality (e.g., two date libraries, two HTTP clients)
- Look for heavy dependencies pulled in for a single function (e.g., lodash for just `_.get`)
- Check for packages with no recent releases (unmaintained, >2 years)
- Check version ranges — `*` or very broad ranges are risky
- Check if lock file (`package-lock.json`) is committed and in sync

### Checklist:
- [ ] No known high/critical vulnerabilities (npm audit)
- [ ] No duplicate-functionality dependencies
- [ ] No heavy dependencies used for trivial operations
- [ ] No unmaintained packages (>2 years without release)
- [ ] No wildcard version ranges
- [ ] Lock file committed and up to date

---

## Dimension 5: TODO/FIXME Archaeology

**Question: How much deferred work is accumulating, and is any of it time-critical?**

Search for all TODO, FIXME, HACK, XXX, TEMP, TEMPORARY comments:
```bash
grep -rn "TODO\|FIXME\|HACK\|XXX\|TEMP\b" src/ --include="*.ts" --include="*.tsx"
```

For each found item:
- How old is it? (`git blame` the line)
- Is it blocking a feature or is it a nice-to-have?
- Is it a security concern? (e.g., "TODO: encrypt tokens", "TODO: validate input")
- Is it a compliance concern? (e.g., "TODO: implement consent withdrawal")
- Has the surrounding code changed while the TODO remained? (stale TODO)
- Could the TODO be resolved in under 30 minutes? (quick win)

### Classify each TODO:

| Priority | Description |
|----------|-------------|
| **Critical** | Security or compliance TODOs that are blocking production readiness |
| **High** | Feature completeness TODOs that affect user-facing functionality |
| **Medium** | Quality improvements that would reduce future maintenance |
| **Low** | Nice-to-haves, optimisations, or cosmetic improvements |
| **Stale** | TODOs that no longer apply (the code around them has changed) |

### Checklist:
- [ ] No security-related TODOs older than 30 days
- [ ] No compliance-related TODOs older than 30 days
- [ ] No stale TODOs (code changed but TODO remained)
- [ ] Quick-win TODOs (<30 min) are identified for batch resolution
- [ ] Total TODO count is trending down, not up (check git history)

---

## Dimension 6: Duplication

**Question: Where is the same logic expressed in multiple places, creating a maintenance multiplier?**

- Search for structurally similar code blocks across API routes
- Check for repeated validation patterns that could be in the field-type registry
- Look for similar error handling patterns that could be centralised
- Check for repeated SQL/Prisma query patterns across routes
- Look for similar React component patterns (same props, same structure, different entity)
- Check for repeated type definitions (same shape defined in multiple files)

Focus on duplication that creates a **maintenance multiplier** — if you change the pattern in one place, you MUST change it in N other places or introduce a bug. Cosmetic similarity (two routes that look alike but evolve independently) is not worth flagging.

### Checklist:
- [ ] No validation logic duplicated outside the field-type registry
- [ ] No error handling patterns repeated across 3+ routes
- [ ] No query patterns repeated across 3+ routes that could be in repository.ts
- [ ] No type definitions with the same shape in multiple files
- [ ] No React components that are copy-paste variants of each other

---

## Step 2: Quantify the Debt

For each finding, estimate:
- **Interest rate**: How much additional cost does this debt incur per feature added? (Low/Medium/High)
- **Payoff effort**: How long to fix? (S = <1hr, M = 1-4hr, L = 4-16hr, XL = >16hr)
- **Risk**: What breaks if we don't fix it? (Nothing / Slow development / Potential bugs / Data loss)

---

## Step 3: Report

### Debt Summary
One paragraph: overall debt assessment. Is this codebase healthy, accumulating, or drowning?

### Scorecard

| Dimension | Score (/5) | Debt Level | Key Finding |
|-----------|-----------|------------|-------------|
| Dead Code | | | |
| Accidental Complexity | | | |
| Cargo Culting | | | |
| Dependency Health | | | |
| TODO/FIXME | | | |
| Duplication | | | |

**Scoring:**
- 5 = Minimal debt, well-maintained
- 4 = Some debt, manageable
- 3 = Notable debt, should address soon
- 2 = Significant debt, slowing development
- 1 = Critical debt, impeding progress

### Quick Wins (< 1 hour each)
- What to fix, where, estimated time

### High-Interest Debt (fix soon, it's compounding)
- Finding, affected files, interest rate, payoff effort

### Low-Interest Debt (can wait)
- Finding, risk if deferred

### Stale TODOs (remove or action)
- Each stale TODO with file:line and recommendation

### Passed Checks
- Areas where debt is well-managed

## Key Files Reference

| File | Debt Relevance |
|------|---------------|
| `src/lib/route-factory.ts` | Generic CRUD — duplication eliminator, check it's actually used |
| `src/lib/repository.ts` | Data access centralisation — check for bypass |
| `src/engine/field-types.ts` | Validation centralisation — check for ad-hoc validators |
| `schema.yaml` | Source of truth — check for drift from actual code |
| `navigation.yaml` | UI source of truth — check for drift from actual pages |
| `package.json` | Dependency inventory |
| `src/app/globals.css` | CSS — check for unused classes |
| `src/app/api/` | All API routes — check for duplication across routes |
| `src/components/` | React components — check for copy-paste variants |
