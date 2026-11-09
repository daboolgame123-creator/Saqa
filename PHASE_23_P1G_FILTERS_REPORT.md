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

## Verification — completed 2026-11-05

[GitHub Actions run 42078248881](https://github.com/daboolgame123-creator/Saqa/actions/runs/42078248881) for source commit `a6b89f3d3defebee1c7e90b1b46433567d818ca1` completed **SUCCESS**:

- `npm ci`, TypeScript lint and Vite production build: **PASS**.
- Report P0/P1b/P1c, including new P1g validation: **13 PASS, 0 FAIL, 1 SKIPPED** (opt-in isolation preflight).
- N1 personnel ownership unit checks: **7 PASS**.
- P1c/P1f/P1g real migrated PostgreSQL book tests: **10 PASS** (includes two new independent document-date SQL tests).
- P1d real migrated PostgreSQL personnel/requests: **8 PASS**, including rejection of unapproved document-date filters in those sources.
- P1e real migrated PostgreSQL ViewLog: **11 PASS**, including rejection of document-date filters with unapproved dual-clock semantics.
- Real HTTP reports gate/authenticated sessions: **3 PASS**.
- **Total: 52 PASS, 0 FAIL, 1 SKIPPED**, plus TypeScript and Vite success.

The targeted verification covers the new independent document date but does not constitute a full-system test or external security certification. Institution-approved timezone (for registration day), full N1 guarded end-to-end suite and all Phase 23 release checks remain outstanding.

## Next recommended step

Implement reusable secure Excel/PDF document rendering using the *same* authorized `ReportResponse` for the on-screen result and exported file; do not open download HTTP routes or change the 503 guard until authorization, large-data limits and Arabic formatting are verified.
