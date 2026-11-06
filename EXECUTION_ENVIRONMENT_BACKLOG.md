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
- **Status:** C1d-S1 OWNER-ONLY INTERNAL READER + 5 SYNTHETIC TESTS WRITTEN / WAITING_EXTERNAL (not service-integrated, not tested, not closed).
- **Plan:** `PHASE_23_C1D_PLAN.md`; independent static review of privileged circular counts, separate acknowledgement clock, deduplication, historical anomalies, and missing employee owner-only enforcement.
- **Completed here:** Audited specialized ViewLog repository and existing PostgreSQL fixtures; wrote internal-only owner SQL reader `server/src/repositories/reportOwnCircularAcknowledgements.ts` with bound employee predicate and own-history dedup; wrote six unexecuted unit/negative tests in `server/tests/reportC1dOwnAcknowledgements.test.ts` (including explicit **zero query/zero connect** guard under forged scopes) and four **migrated PostgreSQL regression cases** in `server/tests/db/reportOwnCircularAcknowledgements.test.ts`. No service wiring, shared guard, employee permission or HTTP change.
- **Remaining external:** First run TypeScript/lint/server tests and migrated owner-scope PostgreSQL security tests on current SHA; independently review query visibility/history semantics. Only after verification connect employee-specific service/Excel projection under a distinct response shape and test own-only outputs; full API/CI and independent review. Do not open HTTP 503. No institutional data.
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
- **C3-S3 update:** Hardened circular/ViewLog export certification counters and added three unexecuted synthetic test groups in `server/tests/reportC3ViewLogExportStatistics.test.ts`. Rejects contradictory complete/uncertain values and invalid counts; allows legitimately overlapping anomaly reasons. No ViewLog employee authorization opened. Must verify `npm run lint`, `npm run test:server`, DB/API/build and exact-SHA CI.
- **C3-S4/S5 update:** Hardened ViewLog export against duplicate `(employeeId, transactionId)` operations, missing identities and fabricated unique employee counts; added five synthetic tests. Required `bookStatistics` on monthly/book-status exports and forbade it on unrelated report types; added one synthetic test. Changes are committed and statically confirmed on branch; **no test run/CI evidence yet**. C3 remains OPEN.
- **C3-S6 update:** Added strict verified acknowledgement timestamp checks before XLSX/PDF model export with two new synthetic regression tests. A narrow standalone Node predicate check actually executed (2 canonical dates accepted, 9 bad dates rejected); exact repository tests/TypeScript/full CI remain **NOT VERIFIED**. No permission/HTTP change.
- **C3-S7 update:** Verified static repository invariant that every problematic ViewLog row is associated with at least one reason; hardened export to reject reason counts insufficient to explain the problematic-row total and added synthetic regression including legitimately overlapping reasons. **Committed, not executed/CI-verified**; this is the final bounded C3 consistency hardening before external validation rather than indefinite expansion.
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


## Phase 23 — repeatable exact-commit verification runner (2026-11-06)

A single Windows/PowerShell command is now committed for the OpenCode/local machine:

`powershell -NoProfile -File scripts/verify-phase23.ps1`

The runner verifies the current **40-hex Git SHA** and a clean working tree, then runs exactly `npm run lint`, `npm run test:server`, `npm run test:db`, `npm run test:api`, `npm run build` sequentially. It **stops at the first nonzero exit**, prints its command/exit code, and reports `PHASE23_VERIFY_PASS_SHA=<sha>` only when all five checks finish and HEAD/worktree remain unchanged. Run against a fresh clean checkout on the intended branch and retain full terminal output and SHA for review. It does **not** deploy, change employee permissions, edit application code, enable HTTP or validate the target Docker production host.

**Execution status:** file created on GitHub, **not executed** in this session (PowerShell and project dependencies are absent from the analysis environment; direct GitHub network is blocked). No GitHub CI check on latest SHA was observed. The tool must run on OpenCode/Windows before any source verification claim or Phase 23 closure. Migrated PostgreSQL checks use the project's existing synthetic test harness; never point tests at institutional DB.


## OpenCode C1c-S1 local report reconciliation — 2026-11-06

The user relayed OpenCode's local execution report: the agent fast-forwarded an **older local checkout only to `aa7a8ac`**, reported successful `lint`, `test:db` (194/194), `test:api` (245/245), `build`, and targeted `C1c-S1`/`P0` server tests. Remaining Windows `test:server` failures were reported to be Chromium and hardcoded Linux font environment limits. The agent reported a **local** commit `a37ad05` that updates three stale Phase 13 N1 `excludeDailySituations` expectations plus the backlog, without external network/CI verification.

**GitHub reconciliation:** On the current remote branch, the reported local commit `a37ad05` is **not reachable** (GitHub lookup/compare returned not found), and the remote `accessScope.test.ts` still had the three stale expectations. The same three assertion-only updates were therefore applied **directly to the remote branch** at commit `ab7a014e4b3c45d273498a3016c828724398260c`. This does not weaken source authorization or expand employee report access. OpenCode's local commit is **not** being claimed as pushed.

**Evidence limits:** GitHub comparison verified that `aa7a8ac` was 66 commits behind the then-current remote HEAD. Thus the supplied test runs **cannot** establish TypeScript, runtime, PostgreSQL or API correctness of the later C2/C3/C1d and exact remote branch state. GitHub returned no workflow run / commit status for the previously examined newer head; do not assume absence of results implies success or failure. C1c-S1 local focused checks are useful *historical* evidence only; exact-SHA full Phase 23 verification remains pending.

**Handoff to OpenCode:** Fetch the updated remote branch first; do not blindly push the earlier local `a37ad05` on top of it. Compare local modifications, rebase/cherry-pick only unique changes if any, preserve unrelated work, then run `powershell -NoProfile -File scripts/verify-phase23.ps1` from a **clean** current checkout. Capture exact `PHASE23_VERIFY_PASS_SHA` and failures; run on suitable Linux CI for font/Chromium-specific tests. Preserve HTTP `503 REPORTS_UNAVAILABLE` and do not activate employee circular access until scoped PostgreSQL validation and independent review.


## Phase 23 C1c/C1d/C3 CI evidence reconciliation — 2026-11-07

**Task class:** CHAT (CI log verification + static security audit + evidence correction); **release class:** HYBRID/WAITING_EXTERNAL. This reconciles historical statements above, which still describe tests as unexecuted at their original authoring time. It does **not** grant permission to bypass source-specific reviews.

**Verified exact CI evidence:** `development/phase-23-c2-worker-isolated-20261106` at commit `ab099726565261a05176ceea6b1ceaa33a1c082d` contains the unchanged C1c/C1d/C3 code inherited from Phase 23 base `9bcfe175ac0b245cb757a7b7baee9de234eca01b`. GitHub Actions [run 42298226110](https://github.com/daboolgame123-creator/Saqa/actions/runs/42298226110) completed SUCCESS: focused job `128168906221` (C2 tests 13/13; P0 isolation 1/1; TypeScript and build), whole-suite job `128168906835` (`test:server` 261 pass, 0 fail, 1 intentionally skipped due to isolation-only context; `test:db` 198 pass, 0 fail; `test:api` 245 pass, 0 fail). The skipped P0 case was independently executed and passed under its dedicated guard in the focused job. These outcomes were checked in the raw job logs, not inferred from documentation.

**Direct C1c-S1 evidence in full server suite:** four test groups passed: direct employee `monthly/incoming/outgoing/situation` builder denial; malformed privileged scope denial; zero-DB-read service/repository/export denial; parameter binding of authorized admin document date. Reviewed `reportRepository.ts` source: `buildTransactionsQuery` calls `assertReportAccess(access, reportType)` before preparing SQL; existing shared guard still denies all employee book sources. No employee book access has been enabled. **C1c-S1 status: CODE_AND_TESTS_CI_VERIFIED / PENDING_INDEPENDENT_SECURITY_SIGNOFF**, not an approved employee book source or C1c closure.

**Direct C1d-S1/S2 evidence:** six owner-reader unit groups passed; migrated PostgreSQL `reportOwnCircularAcknowledgements.test.ts` ran successfully, including cross-employee SQL isolation, duplicate/conflicting historical acknowledgements, nonpublic/deleted/daily exclusions and pre-SQL forged scope rejection. Reviewed owner reader source: trusted owner predicate `vl.employee_id = $1` in SQL; output has only `transactionId`, `title`, `acknowledgedAt`, with no coworkers' counters. **C1d internal reader status: CODE_AND_MIGRATED_DB_CI_VERIFIED / UNWIRED**, not service/XLSX integration or employee access approval.

**Direct C3 evidence:** all added C3 synthetic integrity test groups were present and passed in the same full server suite (book totals/export consistency, ViewLog operation dedup/count integrity, verified acknowledgement timestamps and anomaly justification). **C3 synthetic consistency status: CODE_AND_TESTS_CI_VERIFIED**, but source/filter semantics, final service/export authorization and independent review remain OPEN.

**Source-specific next tasks:** (1) independent C1c-S1 authorization review and, only after acceptance, prepare **incoming-only** employee book report behind the existing HTTP 503 boundary with two-employee migrated SQL/service/XLSX negatives; (2) C1d owner-only service projection and XLSX without privileged counters, only after explicit reviewer acceptance; (3) C3 source/filter parity review, not repeated generic counter hardening; (4) C2/C4 actual renderer/container/host acceptance stays EXTERNAL. No current evidence licenses Phase 23 closure, activation or merging PR #2/#3.

**Scope integrity:** This reconciliation is documentation-only on a new isolated branch. The OpenCode target branch `development/phase-23-wip-20261105` remains untouched. All report routes stay `503 REPORTS_UNAVAILABLE`.
