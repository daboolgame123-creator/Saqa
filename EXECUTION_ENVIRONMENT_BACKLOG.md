# ALSQAYA — Execution Environment Backlog

**Purpose:** Living queue for external tests, partially complete work, dependencies and independent preparatory work.
**Required policy:** [EXECUTION_ENVIRONMENT_POLICY.md](EXECUTION_ENVIRONMENT_POLICY.md)
**Do not treat this backlog as test evidence or phase closure.**

## Open items

### 23-C1b4 — Employee own time-permission reporting

- **Classification:** HYBRID
- **Status:** WAITING_EXTERNAL (verification); not CLOSED.
- **Phase:** 23 (OPEN; HTTP `503 REPORTS_UNAVAILABLE` remains mandatory).
- **Last observed branch HEAD while defining policy:** `54916466e719ac1f1ae87b7d7ff32f041115fa28`. Recheck before test or edits.
- **Completed/observed:** Guard includes `timePermissions` as the fourth internally owner-scoped report source; synthetic two-employee migrated-PostgreSQL, service/export and forged-scope tests are present in `server/tests/db/reportPersonnel.test.ts`; other seven employee report kinds remain denied by shared guard.
- **Not independently verified:** Successful execution of focused PostgreSQL tests, full gated CI for the exact final code SHA, independent security review and closure evidence.
- **Dependencies:** Real migrated synthetic PostgreSQL test environment and CI runner; no real personnel data.
- **External required:** Run focused and full project checks using verified `package.json` scripts/workflow, confirm exact successful run + logs and review SQL/permission behavior. If CI is available inside a future ChatGPT session and results can be independently verified, reclassify accordingly.
- **Acceptance evidence:** exact Git commit SHA, test names/counts and failures, run/job links, review outcome, explicit confirmation HTTP 503 remains, update of `PHASE_23_SECURE_CLOSURE_CHECKLIST.md`.
- **Blocked_by:** none known for test execution; successful test evidence missing for closure.
- **Next independent candidate:** examine C1c source-by-source **planning and static review only**, contingent on dependency/security check and user authorization; do not activate book report access, implement dependent authorization or declare C1c complete without C1b4 closure.
- **Last reviewed:** 2026-11-06.

## Operating rules

For every new unresolved task add: task ID, phase, classification, status, dependencies, blocked_by, completed_here, remaining_external, environment, exact commands after verifying scripts, acceptance evidence, latest checked SHA, and next independent candidate. Update on every return; never replace missing evidence with a claimed pass. Phase 23 cannot close while required tasks remain pending.
