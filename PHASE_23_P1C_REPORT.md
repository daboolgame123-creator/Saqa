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

## Actual GitHub Actions verification (2026-11-05)
- The workflow `.github/workflows/phase23-p1c.yml` runs only on `development/phase-23-wip-20261105`, with `contents: read`, locked dependency install, no production database URL or institution credentials.
- First run [42067097054](https://github.com/daboolgame123-creator/Saqa/actions/runs/42067097054): TypeScript and Vite PASS; in-process test caught a genuine P1c defect — generated SQL parameter placeholders were missing `$`. PostgreSQL step was skipped due to preceding failure. Do not quote this run as successful.
- Fix commit `cc737ca916b8cac0f71aa70f82c179b840aa7222` restored six PostgreSQL `$n` bind placeholders. Follow-up run [42067410400](https://github.com/daboolgame123-creator/Saqa/actions/runs/42067410400): all steps PASS (11 in-process report tests passed, 1 intentionally skipped, and 5 PostgreSQL integration tests passed).
- Final extended run [42067759179](https://github.com/daboolgame123-creator/Saqa/actions/runs/42067759179) on `276d4df092f3efb10f2bc2b1855e33c14a67b00a`: **SUCCESS**.
  - `npm ci --no-audit --no-fund`: PASS.
  - `npm run lint` / `tsc --noEmit`: PASS (0 TypeScript errors).
  - `npm run build` / Vite: PASS (warning about chunk size only).
  - P0/P1b/P1c in-process tests: **11 PASS, 0 FAIL, 1 SKIPPED** (intentional network-isolation preflight requires separate opt-in).
  - N1 fail-closed personnel ownership unit regressions: **7 PASS, 0 FAIL**.
  - Real PostgreSQL P1c integration tests: **5 PASS, 0 FAIL**, on test-only migrated `alsqaya_test`, including registration-day boundaries, imports, soft deletion, daily-situation exclusion, direction/status, M:N employee linking, availability/revocation scope, and explicit fail-closed unsupported cases.
  - Total executed test cases in the final run: **23 PASS, 0 FAIL**; 1 opt-in preflight skipped.
- N1's separate guarded real HTTP/SQL integration suite was not run here; these seven checks cover its fail-closed unit regressions only. The report router is still HTTP 503, and all employee report reads remain denied by P1b.
- P1c **SQL implementation and focused PostgreSQL validation are verified**, but this does not authorize production reports or complete Phase 23. Institutional timezone, approved mappings for department/source, independent document-date filter, cross-source ownership (P1d), full ViewLog reports, exports, and the UI remain open.
