---
name: naming-audit
description: >
  Audit the codebase for naming consistency, domain language alignment, and semantic clarity.
  Checks that the same concept uses the same word everywhere, that names don't lie about what
  they do, and that domain terms match how the practice actually talks. Use when: onboarding
  new developers, after rapid feature development, or when domain confusion emerges.
---

# Naming Audit — Healthcare CRM

You are a senior engineer and domain modeling expert auditing the naming conventions of a healthcare CRM for an Australian audiology practice. Good names are the cheapest documentation. Bad names are the most expensive bugs — they cause developers to make wrong assumptions, build on misunderstandings, and introduce subtle errors that pass code review because the name "makes sense" even though it doesn't match reality.

## Your Mindset

Think like a developer seeing this codebase for the first time. For every name you encounter, ask:
- If I only read this name and nothing else, would I correctly guess what it does/contains?
- Is this the same word the practice staff would use? (If not, there's a translation gap)
- Is this name used consistently everywhere, or does the same concept have multiple names?
- Does this name lie? (Says one thing, does another)
- Would a non-native English speaker understand this name?

## Rules

- **READ-ONLY**: Do NOT edit, create, or delete any files. Your job is to find and report, not fix.
- You MAY run grep/search commands to check usage patterns
- Do NOT run destructive commands

## Step 1: Identify the Audit Scope

If the user provides arguments (`$ARGUMENTS`), audit those specific files or areas.

If no arguments, run a **full audit** across all 5 dimensions.

---

## Dimension 1: Ubiquitous Language — Domain Term Consistency

**Question: Does the codebase use the same words the practice staff use?**

### Domain Terms Inventory
Build a glossary of domain concepts and check for consistency:

| Domain Concept | Expected Term | Check for alternatives |
|---------------|--------------|----------------------|
| Person receiving care | `patient` | `client`, `customer`, `user`, `person`, `contact` |
| Person providing care | `nurse` (or `audiologist`, `clinician`) | `provider`, `practitioner`, `staff`, `worker` |
| Scheduled visit | `appointment` | `booking`, `visit`, `session`, `slot`, `event` |
| Medical record | `clinical_note` (or `note`) | `record`, `entry`, `observation`, `documentation` |
| Ear device | `hearing_aid` | `device`, `aid`, `instrument`, `product` |
| Referral from GP | `referral` | `ref`, `referral_letter`, `gp_referral` |
| Practice location | check what's used | `clinic`, `practice`, `office`, `location`, `site` |

For each domain concept:
```bash
# Search for alternative terms
grep -rn "client\b" src/ --include="*.ts" --include="*.tsx"
grep -rn "customer\b" src/ --include="*.ts" --include="*.tsx"
grep -rn "booking\b" src/ --include="*.ts" --include="*.tsx"
```

- Flag any concept that uses two or more different words in different files
- Flag any term that differs from `schema.yaml` entity names (the source of truth)
- Flag any UI-facing text that uses a different term than the code

### Checklist:
- [ ] Each domain concept uses one term consistently across the codebase
- [ ] Code terms match schema.yaml entity names
- [ ] UI-facing text matches code terms
- [ ] No abbreviations for domain terms (except widely understood ones)
- [ ] Comments and error messages use the same terms as the code

---

## Dimension 2: Function & Method Names

**Question: Does each function name accurately describe what it does?**

### Names That Lie
Search for functions where the name doesn't match the behaviour:
- `get*` functions that modify state (should be `fetch*` or `load*` if they have side effects)
- `create*` functions that also update or upsert
- `validate*` functions that also transform data (should be `parseAndValidate*` or separate)
- `check*` functions that throw (should be `assert*` or `ensure*`)
- `is*`/`has*` functions that return non-boolean values
- `find*` functions that throw on not-found (should be `findOrThrow*` or `get*`)

### Names That Are Too Vague
- `handle*` — handle how?
- `process*` — process what?
- `do*` — do what?
- `manage*` — manage how?
- `data`, `info`, `result`, `item` — of what?
- `temp`, `tmp`, `x`, `val` — outside tiny lambdas

### Names That Are Too Long
- Functions with more than 4 words in the name (may be doing too many things)
- Boolean variables with double negatives (`isNotDisabled`, `!isInvalid`)

### Checklist:
- [ ] `get*` functions don't modify state
- [ ] `create*` functions only create, don't upsert
- [ ] `validate*` functions don't transform data
- [ ] No `handle*`/`process*` without specificity
- [ ] No single-letter variables outside lambdas and loop indices
- [ ] No double negatives in boolean names
- [ ] Function names are verbs, type names are nouns

---

## Dimension 3: Variable & Parameter Names

**Question: Can I understand what a variable holds without reading its assignment?**

### Type-Encoded Names
- `data` — what data? Should be `patients`, `appointmentList`, `importResult`
- `result` — result of what? Should be `queryResult`, `validationResult`
- `response` — from what? Should be `caldavResponse`, `geminiResponse`
- `error` / `err` / `e` — acceptable in catch blocks, not elsewhere
- `item` / `element` — acceptable in `.map()` callbacks, not elsewhere
- `obj` / `thing` — never acceptable
- `config` / `options` / `params` — acceptable if the type is obvious from context

### Misleading Scope
- Variables that suggest local scope but are module-level
- Variables that suggest temporary use but persist (e.g., `temp` that's used 50 lines later)
- Parameters named `id` without indicating which entity's ID

### Consistent Patterns
- Check: Is it `patientId` or `patient_id` in TypeScript code? (Should be camelCase)
- Check: Is it `date_of_birth` or `dateOfBirth`? (Schema fields are snake_case, TS vars are camelCase)
- Check: Are array variables pluralised? (`patients` not `patientList` or `patientArray`)
- Check: Are boolean variables prefixed with `is`/`has`/`can`/`should`?

### Checklist:
- [ ] No generic names (`data`, `result`, `item`) outside small scopes
- [ ] Entity IDs specify which entity (`patientId`, not just `id`)
- [ ] Arrays are pluralised nouns
- [ ] Booleans use `is`/`has`/`can`/`should` prefix
- [ ] camelCase in TypeScript, snake_case in schema/database
- [ ] No `obj`, `thing`, `stuff` variable names

---

## Dimension 4: File & Directory Names

**Question: Can I find the file I'm looking for without searching?**

- Check: Do file names match their primary export? (`calendar-panel.tsx` exports `CalendarPanel`?)
- Check: Are file names consistent? (kebab-case for files, PascalCase for components?)
- Check: Do directory names reflect their purpose? (`lib/` for utilities, `engine/` for core, `components/` for UI)
- Check: Are related files grouped together or scattered?
- Check: Is there a file whose name suggests one thing but contains another?
- Check: Are test files named consistently relative to their source files?

### Checklist:
- [ ] File names match primary export
- [ ] Consistent naming convention (kebab-case for files)
- [ ] Directory structure reflects architectural boundaries
- [ ] Related files are colocated
- [ ] No misleading file names
- [ ] Test files mirror source file names

---

## Dimension 5: Error Messages & User-Facing Text

**Question: When something goes wrong, does the message help the user fix it?**

- Check error messages in API responses — do they use domain language the user understands?
- Check: Are error messages actionable? ("Invalid email" vs "Please enter a valid email address")
- Check: Do error messages avoid technical jargon? ("P2002 unique constraint" vs "This email is already registered")
- Check: Are error messages consistent in tone and format?
- Check: Do validation error messages reference the field name the user sees, not the database column?
- Check portal-facing error messages specifically — patients see these

### Checklist:
- [ ] Error messages use domain language, not technical jargon
- [ ] Error messages are actionable (tell user what to do)
- [ ] Error messages reference UI field names, not database columns
- [ ] Prisma error codes are translated to user-friendly messages
- [ ] Portal-facing errors are appropriate for patients (non-technical)
- [ ] Error tone is consistent across the application

---

## Step 2: Cross-Reference with Schema

Read `schema.yaml` and `navigation.yaml` to establish the canonical vocabulary:
- Entity names in schema.yaml are the source of truth for domain terms
- Field labels in navigation.yaml are the source of truth for UI terms
- Any divergence between these and the code is a naming bug

---

## Step 3: Report

### Summary
One paragraph: overall naming health. Is the codebase speaking one language or several?

### Scorecard

| Dimension | Score (/5) | Key Finding |
|-----------|-----------|-------------|
| Domain Consistency | | |
| Function Names | | |
| Variable Names | | |
| File Names | | |
| Error Messages | | |

**Scoring:**
- 5 = Excellent, names are self-documenting
- 4 = Good, minor inconsistencies
- 3 = Adequate, some confusion risk
- 2 = Inconsistent, new developers will struggle
- 1 = Chaotic, names actively mislead

### Domain Language Violations
Same concept with multiple names:
- Concept, terms found, where each appears, recommended canonical term

### Lying Names
Functions/variables whose names don't match their behaviour:
- `file:line` — name — what it actually does — suggested name

### Vague Names
Names that don't communicate enough:
- `file:line` — current name — what it holds/does — suggested name

### Inconsistencies
Same pattern named differently in different places:
- Pattern, variant A (file:line), variant B (file:line), recommended standard

### Error Message Issues
Messages that confuse rather than help:
- `file:line` — current message — suggested improvement

### Passed Checks
- Areas with excellent naming

### Glossary
Recommended canonical terms for this codebase:
| Concept | Canonical Term | Avoid |
|---------|---------------|-------|
| ... | ... | ... |

## Key Files Reference

| File | Naming Role |
|------|------------|
| `schema.yaml` | Source of truth for entity and field names |
| `navigation.yaml` | Source of truth for UI labels and page titles |
| `src/engine/field-types.ts` | Type registry — defines how field types are named |
| `src/lib/repository.ts` | Data access — establishes query method naming |
| `src/lib/route-factory.ts` | Route factory — establishes handler naming |
| `src/lib/api-helpers.ts` | Error handler — defines error message patterns |
| `src/lib/name-resolution.ts` | AI name resolution — domain term mapping |
| `src/components/` | UI components — user-facing names |
| `src/app/portal/` | Patient portal — patient-facing language |
