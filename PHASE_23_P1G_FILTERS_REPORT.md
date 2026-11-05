# Phase 23 — P1g: independent original document-date filters

**Date:** 2026-11-05. **Target:** `development/phase-23-wip-20261105`.

## Decision and implementation

The project decision `PHASE_23_DECISIONS.md §2.E` distinguishes the registration date (default period) from the official document date (independent optional filter). The database already has `transactions.created_at timestamptz` and `transactions.document_date date`. The new typed and validated `documentDateFrom` and `documentDateTo` fields are **not** replacements for `dateFrom/dateTo` and do not modify `month`, the import flag, or stored document dates.

- Implemented for `monthly`, `incoming`, `outgoing`, and book-status `situation`.
- The report validator independently parses valid calendar dates, checks ordered bounds and rejects document-date filters on all non-book sources including the combined `circularsAndAcknowledgements` report (its two independent timing semantics require separate review).
- Direct repository callers also reject document dates for `employees`, `leaves`, `timePermissions`, `requests`, and `circularsAndAcknowledgements`. The route validator is not treated as the only security boundary.
- Book SQL adds `t.document_date >= $n::date` and/or `<= $n::date` via prepared PostgreSQL parameters; it combines these constraints with separately timezone-bounded registration day, book scope, status, direction, and M:N employee association using AND.
- The summary's `appliedFilters` explicitly distinguishes `تاريخ الكتاب من` and `تاريخ الكتاب إلى` from `التاريخ من` and `التاريخ إلى`.
- A document-only date bound needs **no time-zone conversion**, because `document_date` is a genuine SQL DATE, whereas registration-date bounds still fail without an institution-approved server-injected timezone.
- The new field names do not introduce an additional inferred `source`, `section`, professor or independent researcher mapping.

## Focused tests

- P0 validation: both independent periods accepted and validated; reversed/invalid date and incompatible report types rejected.
- Isolated migrated PostgreSQL book tests: registration and original document date AND together, one-sided document date filters, status totals and service filter display, parameter binding, and compatibility with the currently unknown institutional timezone.
- Personnel and ViewLog SQL: direct repository filtering with document date explicitly rejected.
- Existing N1 ownership unit tests and real authenticated HTTP 503 route tests remain in the required CI workflow.

## Security / release

**No production release:** `/api/reports` must still return 503; employee report reads remain barred in P1b. No database migration, permission, deployment or export route is added. P1g is an internal, focused filter implementation pending SQL/CI proof and later Phase 23 review.

## Verification

Pending run: update this section only after a successful CI run on the exact commit. Full application/N1 end-to-end testing remains separate.
