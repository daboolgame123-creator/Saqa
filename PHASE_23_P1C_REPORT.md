# Phase 23 — P1c: book-report SQL checkpoint (2026-11-05)

## Evidence and scope
- Based on the branch HEAD `144dbf4f890f8cc36e17758db247872d2bc40f0a` and migrations 0002, 0006, 0009, 0013; checked against `transactionRepository.ts`, `transactionScopeSql.ts`, and `PHASE_23_DECISIONS.md`.
- Replaced undefined alias `t`/nonexistent transaction columns (`source`, `employee_id`) with a real `transactions t` query; its select list uses DDL-backed columns only.
- P1c book reports: `monthly`, `incoming`, `outgoing`. Direction is enforced by report type. Period uses registration `created_at`, never `document_date` or the existing document-month column.
- Archived and daily-situation books are excluded in SQL. Monthly also excludes imported books. Correlated `EXISTS` filters linked employees without inflating row counts; book scope is applied before results are read.
- Administrative `null` transaction scope generates `TRUE` only after the P1b access guard has verified the actor; a non-null scope uses the shared `transactionScopeCondition` SQL predicate.
- The `section` and `source` filters have no approved mapping in existing DDL: supplied values throw `REPORT_FILTER_UNAVAILABLE` instead of being silently ignored or mapped to `entity`.
- `circularsAndAcknowledgements` now fails as unimplemented instead of returning an ordinary book list; ViewLog metrics are independent and remain future work.

## Deliberate release blockers
- Institution-local calendar-date timezone is NOT fixed by the current domain decisions. For report date bounds, the repository requires a **server-provided** timezone. The production factory does not provide one yet, so any bounded book report fails with `REPORT_DATE_ZONE_REQUIRED` rather than quietly using UTC, PostgreSQL session timezone, or browser time. Isolated tests may inject a timezone solely for deterministic verification; this does not decide the institution's timezone.
- Independent document-date filtering is not in the HTTP report contract and remains pending. No new filter field or database column has been invented.
- P1b's employee-denial guard remains for ALL report types until P1d verifies other sources' SQL ownership. The new book-scope SQL alone is not a reason to lift it.
- `/api/reports` must remain HTTP 503 (`REPORTS_UNAVAILABLE`). No Excel/PDF, UI, schema or N1 security changes.

## Verification status
- Review of SQL column names against migration 0002 and additional 0009: performed statically.
- Source-based SQL checks and isolated PostgreSQL integration test cases: included in the repository changes, but **not executed in this environment** unless separately reported with actual logs.
- TypeScript/Vite/full test suite: not claimed as passing without an actual run.
- P1c is a **checkpoint**, not release approval. Confirm date/time policy and execute the PostgreSQL suite before Phase 23 can be accepted.
