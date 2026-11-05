# Phase 23 — P1d: independent report-source SQL checkpoint (2026-11-05)

## Changes
- Align `requests`, `employees`, `leaves`, `timePermissions` SQL with migrations 0001/0003/0004/0012. Remove invalid employee projections like `userId`, `createdAt`.
- Use independent `requestScope.ownerEmployeeId` for requests and `personnelScope.employeeId` for personal resources. Both are derived from session identity by P1b. The supplied `employee` report filter is a **second, narrowing predicate** only; no client filter may replace the owner predicate.
- Apply registration-date `created_at` uniformly using an explicitly injected server timezone; refuse bounded dates without it (same release blocker as P1c).
- Implement only supported filters: requests type = `kind`; employees type = `category`, section = `department`; leaves type = `type`; timePermissions type = `status` as defined by the existing validator; all four support record status and employee identity. The `source` filter and non-employee `section` filters throw `REPORT_FILTER_UNAVAILABLE` instead of silently ignoring input.
- No DB schema, permission, API or UI changes. No new role. No invented researcher/professor domain.

## Safety boundaries
- All `employee` accesses through ReportApiService/PgReportRepository remain **denied before SQL** by P1b until independent review and integration evidence permits a deliberate subsequent policy change. The internal SQL builder is exported for *test-only owner-scope probes*; no HTTP route exposes it.
- `/api/reports` remains HTTP **503**. Book scope protections (including N1 daily-situation exclusions) remain unchanged.
- The unverified historical `PHASE_23_REPORT.md` must not be used to infer completion.
- Institution timezone, standalone document-date filter, export, reporting summaries and unresolved report categories are beyond this checkpoint.

## Verification
- Added isolated PostgreSQL integration tests `server/tests/db/reportPersonnel.test.ts` covering all four tables against migrations, admin/director, opposite employee IDs, conflicting client filters, supported and unsupported fields, and one-/two-sided registration dates.
- Added a separate GitHub Actions step to run those tests, alongside P1c real PostgreSQL tests, N1 owner-scope unit regressions, TypeScript and Vite.
- **Initial status:** tests are committed for execution, not assumed successful. Read the run logs to determine actual results. A green run does not authorize removing the 503 guard.

## Actual CI results and limitations — 2026-11-05
- First CI [42068972833](https://github.com/daboolgame123-creator/Saqa/actions/runs/42068972833) failed TypeScript in a **test-only** result type: `reportPersonnel.test.ts` omitted the optional projected `employee` property. The failure was corrected in isolated commit `41625ce36cf108aac22c9291fe837a92551d5b28`. No change to repository SQL was needed after this diagnostic.
- Successful complete run [42069098277](https://github.com/daboolgame123-creator/Saqa/actions/runs/42069098277) on `41625ce36cf108aac22c9291fe837a92551d5b28`:
  - `npm ci`: passed.
  - `tsc --noEmit`: passed, no errors.
  - `vite build`: passed.
  - P0/P1b/P1c report unit tests: **11 pass**, 0 fail, 1 intentionally skipped (special opt-in network isolation preflight).
  - N1 personnel ownership unit regressions: **7 pass**, 0 fail.
  - P1c real migrated PostgreSQL tests: **5 pass**, 0 fail.
  - P1d real migrated PostgreSQL tests: **5 pass**, 0 fail.
  - **28 passing test cases, zero failures, one skipped**, plus successful compiler and Vite build.
- The P1d integration suite uses synthetic rows inside isolated `alsqaya_test` with migrations applied. It executes both admin/director repository reads and employee-constrained builder SQL, including all four real tables and deliberate attempts to cross owner identities.
- **Unchanged release guardrails:** the actual service/repository still throws `REPORT_SCOPE_NOT_READY` for every employee report; no direct employee report is enabled. The report HTTP router is **503** and exports/UI remain unavailable.
- The institution-local timezone remains unapproved and unset for the production repository constructor. HTTP date-bound report queries therefore do not yet have a configured calendar policy. Unmapped source/department filters fail explicitly.
- Not run here: the standalone N1 guarded *real HTTP/SQL* suite and the entire application test suite. N1's 7 unit tests passed; that narrower fact must not be presented as the full suite.
- Outcome: **P1d SQL ownership and source-schema verification passed the focused integration tests**. Full Phase 23 release remains blocked. A separate security review/policy checkpoint is required before lifting the employee report guard.
