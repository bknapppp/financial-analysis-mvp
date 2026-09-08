# Broadstone Autonomous Engineering Operating Contract

## Purpose

This document defines how autonomous engineering agents may inspect, change, test, review, and hand off work in the Broadstone repository. GitHub is the durable coordination layer. Agents do not rely on private conversational context to understand project state.

## Core principles

1. Never write directly to `main` or the active human development branch.
2. Every autonomous code change must originate from a bounded GitHub issue or equivalent scoped task.
3. Every autonomous code change must occur on an isolated branch.
4. Every autonomous code change must end in a pull request.
5. Agents must leave durable handoff notes in GitHub issues, commits, pull requests, review comments, or CI results.
6. Human approval remains required before merge unless an explicit future policy permits auto-merge for a narrowly defined low-risk class.
7. High-risk domains require stricter review and may not be materially changed without explicit approval.

## Roles

### Engineering Lead

Responsibilities:
- Inspect repository state, open issues, open PRs, failing CI, recent commits, and current roadmap.
- Decompose larger projects into bounded implementation issues.
- Mark only ready, dependency-cleared work for autonomous execution.
- Avoid assigning overlapping file ownership to concurrent agents when practical.
- Escalate architectural ambiguity rather than inventing new product semantics.

The Engineering Lead does not implement code by default.

### Builder

Responsibilities:
- Take exactly one ready issue at a time.
- Create or use a dedicated task branch.
- Implement only the scoped acceptance criteria.
- Add or update tests appropriate to the change.
- Run the required validation commands.
- Open a pull request with a structured handoff.
- Stop when blocked rather than broadening scope silently.

### Reviewer / QA

Responsibilities:
- Review Builder pull requests independently.
- Inspect changed files, test coverage, CI status, and acceptance criteria.
- Check for regressions in financial logic, security boundaries, data lineage, and workflow behavior.
- Approve only when requirements are satisfied.
- Request concrete changes when they are not.
- Never merge automatically under the initial policy.

## Issue contract

Every agent-executable issue should contain:

- Objective
- Business context
- In scope
- Out of scope
- Acceptance criteria
- Required tests
- Dependencies
- Risk class
- Files or subsystems likely affected, when known
- Handoff requirements

Preferred title format:

`BS-###: <bounded outcome>`

Examples:

- `BS-201: Add secure intake token lifecycle`
- `BS-202: Create source package on client submission`
- `BUG-042: Fix Source Data route losing company context`

## Branch contract

Preferred branch patterns:

- `agent/BS-201-secure-intake-token`
- `agent/BUG-042-source-data-routing`
- `agent/UX-018-request-status-empty-state`

Rules:
- Branch from the currently designated automation integration base.
- Do not reuse a branch for unrelated work.
- Do not force-push unless a task explicitly requires it and the branch is agent-owned.
- Do not modify release tags.

## Pull request contract

Every autonomous PR must include:

### Summary
What changed and why.

### Issue
The issue or task being implemented.

### Scope
What was changed and what was intentionally not changed.

### Validation
Exact tests, lint, typecheck, build, or migration validation performed.

### Risk
Low / Medium / High, with a short explanation.

### Data / schema impact
Explicitly state whether migrations, RLS, storage policies, financial formulas, evidence lineage, auth, or production configuration changed.

### Reviewer notes
Anything the Reviewer or human approver should inspect closely.

## Risk classification

### Low risk
Examples:
- UI copy
- styling defects
- accessibility fixes
- broken navigation with obvious intended behavior
- isolated loading/error states
- test-only changes
- non-semantic refactors with preserved behavior

Agents may implement these autonomously but still require PR review and human merge under the initial policy.

### Medium risk
Examples:
- bounded workflow changes
- API behavior changes without security boundary changes
- new UI-backed persistence using existing approved patterns
- performance fixes
- non-destructive schema additions

Require Builder implementation, independent Reviewer/QA review, and human merge approval.

### High risk
Examples:
- database migrations that alter or delete existing data
- RLS or storage policy changes
- authentication or authorization changes
- evidence lineage or provenance changes
- financial formulas or canonical calculations
- destructive schema changes
- production secrets/configuration
- automated external communication
- broad dependency upgrades with runtime impact

Agents may investigate and prepare a PR, but the PR must not be merged without explicit human approval. If the issue lacks an approved design, stop and escalate before implementation.

## Validation baseline

Unless a task documents otherwise, autonomous implementation should run the applicable project checks from `package.json`, including tests, lint, and build/type validation where feasible.

A PR must never claim a test passed if it was not actually executed.

If validation cannot run because of environment limitations, state that explicitly in the PR and leave the work unapproved.

## Coordination protocol

GitHub is the shared memory and communication bus.

Agents coordinate through:
- issue state and comments
- branch names
- commits
- pull request descriptions
- review comments
- CI results

Agents must read the current durable state before acting. They must not assume that a previous conversational instruction is still current if GitHub shows otherwise.

## Concurrency rules

- Prefer one active Builder per tightly coupled subsystem.
- Avoid parallel edits to the same migration, workflow file, route, or canonical financial module.
- If another active PR overlaps materially, the later agent should stop or choose a non-overlapping issue.
- Reviewer/QA may review concurrently but must evaluate the actual latest PR head.

## Human approval policy: initial phase

For the initial rollout:
- No autonomous merges.
- No autonomous changes directly to `main`.
- No autonomous changes directly to `feature/broadstone-demo-redesign`.
- No autonomous release tagging.
- No autonomous production deployment.

The automation system may autonomously inspect, plan, branch, code, test, push, open PRs, review, and request remediation.

## Initial automation rollout

Phase A:
1. Engineering Lead creates/decomposes issues.
2. Builder implements one ready issue.
3. Reviewer/QA independently reviews the PR.
4. Human approves and merges.

Phase B, only after the loop is reliable:
- Add specialized Bug Fixer, UX Engineer, and Financial Integrity Reviewer roles.
- Consider auto-merge only for explicitly whitelisted low-risk classes with passing CI and independent review.

## First target project

The first multi-step project intended to validate this operating model is Secure Client Intake integrated with the existing Information Requests workflow.

The expected project decomposition will cover request/intake architecture, secure token lifecycle, external upload experience, source package creation, evidence ingestion, Information Requests status integration, security review, and end-to-end regression coverage.
