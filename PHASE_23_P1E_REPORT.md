# Phase 23 — P1e | Circulars and official acknowledgements (ViewLog)

**Date:** 2026-11-05  
**Target branch:** `development/phase-23-wip-20261105`.  
**Release status:** Internal read-only implementation and isolated tests; **not available over HTTP**.

## Source of truth and identities

- Only an incoming book (`transactions.direction = 'وارد'`) with `sub_type='تعميم'` and JSONB visibility `PublicToEmployees` is a circular. Soft-deleted and daily-situation records do not enter this ordinary report.
- Every registered circular counts once using its actual `transactions.id`; an acknowledgement is **not required** for a circular to count.
- Official acknowledgements come only from `view_logs.acknowledged_at IS NOT NULL`. Neither `viewed_at`, page opens nor downloads qualify.
- Circular date filters use the institution-local calendar day of `transactions.created_at`; acknowledgment date filters **independently** use the day of `view_logs.acknowledged_at`. An old circular's recent acknowledgment is included in the acknowledgment metrics but the old circular does not enter the registered-circular count for the recent period.
- The repository requires a server-injected timezone for any date bounds. `Asia/Baghdad` is used **only by test fixtures**, not asserted as approved production configuration.
- The unique logical acknowledgment key is **(employee_id, transaction_id)**, not a user ID, name or log-row ID. Identical duplicate history rows are collapsed for reporting only and never deleted or rewritten.
- The query never reads `session_ref`; the response includes identified employees' names only in privileged administrative/director mode. It does not expose historical user IDs.
- `status` is a book-status filter applied identically to both source sets. `type`, `section`, `source`, and `employee` are **explicitly rejected** in this combined report until their semantics for both independent indicators are approved; an employee filter must not invisibly change the meaning of “all circulars.”

## Historical anomaly policy

- Missing `view_logs.employee_id` is an unresolved identity, even if a current user account is linked to someone. The system does **not** infer an employee from current user linkage.
- A contradictory non-null `users.employee_id` vs. historical `view_logs.employee_id` is flagged instead of silently assigning one identity.
- If the same employee/book pair has multiple different official acknowledgement timestamps, it is unresolved. The report scans the pair's complete authorized history **before** evaluating the requested acknowledgment period; it will not choose first/last or ignore an out-of-period conflicting row.
- Each **in-period** problematic ViewLog row contributes to `problemRecords` once, regardless of how many reasons apply. Per-reason counts can overlap and do not add to `problemRecords`.
- If `problemRecords > 0`: `acknowledgementOperations` and `uniqueEmployees` are **null**, never misleading partial totals. `verifiedAcknowledgementOperations` and `verifiedUniqueEmployees` are separately labeled as verified subsets, with `complete=false`.
- A ViewLog row without `acknowledged_at` is not an official acknowledgment and is omitted rather than marked as an acknowledgment anomaly.

## Architecture

- Extended `ReportRepository` with `readCircularAcknowledgements()` returning separate circular rows, privileged employee/acknowledgment details, and a structured statistics object.
- `ReportApiService.run()` has a dedicated branch for `circularsAndAcknowledgements`; ordinary report totals still use ordinary source rows, while this report carries independent acknowledgment counters. `summary.totalCount` represents circular count, never the number of ViewLog rows.
- Role/scope check is performed before any SQL. Existing P1b `assertReportAccess` explicitly denies **all employee reports** (including circulars) at service and repository layers pending a deliberate later policy gate; `archivist` obtains no new permission.
- HTTP router still returns **503** before validation/controller/service. No schema/migration, role, permission or production configuration was changed.
- Exports/Excel/PDF and UI remain disabled. No invisible fallback or invented source data.

## Focused tests

New: `server/tests/db/reportCircularAcknowledgements.test.ts` with real isolated migrated PostgreSQL: zero-read circulars, older circular acknowledged recently, non-circular and hidden books, `viewed_at` not counting, multiple circulars for one employee, repeated accounts/same timestamps, missing identity, conflicting timestamps across periods, mismatched user/employee IDs, status predicate, employee denial, unsupported filters and missing timezone.

The file is now in the reporting CI workflow with TypeScript/Vite, P0/P1b/P1c/P1d, N1 unit tests and the HTTP 503 boundary test.

**Evidence status:** Not yet evaluated in this initial checkpoint. The results must be appended from actual GitHub Actions logs; a committed test file alone is not proof of passing.

## Remaining blockers

Production timezone approval; ViewLog release security review and full N1 separately guarded HTTP/SQL suite; additional approved filters, exports, UI, other report types and explicit permission gating before lifting HTTP 503 or the P1b employee deny guard.
