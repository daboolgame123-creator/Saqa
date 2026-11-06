# Phase 23 — secure closure checklist (2026-11-06)

**Status: NOT CLOSED / HTTP 503 stays in place.** Phase 23 is broader than the P1k PDF engine proof. No incomplete permission branch will be enabled simply to finish the phase quickly.

## Verified achievements

- Reports backend and scoped SQL tests for supported administrative/director sources have successful CI evidence; reporting services and exports are still **internal only**.
- XLSX and existing PDFKit export safety/row limits, integrity and PostgreSQL integration/security regressions passed in exact [CI run 42200721492](https://github.com/daboolgame123-creator/Saqa/actions/runs/42200721492) on `bca3d747`.
- P1k ALT-02–ALT-08 denied resources, Arabic content integrity, output bounds, RTL template/escaping and isolated container proofs, with exact verified previous CI runs.
- ALT-09: the **real ALT-07 JSON → ALT-08 fixed escaped HTML template → WeasyPrint inside ALT-06 isolated Docker → validated PDF** succeeded in run `42200721492`; two synthetic PDFs preserved three details and two acknowledgement IDs/markers. This is an experimental security proof, **not production application wiring**.

## Required before declaring Phase 23 implementation complete

| Priority | Closure requirement | Evidence to accept | Current status |
|---|---|---|---|
| P0 | Verify employee transaction/personnel/request scopes per source; ensure unauthorized reads fail **before SQL**, and employee receives only own permitted ViewLogs | PostgreSQL + HTTP negative authorization tests, cross-user and missing linkage; independent review | **BLOCKED**: `reportAccess.ts` intentionally rejects all employee reports with `ReportScopeNotReadyError` |
| P0 | Review each report type, filter, registration/document dates, import exclusions, deleted/history handling, circular + acknowledged_at semantics, problem-record numbers | Exact fixture-to-SQL integration tests and review against `PHASE_23_DECISIONS.md` | **PARTIAL** for supported types; researchers/professors require approved source definitions and must remain unavailable |
| P0 | Connect export (same authorized `ReportApiService.run` response for screen and PDF/Excel) to reviewed, fail-closed worker launcher | Independent scope-leakage, malformed input, crash/timeouts, zero partial-output tests with full pipeline | **NOT IMPLEMENTED**: ALT-09 is test-only |
| P0 | Pin/vet container image by immutable digest, package hashes, approved fonts and patch policy; run host-specific controls | Target-host cgroup/seccomp/LSM, storage/network mounts and image provenance acceptance | **NOT APPROVED**: CI image base uses mutable tag |
| P0 | Test HTTP/report route production-like wiring while **still behind explicit gate**; obtain permission/security sign-off | Same-role/different-user, unauthorized, filter tampering, malicious files, and report equality probes | **NOT STARTED for release**; `503 REPORTS_UNAVAILABLE` intentional |
| P1 | Final Arabic report print-readability review, including long RTL/bidi values, last pages and acknowledgements | Reviewed actual target image/host rendered reports; no truncation, semantic ambiguity or wrong dates | **CI synthetic proof available**; production host/font review pending |
| P1 | Final regression + migration review + rollback/release documentation | Exact final SHA all green, independent review, signed deployment checklist | **PENDING** |

## Order of next implementation tasks

**23-C1 (next):** plan and implement source-by-source scope verification for employees, starting with the existing intentional fail-closed guard. Never lift the guard until per-source SQL and all negative tests pass. This is the principal reporting *security* blocker, more important than further PDF styling.

**23-C2:** audited internal integration of the approved `ReportExportModel` → v1 JSON → worker with timeout, hard output cap, no writable host mounts, and safe failure. Use no HTTP activation; ensure all authorization occurs before model construction.

**23-C3:** supported report/filter completeness review; document unavailable researchers/professors sources without inventing schemas. Finish independent SQL role and ViewLog policy tests.

**23-C4:** image/font supply-chain, target-host hardening and deployment evidence; finish print review. Only after all security/functional acceptance criteria are proven may the explicit HTTP 503 gate be separately reviewed for removal.

**Rule:** plan → code → test → independent review → document; do not start the next stage until the current one is closed. No real employee data in CI; no main branch changes.

## 23-C1a plan — immutable employee denial at service/repository (2026-11-06)

**Analysis before edits:** Existing `reportAccessFor` correctly derives separate transaction/personnel/request scopes from trusted role/employee ID; `buildScopedPersonnelReportQuery` has prior actual migrated PostgreSQL tests proving owner-only WHERE constraints. However, `ReportApiService.run` and `PgReportRepository.list` still explicitly reject **every employee report**, and circular ViewLog has separate verification requirements. Even a verified SQL builder alone does not authorize opening the public/service path.

**Task to complete and close now:** Add focused internal regression tests (no application behavior change) proving all report types fail **before any repository or DB query** for an employee, and forged role/scope variants do not gain a privileged query. Include missing/blank linked employee IDs and export, with explicit counters. Keep all existing restrictions as-is. Add gating CI step, verify exact run, review and document. Do not start 23-C1b or lift guards until this checkpoint closes.

**Acceptance:** employee reads and exports on every report type are rejected with `ReportScopeNotReadyError`, no repository/database reads, forged admin/director scopes are rejected, and bad employee identity is denied at access derivation; CI and existing PostgreSQL/HTTP 503 security regressions must remain green.

## 23-C1a execution and independent CI verification — 2026-11-06

**Plan-first:** `f6d405aaa40425b65fb0f160db27e0595b86f6bb`. Tests committed `45b6ff5a466a45c0683ace25d40d8bcc9b5ea7a8` and CI step committed `09b9bcc7670ced7626d79b4df3d87598a5b3f8c7`.

**Exact CI proof:** [run 42203462717](https://github.com/daboolgame123-creator/Saqa/actions/runs/42203462717), head `09b9bcc7670ced7626d79b4df3d87598a5b3f8c7`, job `127844176094`, **COMPLETED SUCCESS**. All individual workflow steps succeeded. Its logs show **four C1a subtests passed, 0 failed**:
1. `ReportApiService.run` and `export` reject employee access on **every 11 report types** without repository calls.
2. Direct `PgReportRepository.list` and circular/acknowledgement read reject employee access **before any SQL query or pool connection**.
3. Admin/director role-scope forgeries and employee-role downgrades are rejected before reads.
4. Missing/unlinked/unknown employee identities never become a usable report scope.

**No behavior change**: This step added only synthetic unit regressions and workflow wiring. Existing PostgreSQL owner-only query-builder tests and HTTP 503 tests remained passing in this same run. This validates the **current fail-closed guard**, not that enabled employee report reads are safe.

**C1a decision: COMPLETE and VERIFIED.** Next 23-C1b must review **one source at a time** (personnel/requests/leaves/time permissions, transactions separately and ViewLog separately). Make owner SQL and service authorization agree; test real migrated PostgreSQL queries plus adversarial cross-user/filter/forged-scope cases before changing the employee guard. Do not make an all-sources authorization switch. `503 REPORTS_UNAVAILABLE` stays mandatory throughout.

## 23-C1b1 plan — enable only employee self-personnel report internally (2026-11-06)

**Before implementation:** Migrated PostgreSQL `reportPersonnel.test.ts` already proves owner predicate `employees.id = $parameter` for an employee and blocks another employee through an independent WHERE condition, but the service and repository still deny all employee report sources. Other sources (transactions, requests, leaves, time permissions, circular/ViewLog) must remain denied. The external HTTP router stays 503.

**Steps:** (1) explicitly whitelist `reportType=employees` only for employee access with a consistent nonblank session-derived identity, personnel owner ID and independent request owner ID. Keep other 10 types fail-closed at the shared service/repository guard. (2) Keep the employees SQL owner predicate applied *before SELECT* and honor filters only as further narrowing constraints, never as an identity override. (3) Update previous all-type denial tests so they continue to require zero DB reads for **all other employee report types**, and verify the single new allowed source through a real migrated PostgreSQL integration test: owner vs stranger, forged employee filters, missing/invalid owner scopes, admin/director parity, summary and Excel (PDF requires real font). (4) Preserve all other reports/HTTP blocks, run exact CI and review failures before signing off.

**Acceptance:** employee `employees` internal query returns precisely their own record, never co-worker records, and exported details/summary cannot expand scope. Denied report types, malformed access scopes and spoofed roles fail before SQL. **No general employee authorization, no Web/HTTP enablement.** If tests fail, revert/repair rather than widen the scope.

## 23-C1b1 closure — employee own personnel source only (2026-11-06)

**Plan-first:** `1df7f24c3d936bcf204a5bd930835442af181c70`.

**Changes:** `9a90dcea446e580cfc5f95f94278eca6479b0645` allows internally `reportType='employees'` for an employee only if authoritative identity, personnel owner ID, request owner ID and transaction scope all match. The other ten types retain `ReportScopeNotReadyError` before repository/SQL. `36e56237086e587f5e8ba4379a82e43f56d61591` preserves existing zero-read tests for those types. `aa7d1307604c4a1c4b4e73d529898aaf7b1d7c36` tests direct source owner query. `840fb3884bd0a46885087fceea8a37730cf25a97` adds migrated PostgreSQL service-level and Excel export testing, including conflicting employee filters and forged scopes. `36492a52653f033ffd013a67b2366186e1d605c8` updates the older P1b test that incorrectly expected `employees` to remain blocked.

**Exact verified CI:** [GitHub Actions run 42210395041](https://github.com/daboolgame123-creator/Saqa/actions/runs/42210395041), head `36492a52653f033ffd013a67b2366186e1d605c8`, job ID `127867314898`, **completed SUCCESS**, all listed steps including TypeScript/build, earlier P1b access tests, migrated PostgreSQL personnel and employee ownership tests, export regressions, HTTP 503 and Docker/JSON PDF tests.
- Log: `ok 10 - P1b access is session-derived, independent for each source, and fail-closed`.
- Log: `ok 3 - C1b1: actual service/export only includes own employee; conflicting filter never widens`.
- Log: `ok 4 - C1b1: employee forged identity or owner scope rejects before actual DB query`.
- Previously successful restricted renderer still passed `P1K_ALT09_ISOLATED_JSON_ALL_PASS documents=2 network=none data_only=1`.
- The intermediate failed runs at `9a90dcea`, `36e56237`, `aa7d1307`, `840fb388` were due to an older P1b test still asserting universal employee denial; the final commit corrects the outdated expectation, **without** relaxing other report source restrictions. CI is green at the final implementation SHA.

**Review result:** The only new internal read is `employees`; query builder enforces `e.id = $parameter` derived from the validated employee access context, with independent user filters only narrowing the SQL. Real two-person database tests verified no cross-user rows, no foreign name in own XLSX, and no reads for invalid employee contexts. No new public route and no loosened admin/director scope. **C1b1: COMPLETE for internal owner-only personnel source.**

**Still blocked:** employee `monthly/incoming/outgoing/situation`, `requests`, `leaves`, `timePermissions`, `circularsAndAcknowledgements`, `researchers`, `professors`; independent verification is required per source. `HTTP 503 REPORTS_UNAVAILABLE` remains active. This does not close C1 overall or Phase 23, and cannot be treated as deployment approval.
