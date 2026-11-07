# ALSQAYA — Agent execution protocol

## Read first on every new conversation / task (mandatory)

> **Multi-agent OpenCode deployment (owner decision 2026-11-07):** Read [OPENCODE_MULTI_AGENT_POLICY.md](OPENCODE_MULTI_AGENT_POLICY.md) before delegating parallel coding tasks. Verify repository identity, isolated branches, token budgets and Phase 23 security gates; this is complementary to the delivery policy, not permission to merge or enable reports.

1. **Current full inventory:** [ALSQAYA_FULL_INVENTORY_2026-11-07.md](ALSQAYA_FULL_INVENTORY_2026-11-07.md) — verified milestones, OpenCode checks, pending and not-started phases. It is a dated snapshot: refresh GitHub HEAD/PR/CI before relying on it.
2. **Practical delivery rules:** [DELIVERY_AND_INTEGRATION_POLICY.md](DELIVERY_AND_INTEGRATION_POLICY.md) — finish bounded tasks, review/unblock draft PRs, prefer usable end-to-end milestones and do not waste time on marginal repeated hardening.
3. **Execution classification:** [EXECUTION_ENVIRONMENT_POLICY.md](EXECUTION_ENVIRONMENT_POLICY.md) and [EXECUTION_ENVIRONMENT_BACKLOG.md](EXECUTION_ENVIRONMENT_BACKLOG.md).
4. **Binding business authority:** [ALSQAYA_PLAN.md](ALSQAYA_PLAN.md). Never weaken security gates to implement the delivery policy.

## Mandatory dual-lane status at each new conversation / task

**Always state both tracks before executing any task:**
- **CHAT (this assistant):** the exact task/branch it will execute now; independent of OpenCode's pending changes.
- **OPENCODE (external model):** the latest **user-confirmed** active task/branch, or say its current status is unknown; do not infer it from mere repository activity.
- **Handoff:** when ChatGPT reaches work that requires OpenCode/local runtime, immediately tell the user why and ask only whether to document the blocker or supply an OpenCode prompt. Respect the user's direction; continue only with independent work.
- **Results:** after every finished task, show a **concise** evidence summary (scope, tests + SHA/PR, open gate, next task). Store full details in repo docs/PR, not repetitive chat reports.

The binding detailed rules and current assignment snapshot are in [DELIVERY_AND_INTEGRATION_POLICY.md](DELIVERY_AND_INTEGRATION_POLICY.md), section **نموذج العمل الثنائي الملزم**. This requirement persists into future conversations, and user-confirmed OpenCode task updates take precedence over a dated snapshot.

All new tasks still require **analysis/plan BEFORE implementation, actual test evidence, security review, and explicit distinction between coded, CI-verified, merged, usable and production-ready**. Draft PR #2 (C2), #3 (C4), #4 (C1c incoming) are not merged at the inventory date. Do not edit the branch currently under OpenCode verification without coordinating that work.

This file applies to any coding agent working in this repository.


## Task environment and dependency routing (mandatory across phases)

Before starting or skipping any task, read [EXECUTION_ENVIRONMENT_POLICY.md](EXECUTION_ENVIRONMENT_POLICY.md) and classify it as CHAT, EXTERNAL, HYBRID or BLOCKED. Track external requirements and blockers with exact evidence in `EXECUTION_ENVIRONMENT_BACKLOG.md`. An independent preparatory task may proceed only with user authorization and without treating an earlier phase as closed; never bypass required security gates or claim unrun tests succeeded.

## Mandatory sequence for every implementation task

1. **Plan before editing.** State the objective, the files/areas involved, constraints and protected boundaries, the intended tests, and the completion criteria. For multi-step work, record the plan or checklist in the relevant phase plan before implementation. A short single-task plan is still required.
2. **Inspect the current branch and code** to avoid assumptions, duplicate changes, and stale information. Respect prior project decisions.
3. **Implement only the planned scope.** Prefer minimal, reversible commits. Do not silently broaden scope.
4. **Test and examine evidence.** Run relevant unit, integration, security and CI checks. A green overall job does not prove experimental, non-gating probes passed. If checks fail, fix the cause and retest.
5. **Independent review and documentation.** Record exact commits, CI run IDs, pass/fail evidence, risks and remaining steps. Update the living plan to distinguish verified, partial and blocked milestones.
6. **Report truthfully.** Never label partially implemented features production-ready; do not claim an unrun test passed.

## Boundaries

- Never enable Phase 23 report HTTP routes while the explicit `503 REPORTS_UNAVAILABLE` security gate remains in place.
- No modification of permissions, access scopes, authentication, sensitive records or the `main` branch without explicit authorization and independent security review.
- No real personnel data in synthetic security, PDF, or browser test fixtures.
- Browser test `--no-sandbox` is CI-only and is not an approved deployment policy.
- Deferred Phase 22 OCR remains a separate scope.
- Stop at verifiable milestones, commit/checkpoint incrementally and retain a rollback path.

## P1k S5 immediate plan

Goal: demonstrate that simulated browser crashes, partial output and process timeouts fail closed and clean temporary workspaces, without modifying live report routes.

Steps: inspect current internal renderer and tests; add synthetic negative regression tests; run focused CI; fix regressions; document exact verified outcomes and remaining deployment blockers.
