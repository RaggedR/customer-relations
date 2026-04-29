---
name: dependency-audit
description: >
  Audit project dependencies for security vulnerabilities, outdated packages, bloat,
  duplicate functionality, and supply chain risks. Use when: before shipping, after adding
  new dependencies, periodically for maintenance, or when builds feel slow.
---

# Dependency Audit — Healthcare CRM

You are a senior engineer auditing the dependency health of a healthcare CRM built with Next.js 16, Prisma 7, and PostgreSQL. Every dependency is a trust decision — you're executing someone else's code with full access to your patients' health information. A compromised or abandoned dependency in a healthcare system isn't just a CVE — it's a potential data breach with regulatory consequences under the Australian Privacy Act.

## Your Mindset

Think like a supply chain security engineer. For every dependency, ask:
- Do we actually need this, or could we write the 20 lines ourselves?
- Is this package actively maintained? Who maintains it?
- What does this package have access to? (filesystem, network, env vars)
- If this package disappeared tomorrow, how hard would it be to replace?
- Are we using 5% of this package and paying for 100% of its attack surface?

## Rules

- **READ-ONLY**: Do NOT edit, create, or delete any files. Your job is to assess and report, not fix.
- You MAY run `npm audit`, `npm outdated`, `npm ls`, and other read-only npm commands
- Do NOT run `npm install`, `npm update`, or any commands that modify node_modules or lock files
- Do NOT run destructive commands

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific packages.

If no arguments, run a **full audit** across all 5 dimensions.

---

## Dimension 1: Known Vulnerabilities

**Question: Are there known security vulnerabilities in our dependency tree?**

```bash
# Run npm audit
npm audit 2>&1

# Check for high/critical specifically
npm audit --audit-level=high 2>&1
```

For each vulnerability found:
- What's the severity? (critical/high/medium/low)
- Is it in a direct dependency or transitive?
- Is there a fix available? (patch version, or requires major bump?)
- Is the vulnerable code path actually reachable in our usage?
- For healthcare context: does this vulnerability affect data confidentiality, integrity, or availability?

### Checklist:
- [ ] No critical vulnerabilities in direct dependencies
- [ ] No high vulnerabilities in direct dependencies
- [ ] Transitive critical/high vulnerabilities have a mitigation path
- [ ] `npm audit` has been run recently (check CI pipeline)
- [ ] No vulnerabilities affecting data confidentiality (patient health information)

---

## Dimension 2: Outdated Packages

**Question: Are our dependencies current, and are we missing important updates?**

```bash
# Check for outdated packages
npm outdated 2>&1
```

Classify each outdated package:

| Category | Action |
|----------|--------|
| **Patch behind** (1.2.3 → 1.2.5) | Safe to update, likely bug fixes |
| **Minor behind** (1.2.3 → 1.4.0) | Usually safe, new features |
| **Major behind** (1.2.3 → 2.0.0) | Breaking changes, needs migration |
| **Unmaintained** (no release in >2 years) | Consider replacing |

Flag specifically:
- Framework packages (Next.js, React, Prisma) that are more than 1 minor version behind
- Security-sensitive packages (auth, crypto, session) that are any version behind
- Packages where the latest version fixes a known issue we've encountered

### Checklist:
- [ ] Framework packages are within 1 minor version of latest
- [ ] Security-sensitive packages are on latest patch
- [ ] No packages >2 major versions behind
- [ ] No unmaintained packages (>2 years without release)
- [ ] Update strategy is documented or automated (Dependabot, Renovate)

---

## Dimension 3: Dependency Bloat

**Question: Are we carrying more weight than we need?**

```bash
# Count total dependencies
npm ls --all 2>/dev/null | wc -l

# Count direct dependencies
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('deps:', len(d.get('dependencies',{})), 'devDeps:', len(d.get('devDependencies',{})))" 2>/dev/null || echo "check package.json manually"

# Check installed size
du -sh node_modules/ 2>/dev/null
```

### Heavy Dependencies
Read `package.json` and for each dependency, assess:
- Is this a "kitchen sink" package where we only use one function?
  - Example: pulling in all of `lodash` for `_.get` (use optional chaining instead)
  - Example: pulling in `moment` for date formatting (use `Intl.DateTimeFormat` or `date-fns`)
- Could the functionality be achieved with a lighter alternative or native API?
- Does the package significantly increase bundle size?

### Duplicate Functionality
Check for packages that overlap:
- Two date libraries (moment + date-fns + dayjs)
- Two HTTP clients (axios + node-fetch + got)
- Two validation libraries (zod + yup + joi)
- Two CSS solutions (tailwind + styled-components + emotion)
- Two testing frameworks
- Two ORM/query builders

### Phantom Dependencies
- Check for imports that reference packages not listed in `package.json` (resolved through hoisting but not declared)
```bash
# Find all external imports
grep -rh "from ['\"]" src/ --include="*.ts" --include="*.tsx" | grep -v "from ['\"][@./]" | sort -u
```
- Cross-reference against `package.json` dependencies

### Checklist:
- [ ] Total dependency count is reasonable (<150 total, <30 direct)
- [ ] No kitchen-sink packages used for single functions
- [ ] No duplicate-functionality packages
- [ ] No phantom dependencies (imported but not in package.json)
- [ ] node_modules size is reasonable (<500MB)
- [ ] devDependencies are correctly categorised (not in dependencies)

---

## Dimension 4: Lock File Health

**Question: Are builds reproducible? Will `npm ci` produce the same result everywhere?**

- Check: Is `package-lock.json` committed to git?
```bash
git ls-files package-lock.json
```
- Check: Is the lock file in sync with `package.json`?
```bash
# This should produce no changes
npm ls 2>&1 | tail -5
```
- Check: Are there any `overrides` or `resolutions` in `package.json`? (Indicate forced version pins)
- Check: Is there a `.npmrc` with custom registry configuration?
- Check: Are there any `file:` or `link:` dependencies? (Local path dependencies)
- Check: Does CI use `npm ci` (reproducible) or `npm install` (non-deterministic)?

### Checklist:
- [ ] `package-lock.json` is committed to git
- [ ] Lock file is in sync with `package.json`
- [ ] CI uses `npm ci`, not `npm install`
- [ ] No `file:` or `link:` dependencies in production
- [ ] Any `overrides`/`resolutions` are documented with reasons
- [ ] No custom registry that could be compromised

---

## Dimension 5: Supply Chain Risk

**Question: How exposed are we to a compromised or hijacked package?**

### Maintainer Risk
For each direct dependency, check:
- Is it maintained by an organisation or a single person?
- Has it changed ownership recently? (npm package transfers can be attack vectors)
- Does it have a large, active contributor base or just one author?

Focus on packages with high privilege:
- Packages that access the filesystem (`fs`, file upload handlers)
- Packages that make network requests (HTTP clients, API SDKs)
- Packages that handle credentials (auth libraries, JWT, session)
- Packages that process user input (parsers, validators, sanitisers)

### Install Scripts
```bash
# Check for packages with install scripts (potential attack vector)
npm ls --json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('Check package.json scripts for preinstall/postinstall hooks')
except: pass
" 2>/dev/null || echo "check manually"
```

- `preinstall`, `install`, `postinstall` scripts run arbitrary code during `npm install`
- These are the primary vector for supply chain attacks
- Flag any dependency with install scripts

### Typosquatting Risk
- Check for package names that are similar to popular packages but slightly different
- Check for packages with very low download counts relative to their apparent importance

### Checklist:
- [ ] High-privilege packages are from reputable sources
- [ ] No dependencies with suspicious install scripts
- [ ] No recently-transferred packages without investigation
- [ ] No single-maintainer packages in security-critical paths
- [ ] No typosquat-risk package names

---

## Step 2: Build Impact Assessment

```bash
# Check build output size
npm run build 2>&1 | tail -20
```

- What's the total bundle size?
- Are there any dependencies that should be server-only but are bundled for the client?
- Are source maps configured correctly? (Not shipped to production with sensitive paths)

---

## Step 3: Report

### Summary
One paragraph: overall dependency health. Are we lean and secure, or carrying risk?

### Scorecard

| Dimension | Score (/5) | Key Finding |
|-----------|-----------|-------------|
| Vulnerabilities | | |
| Outdated Packages | | |
| Bloat | | |
| Lock File Health | | |
| Supply Chain Risk | | |

**Scoring:**
- 5 = Lean, secure, up to date
- 4 = Minor issues, low risk
- 3 = Notable gaps, should address
- 2 = Significant risk, update needed
- 1 = Critical vulnerabilities or supply chain risk

### Critical Vulnerabilities
- Package, vulnerability, severity, fix available?, patient data risk

### Update Recommendations
Prioritised by risk:
- Package, current → latest, breaking changes?, effort

### Bloat Candidates
Packages to replace or remove:
- Package, what we use it for, lighter alternative, effort to replace

### Supply Chain Concerns
- Package, concern, mitigation

### Passed Checks
- Dependencies that are well-managed

### Dependency Inventory
Full table of direct dependencies:

| Package | Version | Latest | Purpose | Risk Level |
|---------|---------|--------|---------|------------|
| ... | ... | ... | ... | ... |

## Key Files Reference

| File | Dependency Role |
|------|----------------|
| `package.json` | Direct dependency declarations |
| `package-lock.json` | Pinned dependency tree |
| `.npmrc` | npm configuration (registries, auth) |
| `.github/workflows/ci.yml` | CI pipeline — check for `npm ci` vs `npm install` |
| `next.config.ts` | Bundle configuration, external packages |
| `Dockerfile` | Production build — check for dev dependency exclusion |

## Healthcare-Specific Concerns

In a healthcare CRM handling Australian patient data:
- **Any vulnerability affecting data confidentiality is automatically Critical** — patient health information is protected under the Privacy Act 1988
- **Auth/session packages must be current** — a session fixation or JWT bypass exposes all patient records
- **Crypto packages must be current** — backup encryption, token hashing, and password storage all depend on these
- **Parser packages (CSV, JSON, vCard, iCal) are high-risk** — they process external input that could be crafted by an attacker
- **Database packages (Prisma) must be current** — SQL injection protections evolve with each release
