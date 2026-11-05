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
