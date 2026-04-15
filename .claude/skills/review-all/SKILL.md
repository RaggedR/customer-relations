---
name: review-all
description: >
  Run all five read-only audit agents with a synthesised report. Supports two topologies:
  star (parallel, fast) and ring (sequential with context passing, deep). Use "star" for
  quick checks, "ring" for thorough pre-ship review with architectural root-cause analysis.
  Default: star. Does NOT include e2e-tests (that's a builder, not an auditor).
---

# Parallel Review Pipeline

You are an orchestrator. Your job is to launch review agents, collect their reports, and synthesise the results. You do NOT review code yourself — you delegate and summarise.

## Step 0: Determine Topology

Check `$ARGUMENTS` for the keyword `ring` or `star`.

- If `ring` → go to **Ring Topology**
- If `star` or no topology specified → go to **Star Topology**

Any remaining arguments (after removing `ring`/`star`) are the **scope** passed to each agent.

---

## Star Topology (default — fast, independent)

All five agents run in parallel. No agent sees another's findings.

### Launch all five in a single message

Use the Agent tool to spawn **all five agents in ONE message** with `model: "sonnet"`.

Each agent's prompt:

```
First, read ~/.claude/AGENT.md for instructions.

You are running a review of the healthcare CRM codebase.
Scope: {scope or "full review"}

Invoke the skill /<skill-name> and return your full report.
```

| Agent description | Skill |
|-------------------|-------|
| "Architecture review" | `/architect` |
| "Code style review" | `/style-review` |
| "Security audit" | `/security-audit` |
| "Compliance audit" | `/compliance-audit` |
| "Production readiness audit" | `/production-ready` |

**CRITICAL:** All five must be launched in ONE message. Sequential launch defeats the purpose.

Then skip to **Synthesise**.

---

## Ring Topology (deep — sequential with context passing)

Agents run one at a time. Each receives the accumulated findings from all previous agents. The architect runs twice: once at the start (fresh structural analysis) and once at the end (root-cause analysis of all findings).

```
Arch₁ → Style → Security → Compliance → Production → Arch₂ → Report
```

### Agent 1: Architecture (first pass)

Launch with `model: "sonnet"`:

```
First, read ~/.claude/AGENT.md for instructions.

You are running a review of the healthcare CRM codebase.
Scope: {scope or "full review"}

Invoke the skill /architect and return your full report.
```

### Agent 2: Code Style

Launch with `model: "sonnet"`. Include Agent 1's report:

```
First, read ~/.claude/AGENT.md for instructions.

You are running a review of the healthcare CRM codebase.
Scope: {scope or "full review"}

Prior findings from the architecture reviewer:
---
{Agent 1 report}
---

Build on these findings where relevant. Reference architectural concerns
that manifest as style issues. Do not duplicate what's already been found.

Invoke the skill /style-review and return your full report.
```

### Agent 3: Security

Launch with `model: "sonnet"`. Include Agents 1-2 reports:

```
First, read ~/.claude/AGENT.md for instructions.

You are running a review of the healthcare CRM codebase.
Scope: {scope or "full review"}

Prior findings from other reviewers:
---
{Agent 1 + Agent 2 reports}
---

Build on these findings where relevant. Architectural weaknesses and code
style issues may indicate security risks. Do not duplicate what's already
been found.

Invoke the skill /security-audit and return your full report.
```

### Agent 4: Compliance

Launch with `model: "sonnet"`. Include Agents 1-3 reports:

```
First, read ~/.claude/AGENT.md for instructions.

You are running a review of the healthcare CRM codebase.
Scope: {scope or "full review"}

Prior findings from other reviewers:
---
{Agent 1 + Agent 2 + Agent 3 reports}
---

Build on these findings where relevant. Security gaps may have compliance
implications under the Australian Privacy Act. Do not duplicate what's
already been found.

Invoke the skill /compliance-audit and return your full report.
```

### Agent 5: Production Readiness

Launch with `model: "sonnet"`. Include Agents 1-4 reports:

```
First, read ~/.claude/AGENT.md for instructions.

You are running a review of the healthcare CRM codebase.
Scope: {scope or "full review"}

Prior findings from other reviewers:
---
{Agent 1 + Agent 2 + Agent 3 + Agent 4 reports}
---

Build on these findings where relevant. Architectural, security, and
compliance issues often have operational consequences. Do not duplicate
what's already been found.

Invoke the skill /production-ready and return your full report.
```

### Agent 6: Architecture (second pass — root cause analysis)

Launch with `model: "sonnet"`. Include ALL prior reports:

```
First, read ~/.claude/AGENT.md for instructions.

You already ran an initial architecture review (first report below). Now you
have findings from style, security, compliance, and production reviewers.

Your job on this SECOND PASS: identify which of their findings are symptoms
of architectural problems. For example:
- A security gap caused by a leaky abstraction
- A compliance issue stemming from poor information hiding
- A production concern indicating a missing module boundary
- A style issue caused by wrong decomposition

Focus on ROOT CAUSES, not symptoms. Which architectural changes would
eliminate multiple findings at once?

All prior findings:
---
{All 5 reports}
---

Invoke the skill /architect and return a focused report on architectural
root causes behind the other reviewers' findings.
```

Then continue to **Synthesise**.

---

## Synthesise

Once all agents have returned, produce a single report:

### Dashboard

| Reviewer | Top Finding |
|----------|-------------|
| Architect | ... |
| Style | ... |
| Security | ... |
| Compliance | ... |
| Production Ready | ... |
| Architect (root causes) | ... |  ← ring only

### Cross-Cutting Themes

Findings flagged by multiple reviewers. In ring mode, the architect's second pass identifies these explicitly — highlight architectural root causes that would fix multiple downstream findings.

### Prioritised Action Items

Merge and deduplicate all findings into one list:

1. **Critical** — blocks deployment
2. **High** — fix before shipping
3. **Medium** — fix soon
4. **Low** — defence-in-depth

For each item: which reviewer(s) flagged it, file:line, recommended fix, effort (S/M/L).

In ring mode, mark items that the architect's second pass identified as symptoms of a deeper architectural issue — fixing the root cause may resolve several items at once.

### What's Working Well

Collect passed checks and praise from all reports.

## Rules

- Do NOT review code yourself — delegate only
- Do NOT edit any files — read-only pipeline
- Do NOT include e2e-tests — it's a builder, not an auditor
- In star mode: do NOT launch agents sequentially
- In ring mode: do NOT launch agents in parallel — each needs the previous report
- Each agent MUST be spawned with `model: "sonnet"`
