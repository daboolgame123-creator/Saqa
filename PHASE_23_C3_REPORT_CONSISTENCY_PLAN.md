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
