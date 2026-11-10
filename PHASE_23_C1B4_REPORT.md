# Phase 23 — 23-C1b4 verification and closure report

**Task:** employee own time-permission report (`timePermissions`) — internal only.
**Date:** 2026-11-06.
**Branch:** `development/phase-23-wip-20261105`.
**Verified implementation SHA:** `a38a5566532fd795dae3ea793d1f605cc533df46`.
**Status:** **C1b4 CLOSED internally.** Phase 23 remains **OPEN**; HTTP `503 REPORTS_UNAVAILABLE` remains mandatory.

## 1. Scope and code audit

Before this task, `reportAccess.ts` already allowed exactly four internally owner-scoped employee sources: `employees`, `requests`, `leaves`, `timePermissions`. The other seven employee report types remained denied before any repository/SQL call: `monthly`, `incoming`, `outgoing`, `situation`, `circularsAndAcknowledgements`, `researchers`, `professors`.

`timePermissions` SQL uses `time_permissions tp` and appends the trusted predicate `tp.employee_id = <session employee>` from `access.personnelScope` inside `WHERE` before `SELECT`. User filters (`employee`, `type`, `status`, registration `dateFrom`/`dateTo`) are additional `AND` predicates and can only narrow the result. They cannot replace the session-derived owner scope. Unsupported `source`, `section`, `documentDate*` filters fail with `REPORT_FILTER_UNAVAILABLE` rather than being ignored.

The report router was not modified. `reportRoutes.ts` still short-circuits every report method/path with `503 REPORTS_UNAVAILABLE`.

## 2. Defect found and fixed

Independent review found one defense-in-depth inconsistency (LOW, not remotely exploitable at the time):

- `buildScopedPersonnelReportQuery` used a duplicated employee check that omitted the `transactionScope` invariants enforced by `assertReportAccess`. Every production path already called the shared guard first, so no row-scope widening was reachable, but a future direct caller could rely on a context the repository would reject.

Fix in `a38a556`:

- The exported SQL builder now calls the same `assertReportAccess(access, reportType)` used by the service and repository. There is no weaker parallel guard.
- Direct-builder denial tests now cover `transactionScope: null`, foreign `availableToEmployeeId`, `excludeDailySituations: false`, and missing personnel/request scopes.
- Employee-scoped unsupported `source`/`section`/`documentDate*` rejection is now tested.
- Filtered-export tests assert that neither own nor foreign time-permission row IDs appear in the workbook.

No permission was widened, no router enabled, no schema changed, and no test was relaxed.

## 3. Executed local evidence (Windows, embedded PostgreSQL, synthetic data)

All database tests used the isolated embedded migrated PostgreSQL instance on port 5440 and synthetic records only. No institutional data was used.

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run lint` | pass |
| Vite build | `npm run build` | pass (existing chunk-size warning only) |
| Focused C1b4 PostgreSQL | `node --import tsx --test --test-concurrency=1 server/tests/db/reportPersonnel.test.ts` | **16/16 pass** |
| Report transactions | `reportTransactions.test.ts` | 10/10 pass |
| Circular/ViewLog | `reportCircularAcknowledgements.test.ts` | 11/11 pass |
| HTTP 503 boundary | `reportSecurityHttp.test.ts` | 3/3 pass |
| P0/P1b/P1c regressions | `reportP0.test.ts`, `reportP1c.test.ts` | 10 pass + 1 skipped, 3/3 pass |
| C1a denial audit | `reportC1aEmployeeDenial.test.ts` | 4/4 pass |
| Personnel ownership | `personnelOwnership.test.ts` | 7/7 pass |
| PDF input contract | `reportPdfInput.test.ts` | 5/5 pass |
| Full database regression | `npm run test:db` | **194/194 pass** |
| Full API regression | `npm run test:api` | **245/245 pass** |
| Export suite | `reportExport.test.ts` | 5/8 pass locally; see limitation below |

**Local limitation:** the three `reportExport.test.ts` PDF tests hardcode `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, which does not exist on this Windows host. They fail only at font read, before exercising report code. The same suite's Excel/security tests pass, the C1b4 Excel tests pass against real PostgreSQL, and the CI step **“P1h Excel and Arabic PDF exports” completed successfully** on the verified SHA. This is an environment limitation, not a product or test regression.

## 4. CI evidence

- **Run:** [42242635322](https://github.com/daboolgame123-creator/Saqa/actions/runs/42242635322)
- **Job:** `127976569874` (`verify`)
- **Head SHA:** `a38a5566532fd795dae3ea793d1f605cc533df46`
- **Result:** `completed` / `success`; all **32** steps succeeded, including TypeScript, Vite build, C1a/P1b/P1c regressions, migrated PostgreSQL report tests, Excel/PDF export checks, isolated Docker probes, and the real HTTP 503 security boundary.

**Limitation recorded honestly:** the job status, conclusion, head SHA and per-step conclusions were verified through the public GitHub API. Downloading the raw log archive requires authentication that was unavailable in this session; this report does not claim log-text inspection. The local executions above independently confirm the same suites on the same code.

The prior test commit `5491646` also had a successful run (`42226929818`); `a38a556` is the final verified implementation SHA.

## 5. Independent review

- **Security reviewer, initial pass:** no High/Medium vulnerability and no reachable cross-employee path. Found the builder/guard inconsistency (L1) and the missing direct-builder test (L2). Recommended the minimal fix applied in `a38a556`.
- **Security reviewer, follow-up:** confirms the builder gap is closed, no permission widened, HTTP 503 intact, and **C1b4 is closeable from a security standpoint**. Residual non-blocking notes: `transactionScope.visibilityIn` is not validated, but it is unused by the four personnel SQL shapes and book reports remain denied; caller-supplied filter values are echoed in `appliedFilters`.
- **Test analyst, initial pass:** found the test design sound but closure evidence missing. Flagged filtered-export filter echo (M2), builder scope gap (M3), and minor employee-scoped filter/date gaps.
- **Test analyst, follow-up:** M3/M5 gaps are covered; M2 is a caller-supplied input echo, not foreign-data disclosure, and precise documentation is sufficient; executed evidence is sufficient to close provided the limitations are recorded.

## 6. Data-leak and filter-tampering conclusions

- Two synthetic employees with distinct time-permission rows and notes were used. Each employee receives only their own row; the other employee's row, note, row ID and owner ID are absent from the response and XLSX details.
- `filter.employee` set to another employee (or to an SQL-injection string) returns zero rows and cannot widen scope.
- `type`/`status` and registration-date narrowing were exercised; invalid values return zero rows, not broader data.
- All values are bound SQL parameters.
- Forged/cross-wired access contexts (foreign or blank employee, personnel `all`/foreign owner, request `all`/foreign owner, null/foreign/disabled transaction scope, admin/director downgraded to employee, missing scopes) are rejected with `ReportScopeNotReadyError` and **zero DB queries/connections**, including `export('excel')` and `export('pdf')`.
- **Filter-echo clarification (M2):** when a caller supplies `employee=<foreign UUID>`, the summary sheet echoes that caller-supplied value under “applied filters”. This discloses nothing the caller did not already send and is not DB-derived data. No foreign rows, names, notes or internal row IDs are included. The closure claim is therefore precisely: **no foreign row data or record IDs; caller-supplied filter inputs are echoed by design.**
- Admin and director still see both synthetic rows; no privileged behavior changed.

## 7. Remaining boundaries

- `timePermissions` is approved **internally only** for an authenticated employee's own records.
- `monthly`, `incoming`, `outgoing`, `situation`, `circularsAndAcknowledgements`, `researchers`, `professors` remain denied to employees before SQL.
- HTTP report routes still return **`503 REPORTS_UNAVAILABLE`** for all roles; no web/HTTP enablement.
- Phase 23 remains **OPEN**. Do not start C1c without authorization; C1b4 closure does not authorize book, ViewLog, researcher/professor, general HTTP or production release work.

## 8. Disposition

**23-C1b4: COMPLETE and CLOSED internally.** Acceptance criteria for own time-permission reporting, cross-user denial, filter tampering, forged scope, Excel export, regressions, exact-SHA CI and independent review are met. No production rollout is approved.
