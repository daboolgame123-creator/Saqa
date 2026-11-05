# Phase 23 — P1e security review + P1f book-status report (2026-11-05)

## Scope and baseline

Only `development/phase-23-wip-20261105`. No production database changes, schema migration, permission changes or HTTP report activation. `/api/reports` stays hard-blocked at 503. P1b continues to deny report reads to all employees at both service and repository boundaries.

## P1e — independent security and consistency review

### Finding: two separate SQL queries used independent snapshots

The P1e circular report first queried registered circulars and then queried the ViewLog acknowledgement stream. With the repository backed by a PostgreSQL `Pool`, these were previously executed independently, potentially on different connections and under different database snapshots. A concurrent acknowledgement, visibility change, status edit or soft deletion could therefore yield inconsistent circular/acknowledgement metrics.

**Correction:** Pool-backed reporting now acquires one dedicated client and executes both queries within `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` / `COMMIT`; failures roll back and release the connection. Authorization, selector matching, unsupported filters, and required timezone are checked *before* acquiring the connection. Direct internal calls with a client must already be inside the caller's suitable transaction if snapshot consistency is required.

**Test:** A deterministic PostgreSQL two-session race inserts a formal acknowledgement after the first SELECT but before the second. The first report must not observe it; a fresh report must observe it. Test also verifies read-only transaction commands.

### Additional security probes

- A SQL injection-like status string is treated as a bound parameter and cannot disclose rows.
- Employees are denied any circular-report data even when they supply crafted filters.
- Result detail omits `user_id` and `session_ref`; the test seeds a distinctive secret-like session marker and confirms it is absent.
- Existing anomaly rules remain fail-closed: missing employee identity and contradictory record times mean certified acknowledgement/unique-person totals are `null`, not a fabricated number.

## P1f — status of books, registration periods, and distribution

**Domain decision:** `situation` means book status, **not** daily situation or request status. The only approved statuses remain `قيد المراجعة` and `مكتمل`, and the only approved directions remain `وارد`, `صادر`, `داخلي`.

- Reuses P1c's DDL-backed, parameterized `buildTransactionsQuery` and its scope/availability constraints. Records marked `deleted_at` or `is_daily_situation` are always excluded.
- **Monthly** excludes `imported_at IS NOT NULL`. **Situation** includes nondeleted imported records because the historical-import exclusion is a monthly rule, not a deletion rule.
- Uses `transactions.created_at` (local registration day) for both reports' date filters, under an explicitly injected server-owned timezone; does not confuse registration with `document_date`.
- `ReportApiService` derives `summary.bookStatistics` **from exactly the same authorized filtered rows returned as details**, rather than executing a second independently scoped count query. Counters: `totalBooks`, `incoming`, `outgoing`, `internal`, statuses `قيد المراجعة` and `مكتمل`.
- Summary respects supplied status, type, employee M:N and date filters, including zero-row results. Unsupported section and source mappings reject explicitly. Unexpected database status/direction fails rather than manufacturing a new category.
- Added PostgreSQL integration cases for imported/archived/daily books, role consistency, scope and duplicate M:N associations, registration date boundaries, one-sided filters, and the absence of unapproved source/section mapping.
- `UNRESOLVED_REPORT_TYPES` now names only researchers/professors; their separate source remains unavailable. Existing 503 barrier still applies to *all* reports.

## Verification evidence

**Before CI:** these changes are proposed and must not be considered verified until the exact GitHub commit CI completes. The suite includes TypeScript, Vite, P0/P1b/P1c, N1 ownership unit regressions, isolated migrated PostgreSQL for P1c/P1d/P1e/P1f, and the real HTTP 503 test with synthetic sessions.

## Known pending tasks

Full guarded N1 Windows-only HTTP/SQL suite; production institution timezone approval; document-date independent filter; remaining approved filters and source mapping; independent researcher/professor sources; Excel/PDF summaries and details; explicit later release authorization. No release gates were weakened in this checkpoint.
