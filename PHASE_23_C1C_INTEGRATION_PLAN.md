# Phase 23 — C1c-S2 combined temporary integration plan

**Date:** 2026-11-07
**Classification:** HYBRID (source integration here; independent review and any required host/Docker evidence remain external)
**Status:** IN PROGRESS — plan recorded before merge; not a success claim.

## Objective

Build a disposable integration branch that combines the already-tested six-part
snapshot with PR #4 (C1c-S2 incoming-only employee report scope), verify it on
synthetic data, and stop without any production or base-branch merge.

## Fixed references

- Integration snapshot: `origin/integration/phase-23-chat-dry-run-20261107`
  at `4f59aafbfe0ba896c0d30ea460166fa917b9ecb3`.
- C1c/PR #4: `origin/development/phase-23-c1c-incoming-isolated-20261107`
  at `a24b48f02543a317bfcd231daeb4647d47c59b98`.
- Base branch: `origin/development/phase-23-wip-20261105`
  at `9bcfe175ac0b245cb757a7b7baee9de234eca01b`.
- New temporary branch: `integration/phase-23-c1c-combined-20261107`,
  created from the integration snapshot SHA above.

## Scope

1. Merge PR #4 into the new branch only. Do not modify the C1c branch, the six
   isolated branches, the WIP base branch, or `main`.
2. Preserve both C1c and C3 regression tests in `server/tests/reportP0.test.ts`
   and in the focused C1c/C3 suites.
3. Run lint, server, migrated PostgreSQL, API, build, employee-scope, Excel,
   PDF-isolation, P0, and synthetic Docker-inspect checks.
4. Record exact-SHA evidence and attempt branch CI.
5. Perform a security review of employee visibility, report filters, summary
   counts, and export parity.

## Protected boundaries

- `HTTP 503 REPORTS_UNAVAILABLE` stays in force.
- C1d owner-export and official PDF renderer services stay disabled/unwired.
- No production merge, no `main` merge, no real personnel data.
- No permission, authentication, or access-scope widening beyond the already
  reviewed C1c-S2 incoming-only rule.
- Windows/environment failures are recorded as failures, never converted into
  passes.

## Acceptance criteria

- Merge result contains the six-part snapshot plus C1c-S2 changes with no lost
  C3 tests.
- All runnable command groups pass on the final SHA; any skipped/unrunnable
  group is explicitly labeled and not counted as success.
- Employee sees only public or personally granted, non-daily, non-deleted
  incoming books; summary and XLSX parity match that authorized set.
- Filters only narrow; forged scopes fail before SQL.
- Final verdict is `READY FOR REVIEW` or `BLOCKED`, with evidence.
