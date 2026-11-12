# ALSQAYA — Execution Environment Backlog

**Purpose:** Living queue for external tests, partially complete work, dependencies and independent preparatory work.
**Required policy:** [EXECUTION_ENVIRONMENT_POLICY.md](EXECUTION_ENVIRONMENT_POLICY.md)
**Do not treat this backlog as test evidence or phase closure.**

## Open items

### LOCAL-STAGING-BOOTSTRAP-DIAGNOSTICS — failure diagnosis (2026-11-12)

- **Owner/classification/status:** CHAT / HYBRID / LOCALLY_VERIFIED_SYNTHETIC, OPERATOR_RETEST_PENDING; external OpenCode active task unknown.
- **Base/branch:** `9455aeab07ff500b592392dc82ad444b3a0d2655` / `review/local-staging-bootstrap-diagnostics-20261112`, local review candidate; no publication, PR or merge.
- **Completed:** safe stage/code/outcome diagnostics; primary exceptions survive failed cleanup; no change to destination/key/TTY/confirmation/migration/users gates, transaction SQL or native audits. Actual incident cause remains unproven; checksum line endings/config/auth/permissions/locks/collision remain code-supported candidates.
- **Executed evidence:** 37/37 focused tests, zero failures/skips, including 25 no-network mocked-driver/config scenarios and 3 Windows PowerShell mocked-launcher checks; TypeScript/build/PowerShell 5.1 parser/diff check passed. Independent static security review; detailed ledger and retest steps in `docs/LOCAL_STAGING_ADMIN.md`.
- **Dependencies / blocked_by:** operator decision to run one reviewed attended retest with existing key; real PostgreSQL/HTTP acceptance still requires disposable Docker environment (Docker unavailable here). No user DB connection, real Bootstrap, persistent-key generation, migration or data deletion in this task.
- **Remaining external / acceptance:** report only stage/code/outcome/cleanup and final SHA from Windows; preserve `alsqaya_dev`. Full DB/API, live DPAPI and CI not verified; mock results do not prove real database atomicity. No retry on unknown/committed outcome before separately authorized state inspection.
- **Next:** operator retest from the review worktree, not a dependent phase or release.

### LOCAL-STAGING-ADMIN — synthetic local first administrator (2026-11-12)

- **Owner/classification/status:** CHAT / HYBRID / PARTIAL, review candidate; external OpenCode assignment unknown.
- **Base/branch:** `07ed019fe022ea0f5d45c066adf0b6ba431f1aaf` / `review/local-staging-admin-20261112`; user authorized branch publication only; candidate commit recorded in Git history, no PR or merge in scope.
- **Plan and evidence:** `docs/LOCAL_STAGING_ADMIN.md`. Standalone guarded tool, native crypto/atomic audit, DPAPI launcher, loopback Express and disposable-container HTTP suite prepared.
- **Executed:** pre-connect tests 6/6 (including zero-socket confirmation/cached-key tripwire), TypeScript, build, PowerShell syntax parser and diff check pass. Independent static security review found no blocking finding; test-review assertion/cleanup findings corrected. No user DB connection, migration or persistent-key creation.
- **Blocked_by / remaining_external:** Docker unavailable; run documented isolated PostgreSQL 17/HTTP acceptance after review. DPAPI creation/reload requires explicit operator execution under the intended Windows profile. No runtime/CI success claimed.
- **Acceptance:** exact destination and confirmation; encrypted linked synthetic admin; atomic rollback/concurrency; login/change/restart and 401/403/503 evidence; independent security review. Preserve `firstAdminBootstrap`, auth and report gates.
- **Next:** review the candidate and run disposable container tests; user staging provisioning only after explicit approval. No dependent phase closure.

### 24-F — independent final integration candidate (2026-11-10)

- **Classification / status:** HYBRID / TECHNICALLY_VERIFIED_SYNTHETIC / HOST_UAT_PENDING; institutional release NO_GO. Candidate decision READY_FOR_PREPROD_REVIEW, final documentation-head CI tracked in PR #56.
- **Owner / branch:** OpenCode Build; `integration/phase24-f-preproduction-candidate-20261110`.
- **Dependencies:** approved base `d04ec7521ecbfa5a95bdff76cc94a52f0abb691a`; PR53 `68308777`, PR54 `265c2d23`, PR55 `f9b035f7`; live heads and their successful CI verified before integration.
- **Completed here:** plan recorded before changes; exact heads merged without conflicts into candidate only; independent security/reviewer assessment, CI-only cleanup assertion repaired, no application repairs. Draft [PR #56](https://github.com/daboolgame123-creator/Saqa/pull/56). No source/protected branch changes.
- **Steps / acceptance evidence:** `docs/PHASE_24_F_INTEGRATION.md` and `.github/workflows/phase24-f-integration.yml`; full server/DB/API, focused C/D/E, real Linux Docker/PDF, failure/corruption/cancellation, independent review and exact-final-SHA Actions/Draft PR.
- **Environment:** local Windows Node/npm; Docker absent locally; GitHub API/authenticated Git available. Linux Actions used for synthetic execution. User explicitly approved disposable CI test migrations.
- **Blocked_by / remaining external:** institutional-host approval, Arabic visual acceptance, published Docker provenance and font approval, production backup/key custody/retention/off-host copies/restore drill. CI cannot certify these.
- **Verified combined code HEAD:** `2f9f9c26b302cfdc739b846406c0b07cdb75e5f9`; [CI 42808640462](https://github.com/daboolgame123-creator/Saqa/actions/runs/42808640462), all three jobs SUCCESS. Server 376 pass/0 fail/1 P0 skip (dedicated P0 1/1); DB 226/226; API 269/269; C 8/8; D 21/21 plus real restore scenario; E real Docker 7/7 and provenance 6/6; crash recovery 1/1; TypeScript/build and real browser acceptance PASS. Full exact ledger and retained artifacts in `docs/PHASE_24_F_INTEGRATION.md`; focused counts overlap full suites.
- **Next task:** final documentation-head CI recorded in PR #56, then owner-led preproduction review of external blockers; no activation, automatic merge or deployment.

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


## C3 verification reconciliation — 2026-11-07 (supersedes old unexecuted status for scoped checkpoints)

**Owner split:** CHAT owns the isolated C3 filter-source review and its PR #6. OpenCode owns the independent PR #4 C1c-S2 security review, **without a confirmed outcome yet**. Do not touch the OpenCode branch or treat an OpenCode job as complete based on silence.

The earlier open-item C3 description was accurate **when written**, but its “CI not executed” line is now obsolete **for the tests existing in the C3 branch**. Actual exact-head CI evidence:
- PR [#6](https://github.com/daboolgame123-creator/Saqa/pull/6), isolated branch `development/phase-23-c3-situation-filter-20261107`, code/test SHA `6730eeabd0818bbe2ab6b64335b06f365e0f1c69`.
- [Actions run 42310025490](https://github.com/daboolgame123-creator/Saqa/actions/runs/42310025490), job `128208875191`, **SUCCESS**: TypeScript passed; server **254 pass, 0 fail, 1 intentionally skipped isolation-only test**; PostgreSQL **198 pass, 0 fail**; API **245 pass, 0 fail**; Vite build passed. The isolation-only test was previously verified under its dedicated preload and must not be mislabeled as passed in this job.
- Earlier CI [42309566706](https://github.com/daboolgame123-creator/Saqa/actions/runs/42309566706) covered the unsupported-filter input gate on SHA `a4126581dbb34dfa30d4d83a8611178794163bfe`: server 253/0/1 skip, DB 198/0, API 245/0, lint/build pass.
- Additional prior CI [42307848487](https://github.com/daboolgame123-creator/Saqa/actions/runs/42307848487) covered the `situation.type` direction allowlist; see PR #6 audit comments.

**C3-FILTER-VALIDATION technical checkpoint: COMPLETE / CI_VERIFIED on `6730eeab`**, *not merged, not released*. Source review confirmed actual migrated PostgreSQL tests in `reportTransactions.test.ts` for registration vs document dates, imports/deletes/daily records, M:N employee joins, scope exclusions, book-status count parity and injected bound values; `reportPersonnel.test.ts` checks owner-only SQL/service/XLSX, date and kind/status/department filters, negative scopes and injection. Export-model consistency, BookStatistics and ViewLog-integrity synthetic checks were also included in the full passing server run. This establishes the tested portions only; **it is not an independent security sign-off**.

**Specific behavior delivered:** (a) `situation.type` only accepts approved book direction; (b) source-unsupported `section/source` and circular `type/employee` fail early with a validation error, and repository's direct-call fail-closed guard remains; (c) `incoming.type` rejects outgoing/internal and `outgoing.type` rejects incoming/internal instead of producing misleading empty success. Neither source access nor HTTP 503 was changed.

**C3 remains OPEN at feature level:** PR #6 must be reviewed/integrated against the current base; C1c owner scope review remains on OpenCode PR #4; C1d own-ViewLog service/XLSX not integrated; C2/C4 PDF worker, target-host and font acceptance open; UI-10 and HTTP 503 release acceptance pending. `timePermissions.type` is an existing alias for its `status`, so the eventual UI should avoid displaying two supposedly distinct business dimensions, pending approved contract design. Researchers/professors have no approved independent source and must remain explicitly unavailable.

**Next integration order after external C1c result:** compare PR #4 and #6 for contract/validator parity, perform independent review and exact combined-SHA CI, then merge only with explicit authorization; do **not** repeatedly extend synthetic C3 hardening just because the phase stays open. If OpenCode/local-run verification is needed, notify the owner immediately and ask whether to document the handoff or supply a prompt.
