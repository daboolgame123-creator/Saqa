# ALSQAYA — Execution Environment Backlog

**Purpose:** Living queue for external tests, partially complete work, dependencies and independent preparatory work.
**Required policy:** [EXECUTION_ENVIRONMENT_POLICY.md](EXECUTION_ENVIRONMENT_POLICY.md)
**Do not treat this backlog as test evidence or phase closure.**

## Open items

### 23-C1c — Employee book-report visibility and aggregation

- **Classification:** HYBRID.
- **Status:** C1c-S1 CODE + TESTS WRITTEN / WAITING_EXTERNAL VALIDATION; Phase 23 OPEN.
- **Plan:** `PHASE_23_C1C_PLAN.md` (initial static audit and required negative/SQL/export acceptance).
- **Completed here:** Reviewed identity-derived scope and SQL. Changed the exported book SQL builder to require a full access context and shared guard; updated repository and scoped SQL fixture; added direct-builder denial/zero-DB-read regressions. **Static review corrected a false-failure risk in the C1c-S1 test:** denial is now asserted by error constructor, not a class name absent from its message. Code committed, **not executed or CI-verified here**. No book-report permission enabled; HTTP 503 unchanged.
- **Remaining:** Run lint/test:server/test:db/test:api/build and exact-SHA CI for C1c-S1; repair failures and obtain independent review before closing S1. Then enable only one audited report source per checkpoint if approved, with two-employee PostgreSQL/service/Excel authorization tests and independent closure evidence.
- **External environment:** Migrated synthetic PostgreSQL, test runner, GitHub Actions. No real personnel data.
- **Dependencies:** preserve previously closed C1b4; individual source acceptance before opening any next book source.
- **Blocked_by:** Execution proof unavailable for unrun acceptance; no global blockade on static preparation.
- **Last observed HEAD at planning:** `9c473b561c1a68bf60cbeffeb5cc20e152096a5d` (recheck after docs commits).
- **Acceptance:** zero forbidden SQL reads, scoped visible book rows and matching statistics/XLSX, no daily-situation exposure, reviewer approval, CI evidence, HTTP 503 preserved.
- **Next independent subtask:** C1c-S1 scoped builder API hardening (CHAT development, EXTERNAL SQL/CI verification).

_C1b4 is closed internally; Phase 23 remains OPEN._

### 23-C1d — Circular / ViewLog employee own-only policy

- **Classification:** HYBRID.
- **Status:** PREPARATORY_ONLY / PLANNED (not implemented, not tested, not closed).
- **Plan:** `PHASE_23_C1D_PLAN.md`; independent static review of privileged circular counts, separate acknowledgement clock, deduplication, historical anomalies, and missing employee owner-only enforcement.
- **Completed here:** Read actual report repository/service and existing migrated PostgreSQL fixture tests; documented exact employee-only output/security tests. No new permission, scope or HTTP change.
- **Remaining external:** After source-scoped design/implementation, execute migrated PostgreSQL/service/XLSX/role negative tests and full CI, independent review; no institutional data.
- **Dependencies:** Explicit employee output and SQL scope policy; do not re-use privileged summary; `23-C1c-S1` still pending external verification but C1d analysis does not depend on it.
- **Acceptance:** No coworker names/rows/counts/problem markers in employee outputs; admin/director parity; unapproved roles fail before SQL; HTTP `503 REPORTS_UNAVAILABLE` stays.
- **Last reviewed:** 2026-11-06.

### 23-C2 — isolated PDF worker application integration

- **Classification:** HYBRID.
- **Status:** PREPARATORY_ONLY / CODE CONTRACT TESTS WRITTEN / WAITING_EXTERNAL VERIFICATION; not implemented, not closed.
- **Plan:** `PHASE_23_C2_PDF_INTEGRATION_PLAN.md`.
- **Completed here:** Audited `ReportApiService.run/export`, `buildReportExportModel`, ALT-07 strict PDF JSON input, ALT-08 escaped fixed template, and ALT-09 test-only isolated Docker proof. Added `server/tests/reportC2PdfHandoffContract.test.ts` (three unexecuted application-boundary contract tests). No production worker launcher, renderer replacement, HTTP, permission or live data change.
- **Remaining external:** Run server tests, TypeScript/build, full CI and code review; implement and test production-safe isolated worker orchestration and negative process/host cases only after separate plan and required authorization; C4 image/host sign-off remains independent.
- **Dependencies:** C1 source authorization continues separately; the contract test does not unblock any currently restricted report route. Target-host Docker/security prerequisites are needed for deployment.
- **Evidence required:** exact SHA and CI run/step results, verified failure-path cleanup/timeout/resource caps, approved image/font digest and host constraints, no cross-scope leak, independent reviewer approval.
- **Last reviewed:** 2026-11-06.

### 23-C3 — Reports and export functional consistency

- **Classification:** HYBRID.
- **Status:** PREPARATORY_ONLY / CODE TESTS WRITTEN / WAITING_EXTERNAL VERIFICATION; C3 remains OPEN.
- **Plan:** `PHASE_23_C3_REPORT_CONSISTENCY_PLAN.md`.
- **Completed here:** Reviewed approved decision matrix and corrected stale researcher/professor DTO prose; added synthetic consistency tests and fixed a misleading fake filter fixture. C3-S2 further hardened `buildReportExportModel` against negative, fractional, nonfinite and unsafe book counts (including compensated totals), with regression cases. **All new tests remain unexecuted in this session**, and actual PostgreSQL source/filter verification is still required.
- **Remaining:** Run lint/test:server/DB/API/build, exact SHA CI and independent review. Confirm each source/filter with migrated PostgreSQL, role scope and export parity; no invented category/source/department mapping.
- **Dependencies:** C1c source-specific employee authorization, C1d own-only ViewLog policy, C2 real PDF launcher and C4 host approvals must be independently completed for Phase 23 final closure. This contract suite itself is independent preparation while C1c-S1 is externally verified.
- **Boundary:** no new role/permission, report route, PDF engine or business schema change; `HTTP 503 REPORTS_UNAVAILABLE` stays.
- **Last reviewed:** 2026-11-06.

### 23-C4 — PDF container/image provenance and target-host security acceptance

- **Classification:** HYBRID (preparatory documentation in ChatGPT; operational verification EXTERNAL).
- **Status:** PREPARATORY_ONLY / PLAN COMPLETE / WAITING_EXTERNAL; not approved or closed.
- **Plan:** `PHASE_23_C4_CONTAINER_HOST_ACCEPTANCE.md` — concrete immutable-image, dependency/hash, Arabic-font license, Docker isolation, crash/timeout and PDF readability acceptance.
- **Completed here:** Audited existing Phase 23/ALT-09 synthetic evidence and precise remaining supply-chain/host blockers; prepared no-change host inspection commands, go/no-go matrix and evidence template. No image, host, permission or production code changed.
- **Remaining external:** Confirm final C2 worker image and immutable digest, dependency/font provenance and licenses; verify security controls and output on actual institutional host with synthetic fixtures; independently review exact evidence.
- **Blocked_by:** Final C2 launcher/image not yet selected; actual institutional host details and runtime enforcement remain unverified.
- **Acceptance evidence:** exact Git SHA, final image digest, font hashes/licenses, full host inspect and synthetic negative-test results, reviewer decision. Historical CI Docker success is not host sign-off.
- **Boundary:** HTTP `503 REPORTS_UNAVAILABLE` remains; C4 cannot be closed by static review.
- **Last reviewed:** 2026-11-06.

## Closed items

### 23-C1b4 — Employee own time-permission reporting

- **Classification:** HYBRID
- **Status:** **CLOSED internally** (2026-11-06); Phase 23 remains OPEN.
- **Phase:** 23 (OPEN; HTTP `503 REPORTS_UNAVAILABLE` remains mandatory).
- **Verified implementation SHA:** `a38a5566532fd795dae3ea793d1f605cc533df46` on `development/phase-23-wip-20261105`; original release/tests `5491646`, plan/hardening plan `dddc0a7`.
- **Completed and verified:** `timePermissions` is the fourth internally owner-scoped employee source, alongside `employees`, `requests`, `leaves`. Real migrated embedded PostgreSQL tests with two synthetic employees prove own-only rows, cross-user/filter tampering denial, forged role/personnel/request/transaction scope rejection with zero DB reads (including export), XLSX owner-only output and admin/director parity. The direct SQL builder now uses the same `assertReportAccess` guard as the service/repository; the weaker duplicated check was removed. The other seven employee report types remain denied before SQL.
- **Execution evidence:** focused `reportPersonnel.test.ts` 16/16; `reportTransactions` 10/10; `reportCircularAcknowledgements` 11/11; `reportSecurityHttp` 3/3; `reportC1aEmployeeDenial` 4/4; `personnelOwnership` 7/7; `reportP1c` 3/3; `reportPdfInput` 5/5; `reportP0` 10 pass/1 skipped; full `npm run test:db` 194/194; full `npm run test:api` 245/245; `npm run lint` and `npm run build` pass.
- **CI evidence:** [run 42242635322](https://github.com/daboolgame123-creator/Saqa/actions/runs/42242635322), job `127976569874`, head `a38a556`, **completed SUCCESS**, all 32 steps successful. Public API confirmed status/conclusion/SHA and per-step conclusions; raw logs require authentication and were not downloaded, so no log-text claim is made.
- **Independent review:** security review found no reachable cross-user path, identified the builder-guard inconsistency, and confirmed the fix closes it with no permission widening and HTTP 503 intact. Test review confirmed coverage sufficiency conditional on recording limitations.
- **Known limitations (not closure blockers):**
  - `reportExport.test.ts` PDF cases fail on this Windows host only because they hardcode `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`; the CI P1h export step passed.
  - Caller-supplied filter values (including an `employee` UUID) are echoed in `appliedFilters`/the XLSX summary sheet by design. This is request input, not DB-derived data; no foreign rows, names, notes or row IDs are exposed.
  - `assertReportAccess` does not validate `transactionScope.visibilityIn`; it is unused by the four personnel SQL shapes and book reports remain denied to employees. No C1b4 action required.
- **Boundary:** internal only. `monthly`, `incoming`, `outgoing`, `situation`, `circularsAndAcknowledgements`, `researchers`, `professors` remain blocked for employees. No HTTP/web enablement, no production release.
- **Next candidate:** C1c source-by-source planning/static review only, with explicit user authorization and after dependency/security check; do not implement dependent authorization or declare C1c complete.
- **Last reviewed:** 2026-11-06.

## Operating rules

For every new unresolved task add: task ID, phase, classification, status, dependencies, blocked_by, completed_here, remaining_external, environment, exact commands after verifying scripts, acceptance evidence, latest checked SHA, and next independent candidate. Update on every return; never replace missing evidence with a claimed pass. Phase 23 cannot close while required tasks remain pending.
