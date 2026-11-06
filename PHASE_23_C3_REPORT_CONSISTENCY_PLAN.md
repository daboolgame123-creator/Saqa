# Phase 23 — C3 functional reports and export consistency audit

**Date:** 2026-11-06
**Status:** PREPARATORY_ONLY / OPEN.
**Classification:** HYBRID; static contract alignment and isolated tests in ChatGPT, migrated PostgreSQL/CI evidence external if unavailable here.
**Protected gates:** Phase 23 OPEN; report HTTP always `503 REPORTS_UNAVAILABLE`; no new authorization, researcher/professor data model, or renderer activation.
**Concurrent work:** C1c-S1 is being externally tested; do not change its permission guard, transaction SQL builder or pending fixtures.

## Scope and current observations

- `PHASE_23_DECISIONS.md` requires monthly figures (total, incoming, outgoing, internal, both approved book statuses) from rows authorized by access scope, registration date as default and document date as separate transaction-only filter, monthly exclusion of historical imports, and no invented researcher/professor source.
- `ReportApiService.run` derives `summary.totalCount` from `rows.length`; for `monthly` and `situation` it computes `bookStatistics` from the **same rows**, and rejects unknown book direction/status. Export re-runs this authorized service and passes its response to `buildReportExportModel`; the model checks totals before rendering.
- `buildTransactionsQuery` currently excludes deleted and daily-situation records, excludes imported from `monthly` only, uses `EXISTS` for employee links to avoid multiplying counts, and treats registration day with explicit server-owned timezone.
- `source` and `section` for books fail with `REPORT_FILTER_UNAVAILABLE` rather than silently applying fictitious mappings. This is correct until meaningful mappings are approved.
- `researchers` and `professors` are `UNRESOLVED_REPORT_TYPES`, with no verified independent source. Current `report.ts` introductory comment incorrectly implies researcher reports may be derived from `Employee.category`; align documentation only, not behavior.
- A specialized `circularsAndAcknowledgements` report uses separate count clocks and must retain historical anomaly indicators; this is independently tracked under C1d.
- The PDF worker integration is independently tracked under C2; do not treat the test-only ALT-09 renderer as production wiring.

## Planned independent work

1. Fix stale nonbehavioral DTO prose regarding unapproved researcher/professor sources.
2. Write synthetic, execution-independent regression asserting `ReportApiService.run` monthly/situation book statistics are exactly derived from rows, then `buildReportExportModel` reproduces precisely those counts and same detail count.
3. Add negative model tests for mismatched book totals/status counts, and preserve row IDs as internal-only rather than export details. No real personnel data.
4. Do not duplicate migrated database tests already in `reportTransactions.test.ts`; use OpenCode/CI to verify those on current SHA along with the new server-side test.
5. Record unresolved gaps explicitly: per-report permitted filter map, historical/deleted scope policy, C1c employee book auth, C1d ViewLog owner-only, C2 real PDF launcher, C4 target-host constraints.
6. No task can be marked CLOSED until lint/test:server/DB/API/build and exact-SHA CI pass and review is documented.

## Acceptance for preparatory checkpoint

A code comment corrected, noninvasive contract regression committed, no authorization/routing change, and unexecuted results plainly labeled. This is not C3 final acceptance.

## Implementation checkpoint — 2026-11-06

- Updated stale DTO comment in `server/src/api/dto/report.ts`: researchers/professors cannot be synthesized from Employee categories, and `situation` is the existing two-status **book-status** report.
- Added `server/tests/reportC3SummaryExportConsistency.test.ts`, a three-test synthetic contract suite covering: (1) monthly/book-status statistics exactly match rows and export model counts/filter summary; (2) tampered statistics/total-count failure before rendering; (3) unavailable independent researchers/professors exports reject rather than return empty success.
- **Execution not observed in this conversation:** no claim that the new tests pass. Run `npm run lint`, `npm run test:server`, `npm run test:db`, `npm run test:api`, `npm run build` and exact-SHA CI. The fake report repository is intentional: the suite tests model consistency, not PostgreSQL visibility. Keep full DB source-scoping tests as independent acceptance.
- No changes to SQL, access guard, report HTTP gate, PDF engine or production deployment. C3 remains open.

## C3 test-review correction — 2026-11-06

A static adversarial review found a false-confidence defect in the initial synthetic suite: it passed `status: 'مكتمل'` while the fake repository returned every book, including `قيد المراجعة`. Consequently, the test proved only post-query arithmetic, and its label could mislead readers into assuming filter correctness.

Corrected `server/tests/reportC3SummaryExportConsistency.test.ts` to apply the filter within the synthetic repository fixture and assert **both unfiltered (3 books: 1/1/1, statuses 1/2) and completed-only (2 books: 1/0/1, statuses 0/2)** results, model summary and absence of excluded-book title. The filtered report must contain neither the excluded detail nor an incorrect count. This remains an isolated contract check, **not a replacement for migrated PostgreSQL filter tests**.

**Execution not observed:** source change is committed but test/TypeScript/CI results remain unverified; C3 is OPEN, HTTP 503 unchanged.

## C3-S2 pre-implementation analysis: nonnegative integer book aggregates

A static review of `buildReportExportModel` found that book-statistic conservation alone permits nonsensical negative/decimal/infinite components if other components compensate (for example, total 2, incoming 3 and outgoing -1). These are not expected from `ReportApiService.summarizeBooks`, but a renderer's defensive boundary should reject them.

**Change:** within `buildReportExportModel` for `bookStatistics`, require all six numeric counts (`totalBooks`, three directions, two statuses — six values total) to be `Number.isSafeInteger` and >= 0 before validating the existing conservation equations. Count names deliberately fixed; do not introduce new status values or schemas. Existing correctly computed values remain unchanged.

**Tests:** synthetic export-model calls with compensated negative direction/status, fractional or nonfinite counts, and a valid baseline, asserting fail-closed `ReportExportUnavailableError`. This is an independent C3 exporter validation; no SQL, authorization, HTTP route, worker or renderer change. **No execution proof before external run.**

## C3-S2 implementation checkpoint — 2026-11-06

- **Code change:** `server/src/api/services/reportExport.ts` now checks every one of the six book statistics as a nonnegative `Number.isSafeInteger` with explicit numeric type guard before evaluating row-count/direction/status conservation. Malformed negative/fractional/nonfinite results fail with `ReportExportUnavailableError` before XLSX/PDF rendering. Valid `ReportApiService.summarizeBooks` outputs remain unchanged.
- **Regression changes:** `server/tests/reportC3SummaryExportConsistency.test.ts` exercises compensated negative direction (incoming 3/outgoing -1/internal 1 = 3), compensated negative status (-1+4=3), fractions, infinities and NaN, as well as the existing valid baseline.
- **Execution status:** NOT RUN / NO EXACT-SHA CI EVIDENCE in this ChatGPT session. Require `npm run lint`, `npm run test:server`, `npm run test:db`, `npm run test:api`, `npm run build`, exact-SHA workflow and independent review. Do not close C3 or Phase 23 based on this source-only checkpoint.
- **Protected boundaries:** no authorization, SQL source, PDF engine, HTTP gate or user role changes. `503 REPORTS_UNAVAILABLE` remains.

## C3-S3 plan before implementation: formal acknowledgement export statistics

Static code inspection shows `buildReportExportModel` only tests acknowledgement list length and one complete=true comparison. It can otherwise accept negative counts, `NaN`, a `verifiedUniqueEmployees` total greater than verified operations, or a `complete=false` result with certified-looking counts. That produces misleading official export indicators even if the normal repository never emits such states.

**Design (strict without inventing history):** every numeric circular/ViewLog counter and every anomaly-reason count must be a nonnegative safe integer; `complete` must be a real boolean. `verifiedAcknowledgementOperations` must match the verified detail count, `verifiedUniqueEmployees` cannot exceed operations. `complete=true` requires zero problematic rows and zero reason counts, with certified operation/unique counts equal to verified counts; `complete=false` requires positive problematic rows and BOTH certified counts null. Every reason count must be <= problematic rows (a row can have multiple reasons; **do not** require their sum equal problematic rows). No claim to identify or fix historical records.

**Tests:** valid complete and incomplete synthetic results; reject compensation/negative/decimal/nonfinite, impossible unique totals, mismatched completeness/uncertainty, negative reason counts, without mutating repository, role guards or HTTP. Unit tests are not a substitute for Postgres C1d verification. **Never mark passed without actual run.**

## C3-S3 implementation checkpoint — 2026-11-06

- Hardened `buildReportExportModel` in `server/src/api/services/reportExport.ts`: circular/ViewLog statistics now require valid nonnegative safe integer counts, bounded unique employees vs operations, valid `complete` boolean, and certified vs uncertain totals consistent with anomaly state. The sum of anomaly reasons deliberately **may exceed** problematic row count because multiple reasons can affect one row; each individual reason cannot exceed that row count.
- Added `server/tests/reportC3ViewLogExportStatistics.test.ts` with three synthetic unit cases: valid certified, valid incomplete with overlapping reasons, and fifteen malformed/contradictory variants expected to fail before XLSX/PDF creation. Tests use invented people only.
- **Status:** Source changes committed; tests, TypeScript and CI **NOT RUN OR VERIFIED** in this session. Exact-SHA verification is required. No employee ViewLog privilege was enabled, no production PDF swap, no HTTP release; Phase 23 OPEN.

## C3-S4 plan — verify exported acknowledgement identities and true uniqueness

**Analysis before edits:** C3-S3 validates nonnegative ViewLog counters and the *maximum* unique-employee bound, but does not independently recompute the unique count from the actual displayed acknowledgement entries or reject repeated `(employeeId, transactionId)` rows. A future repository change could accidentally double count a click, or publish an internally contradictory unique count while all numeric bounds pass. The canonical repository already deduplicates; the defensive export boundary should assert the same invariant rather than silently 'repair' data.

**Implementation:** In `buildReportExportModel('circularsAndAcknowledgements', ...)`, validate each verified acknowledgement has a nonempty employee ID, nonempty transaction ID and scalar strings for the intended output fields; reject duplicate `employeeId + transactionId` pairs. Recalculate the set of unique employee IDs and require its size equals `verifiedUniqueEmployees`. Do not alter dates or identities, do not deduplicate by employee name, and do not assume the acknowledgement's book was registered during the selected period. Reject ambiguous output instead of truncating or changing counts. Add targeted synthetic tests: same person/three circulars, two distinct employees, duplicate pair, fabricated unique count and malformed identity.

**Boundary:** This is an internal exporter defense, not a change to ViewLog storage, employee authorization or HTTP 503. Do not mark green without execution and exact-SHA CI.

## C3-S5 plan — report-type-specific export statistics shape

**Analysis:** The authoritative `ReportApiService.run` always includes `bookStatistics` for `monthly` and `situation`, but `buildReportExportModel` currently treats `bookStatistics` as optional for *every* report. A malformed monthly/status payload could thus produce a success-shaped summary with missing required book distribution, while unrelated report types could present forged book counts.

**Change:** Require `summary.bookStatistics` on exactly `monthly` and `situation`; reject it on all other report types (including `incoming`, `outgoing`, `employees` and `circularsAndAcknowledgements`). Keep the already-existing numeric/integrity validation for allowed book metrics. This must not affect existing authorized `ReportApiService.run` semantics or enable any report. Add synthetic tests for missing and extra metrics, plus valid monthly/situation.

## C3-S4/S5 implementation and source review — 2026-11-06

**C3-S4:** `buildReportExportModel('circularsAndAcknowledgements')` now verifies each acknowledgement has a nonblank transaction/employee ID, validates the intended output fields' types, rejects any duplicate logical `(employeeId,transactionId)` pair rather than silently counting it twice, and recomputes the distinct employee-ID total to match `verifiedUniqueEmployees`. It does not confuse an employee name or account identifier with the stable employee ID, and keeps acknowledgements on older registered circulars valid. Added five synthetic tests in `server/tests/reportC3ViewLogExportIdentities.test.ts`, including valid complete/incomplete results, four distinct logical operations across two employees, repeated pairs, forged unique count, and malformed identities.

**C3-S5:** `buildReportExportModel` now demands `bookStatistics` for `monthly` and `situation`, but rejects them for all other report types; this matches `ReportApiService.run` output. Added a fourth synthetic contract test in `server/tests/reportC3SummaryExportConsistency.test.ts`.

**Review:** Re-fetched the current GitHub source and confirmed both guards and new test files are saved on the branch. This was **static verification only**, not a TypeScript/runtime test. Repository checkout/npm dependencies were unavailable in the current execution environment, and GitHub status/run lookup for the implementation SHA returned no check statuses or workflow runs. That absence is NOT proof of success/failure. External runner must execute `npm run lint`, `npm run test:server`, `npm run test:db`, `npm run test:api`, `npm run build`, review failed logs and record exact-SHA CI.

**Security boundaries unchanged:** no C1c/C1d permission activation, DB migrations or report route changes; `HTTP 503 REPORTS_UNAVAILABLE` stays. C3 remains OPEN until source/filter and migrated DB/CI evidence is verified.

## C3-S6 plan — validated official acknowledgement timestamps

**Analysis before implementation:** The specialized repository projects confirmed `acknowledgedAt` as an ISO string using `timestampIso(...)`, but the export model currently checks only `typeof entry.acknowledgedAt === 'string'`. A malformed or impossible timestamp could therefore be printed as a formal acknowledgement date. This is not a finding that institutional source data actually contain bad dates.

**Minimal fix:** For each verified acknowledgement, require a canonical UTC ISO timestamp with seconds and optional 1–3 fractional digits, a finite parsed date, and an unchanged YYYY-MM-DDTHH:mm:ss prefix after ISO round-trip. This rejects invalid calendar days, text injections, non-UTC or missing-zone timestamps without altering legitimate repository-produced ISO values. Keep existing source-independent date/count semantics; don't change registration clock or coerce invalid inputs.

**Tests:** synthetic valid `YYYY-MM-DDTHH:mm:ssZ`, `YYYY-MM-DDTHH:mm:ss.sssZ`; invalid garbage, impossible February date, date-only, offset timestamp, blank string, and overflow. No database/permissions/HTTP change. Test execution/CI remain external until proven.

## C3-S6 implementation and limited local predicate check — 2026-11-06

- Added strict UTC ISO acceptance guard to the verified ViewLog acknowledgement export boundary in `server/src/api/services/reportExport.ts`: requires full calendar date/time, UTC `Z`, optional milliseconds and valid round-trip calendar/clock prefix. Invalid dates are rejected with `ReportExportUnavailableError`. Valid repository `timestampIso` values remain accepted.
- Added two synthetic regression tests in `server/tests/reportC3ViewLogExportIdentities.test.ts` (two accepted canonical forms; nine invalid/ambiguous forms).
- **Actually executed in this session:** an isolated Node.js copy of the timestamp predicate, 2 valid accepted / 9 invalid rejected: `ISOLATED_DATE_PREDICATE_PASS valid=2 invalid=9`. This is a narrow predicate check only and does **not** establish that the exact TypeScript file compiles, that the full test suite runs or that GitHub CI passes. The latest source was re-fetched to eliminate an accidental double-backslash regex and replaced with explicit `[0-9]` character classes.
- Production report routes remain `503 REPORTS_UNAVAILABLE`. C3 and Phase 23 are still OPEN and require exact-SHA lint/DB/API/build/full CI and review.

## C3-S7 plan — every problematic ViewLog row needs a reported reason

**Static analysis first:** In `readCircularAcknowledgements`, each `problematicRows` member is added only by `mark(entries, reason)`, which also increments the corresponding problem-reason counter. Thus the sum of reason counters is **at least** `problemRecords`, because one row may have several reasons. Current export checks that each reason is at most `problemRecords` but accepts incomplete reports with unexplained rows (e.g. 2 problematic and 0 reasons), creating misleading official summaries.

**Minimal change:** For incomplete reports, require `missingEmployeeId + identityMismatch + conflictingAcknowledgementTime >= problemRecords`, without demanding equality; retain per-reason <= problemRecords. For complete=true all reasons and problem count remain zero. Add synthetic negative 2 problems/1 reason, positive 2 problems/3 reasons, plus existing complete behavior. This is a consistency check, not a new historical data policy or employee permission.

**Status:** plan before code; run appropriate tests and exact-SHA CI before closure; reports remain HTTP 503.

## C3-S7 implementation checkpoint — 2026-11-06

- Updated `server/src/api/services/reportExport.ts`: circular/ViewLog output rejects a `problemRecords` count greater than the sum of reported reason counts. Each reason is still independently bounded by the problematic row count; **overlapping reasons are accepted** as designed.
- Added a synthetic regression in `server/tests/reportC3ViewLogExportStatistics.test.ts`: 2 problematic rows / 1 reason rejects, 2 rows / 3 overlapping reasons accepts, 2 rows / 0 reasons rejects.
- **Status:** committed and statically inspected; exact repository test suite, TypeScript and CI have **not** been run in this session. This is not C3/Phase 23 closure. Existing C1c-S1 and C1d gates remain separate; `HTTP 503 REPORTS_UNAVAILABLE` unchanged.

## C3 source/filter parity audit — 2026-11-07 (static; no behavioral expansion)

**Owners at this checkpoint:** CHAT is reviewing C3 filter/source contract; OpenCode has been assigned PR #4 independent C1c-S2 security review, outcome pending. Neither lane should edit the other's branch. The initial `situation.type` mismatch was fixed on independent PR #6 with exact successful CI [42307848487](https://github.com/daboolgame123-creator/Saqa/actions/runs/42307848487).

**Read the table as repository behavior, not an HTTP promise:** every report HTTP path remains blocked `503 REPORTS_UNAVAILABLE`. The universal `reportQuery` parser accepts some fields which individual builders then explicitly reject with `ReportFilterUnavailableError`; this is **not** an applied filter and must not appear as an enabled UI control until an approved source exists.

| Report source | `dateFrom/dateTo` | `documentDateFrom/To` | `type` | `section` | `employee` | `status` | `source` |
|---|---|---|---|---|---|---|---|
| `monthly` | registration day, configured zone | document date | direction | **reject** | M:N book association (narrows only) | book status | **reject** |
| `incoming` | registration day, configured zone | document date | direction, fixed incoming predicate also enforced | **reject** | M:N association, narrows only | book status | **reject** |
| `outgoing` | registration day, configured zone | document date | direction, fixed outgoing predicate also enforced | **reject** | M:N association, narrows only | book status | **reject** |
| `situation` (book status) | registration day, configured zone | document date | **direction: validated by C3 correction** | **reject** | M:N book association | book status | **reject** |
| `employees` | registration day, configured zone | **reject** | employee category | department | employee ID / trusted owner scope | employee status | **reject** |
| `requests` | registration day, configured zone | **reject** | request kind | **reject** | owner employee ID / trusted request scope | request status | **reject** |
| `leaves` | registration day, configured zone | **reject** | leave type | **reject** | owner employee ID / trusted personnel scope | leave status | **reject** |
| `timePermissions` | registration day, configured zone | **reject** | time-permission **status** (same underlying column as `status`) | **reject** | owner employee ID / trusted personnel scope | time-permission status | **reject** |
| `circularsAndAcknowledgements` | two independent registration/acknowledgement clocks | **reject** | **reject** | **reject** | **reject** | book status | **reject** |
| `researchers/professors` | **not implemented** | **not implemented** | **not implemented** | **not implemented** | **not implemented** | **not implemented** | **not implemented** |

**Review finding:** `situation.type` was one demonstrable parser/database mismatch; the correction is covered by a new direction allow/deny test and full CI. The other documented unavailable fields fail at repository before querying; do **not** mislabel this as browser-level validation. `timePermissions.type` and `.status` intentionally map to the same existing status field; future UI should expose the one appropriate control, not invent a second source. The researcher/professor types must fail explicitly, not succeed with blank data.

**Future UI-10 acceptance condition:** derive enabled filter controls only from this verified per-source matrix after corresponding feature approvals, and show a clear unsupported-state response instead of silently pretending a filter was applied. Do not open an HTTP endpoint or change authorization to satisfy the UI. If new discrepancies are later found, create a *specific failing regression first*; avoid speculative generic hardening.

**Evidence boundary:** these are source-code findings based on `reportValidators.ts`, `reportRepository.ts`, `reportService.ts` and existing migrated tests. The new matrix itself has no test execution requirement; source behavioral C3 fix is separately CI verified above. C3 and Phase 23 remain OPEN.
