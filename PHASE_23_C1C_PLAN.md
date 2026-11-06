# Phase 23 — C1c: book-report employee scope security plan and static audit

**Date:** 2026-11-06
**Status:** OPEN — ANALYSIS COMPLETE; implementation and executable acceptance tests PENDING.
**Classification:** HYBRID (ChatGPT static/code work; migrated PostgreSQL + full CI evidence required before closure).
**Starting branch HEAD:** `9c473b561c1a68bf60cbeffeb5cc20e152096a5d`.
**This document is a plan, not test success or approval.**

## 1. Scope / distinctions

Audit employee reporting for `monthly`, `incoming`, `outgoing`, and `situation`. Here `situation` is **book-status report** (حالة الكتب), **not** the protected daily-situation document. The daily-situation book must never appear in an employee report even when erroneously marked public, directly linked or explicitly granted. The HTTP reporting router remains `503 REPORTS_UNAVAILABLE`.

**Approved visibility:** `PublicToEmployees` books, or `SpecificEmployees` books with a currently unrevoked `transaction_availability` grant to the authenticated employee. `Administrative` and `DirectorOnly` books remain hidden. A row in `transaction_employees` is not itself a visibility grant. An arbitrary caller-provided `filter.employee` may only narrow the visible set and must never act as authority.

## 2. Verified static observations (not new runtime evidence)

- `reportAccessFor` uses identity-derived `transactionScopeFilterFor`; `assertReportAccess` currently rejects all four book report types for employee access **before repository SQL**. Exactly four personnel report types are internally approved separately.
- `PgReportRepository.list` applies the guard before calling `buildTransactionsQuery`; `ReportApiService` uses the same guard.
- `buildTransactionsQuery` accepts `TransactionScopeFilter | null` from a caller. It injects a scoped predicate through `transactionScopeCondition` when non-null; `null` deliberately means all records for trusted privileged call paths. The exported builder does **not** independently accept/validate a full `ReportAccessContext`; direct calls must therefore be treated as privileged/internal. Review whether to add an authorized wrapper or change the API to use a validated access context before enabling employee book reports. Avoid weakening any existing direct SQL tests.
- Book SQL excludes `deleted_at IS NOT NULL` and `is_daily_situation = true` for every book-report type. The monthly type also excludes `imported_at IS NOT NULL`; date/status/type/documentDate filters are SQL predicates.
- `transactionScopeCondition` applies public visibility or explicit unrevoked availability and `excludeDailySituations` as an independent AND condition. Existing `reportTransactions.test.ts` has a direct scope SQL probe, but it does **not** prove employee access through actual `ReportApiService.run` or Excel export: those four sources currently fail the shared guard.
- Filter `employee` uses `EXISTS(transaction_employees)` to avoid multiplying rows. `section` and `source` fail explicitly. Existing dates use configured server-side timezone rather than browser timezone.
- `PHASE_23_DECISIONS.md` requires role and scope filtering **before both statistics and detail/export construction**; counts, identifiers and associated metadata must not leak.

## 3. Execution plan — source-by-source with safety gates

1. Recheck current HEAD, session-derived access and report SQL tests. Confirm report-type and filter contracts, roles, and `HTTP 503` invariant. Make no behavior changes during review.
2. Harden or encapsulate direct SQL builder authorization so a future caller cannot pass `null` or a forged `visibilityIn` as an employee and accidentally gain privileged SQL. Preserve valid admin/director behavior; design guard with minimal API impact.
3. Implement and prove **one** internally permitted book-report source at a time, beginning with the source selected after code review (prefer `incoming` to minimize surface). Do not whitelist other sources in the same change. Each subtask requires its own plan, negative tests, independent review and exact-SHA CI.
4. Actual migrated PostgreSQL tests with at least two employees and synthetic books: public, granted `SpecificEmployees`, revoked grant, ungranted link, `Administrative`, `DirectorOnly`, mislabeled public daily-situation, imported, soft-deleted, and different directions/statuses. Test absent/forged employee scope and malformed filters; assert **zero DB reads** on unauthorized paths.
5. Compare `ReportApiService.run` rows and summary counts against the same authorized set. Compare Excel details and summary; forbidden subject/notes/book IDs must not appear. Include forged `filter.employee`, M:N duplicate links and SQL injection attempt. Existing PDF worker integration is still C2 and must not be represented as ready.
6. Verify date/registration vs document-date boundaries, monthly import exclusion, other reports' behavior and state-count equality. Test admin/director unchanged.
7. Run focused + full PostgreSQL/API/TypeScript/build and CI; inspect individual steps on exact implementation SHA. Reviewer and Tester independent acceptance; document remaining limitations.
8. **Only after each source passes** its full acceptance gate may the next employee book report type be internally allowed. Never enable HTTP routes or expand ViewLog permissions as part of C1c.

## 4. Security acceptance

- Employee receives only books public to all or currently granted to that employee in `SpecificEmployees`; no revoked, administrative, director-only or daily-situation books.
- Unauthorized requests and forged scopes are rejected **before SQL**, regardless of direct service/repository/builder use. Never infer authority from filters.
- Count and export use precisely the authorized row set, no metadata/row-existence leakage.
- Admin/director behavior unchanged; the seven formerly blocked sources reduce **only by explicitly verified and approved C1c source(s)**. `circularsAndAcknowledgements`, researchers and professors remain separately blocked.
- `HTTP 503 REPORTS_UNAVAILABLE` remains active. No real institutional data, no production release, no main merge.

## 5. Environment routing

ChatGPT can review policies/source, design limited security hardening and write GitHub commits/tests. Migrated PostgreSQL and full triggered CI require runnable evidence (OpenCode or verified CI). Until independently proven: `C1c = OPEN / HYBRID`; do not close on static review alone.

**Next subtask:** C1c-S1 — direct builder authorization-boundary review / minimal hardening and negative-test design; then source-by-source SQL integration.

## C1c-S1 implementation checkpoint — 2026-11-06

**Status: IMPLEMENTED / WAITING_EXTERNAL (not CLOSED).**

- Changed exported `buildTransactionsQuery` to require `ReportAccessContext` rather than `TransactionScopeFilter | null`. It now calls `assertReportAccess(access, reportType)` before constructing SQL or parameters; only then derives `access.transactionScope`.
- Updated `PgReportRepository.list` to pass the full access context.
- Preserved PostgreSQL visibility predicate coverage by directly testing `transactionScopeCondition`, without allowing the still-blocked employee book report types through the shared guard.
- Added `server/tests/reportC1cBuilderAuthorization.test.ts` with direct builder denial, privilege-scope forgery, zero-read repository/service/export denial and SQL parameterization tests.
- Retained all seven blocked employee report sources and the `503 REPORTS_UNAVAILABLE` boundary. No new book-report authorization or deployment.
- **No test was executed or observed to pass in this ChatGPT environment.** Verify `npm run lint`, `npm run test:server`, `npm run test:db`, `npm run test:api`, `npm run build`, and exact-SHA CI. Review new test discoverability via `test:server`, inspect failures, confirm isolated migrated PostgreSQL fixture and independent reviewer sign-off. Do not mark this subtask closed without evidence.
- **Safety note:** A complete authorization context is not a substitute for trusted session derivation at the HTTP boundary. Privileged contexts must only originate from authenticated server code; future employee-book enablement requires additional independent tests that enforce visibility scope against forged `visibilityIn`, grants and daily flags.

Next: verify C1c-S1 externally; then plan the first narrowly scoped employee book-report source independently.
