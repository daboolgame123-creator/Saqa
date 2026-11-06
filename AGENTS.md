# ALSQAYA — Agent execution protocol

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
