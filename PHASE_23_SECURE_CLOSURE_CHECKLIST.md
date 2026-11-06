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

## 23-C1b2 plan — owner-only request reports (2026-11-06)

**Analysis:** The existing `requests` SQL projection selects `requests.employee_id` and applies an independent owner predicate from `access.requestScope`; `filter.employee` only narrows it. Existing migrated PostgreSQL `reportPersonnel.test.ts` checks both owners via the query builder, but the `ReportApiService` and `PgReportRepository` still deny employees for this report type. No changes to workflow requests or HTTP report routes are authorized.

**Implementation and gates:**
1. Add `requests` to the *exact* employee-only internal allowlist inside `assertReportAccess`, retaining matching nonblank session `employeeId`, `personnelScope`, `requestScope`, and transaction scope checks. All other eight unapproved employee types remain denied **before any DB read**. No changes to admin/director behavior.
2. Update C1a/P1b denial regression lists, preserving all still-denied types and the zero-read assertion. Add migrated PostgreSQL + `ReportApiService.run` + Excel export tests for two employee identities, own request, other request, forged owner, conflicting employee filter, status/kind and timestamp narrowing, and prevent unrelated employee data in response/export. No real institutional records.
3. Run full CI on exact implementation SHA; inspect failed steps and fix before closure. A negative regression must prove direct repository calls cannot override a session-derived owner with a request filter.
4. Keep `HTTP 503 REPORTS_UNAVAILABLE` and existing PDF authorization/worker protections unchanged. Do not open leaves/time permissions/books/ViewLog in this task.

**Acceptance:** Employee sees only their own requests through internal service/export; admin/director behavior remains unchanged; unapproved types stay blocked before SQL; CI and migrated PostgreSQL tests green. **A green CI proves this source only, not the whole Phase 23.**

## 23-C1b2 closure — employee owner-scoped requests (2026-11-06)

**Plan-first:** `74ac29af6e70c81700d355ae8cb5552ce7eadb6f`.

**Implementation:** `224e6418f41bacf2e6fccafc2ea7bb33f362c284` adds only `requests` to the internally allowed employee report types, alongside `employees`. Every allowed employee access still requires one consistent nonblank employee ID across the session context, personnel-owner scope, request-owner scope, and transaction-scope identity; the other **nine** report types remain rejected before SQL. `66dff5f1b6f488430552fab3174deb1426f2e5e0` and `2bb0980f021e82f5d672f27fd45b4078e181b548` updated zero-read denial and P1b tests without opening other sources. `8e134430c5b3bea42e3b865133bebb60cbd7ce5e` added migrated PostgreSQL + actual service + Excel assertions with two separate employees, cross-user filters, type/status/date narrowing, and forged scope attempts. Final test correction `dd75e984aa9512f511eedffd566e396223b5e574` asserts permitted exported values **without requiring internal request IDs to appear** (the exporter correctly omits those IDs).

**Real CI evidence:** [GitHub Actions run 42214240142](https://github.com/daboolgame123-creator/Saqa/actions/runs/42214240142), exact head `dd75e984aa9512f511eedffd566e396223b5e574`, job `127880175067`: **COMPLETED SUCCESS**, no failing steps including TypeScript, migrated PostgreSQL, P1b/P1c regressions, XLSX/PDF and isolated Docker. Log records:
- `ok 5 - C1b2: actual service, SQL and XLSX return only the employee own requests`;
- `ok 6 - C1b2: forged request identity/scope blocked at service and repository before DB reads`;
- `P1K_ALT09_ISOLATED_JSON_ALL_PASS documents=2 network=none data_only=1`.

**Failure investigation and resolution:** Earlier push CI at `8e134430` failed only because the new XLSX test expected a request's internal database ID in the exported workbook; existing export security intentionally excludes row IDs. The corrected test requires the approved request type, owner and status in the workbook and confirms **both own/foreign internal request IDs and the foreign employee identity are absent**. No production export code was weakened.

**C1b2 disposition: COMPLETE for internally authorized own requests only.** Live owner SQL uses a required `requestScope` predicate over `requests.employee_id`; user-provided `employee` and other filters can narrow but never replace it. Other nine employee report types including leaves/time permissions/books/ViewLog remain blocked. The HTTP report router continues to return **`503 REPORTS_UNAVAILABLE`** for all roles; this is not an authorization release or Phase 23 final sign-off.

## 23-C1b3 plan — own employee leave report (2026-11-06)

**Analysis before edit:** `buildScopedPersonnelReportQuery('leaves')` reads `leaves.employee_id` and adds the independent `personnelScope.kind='owner'` predicate in SQL; user `filter.employee` can only narrow. The migrated PostgreSQL tests prove owner SQL, date, type and status filtering for this source. The shared service/repository access guard still rejects employee `leaves` before any SQL. Thus the remaining task is the **specific service/repository release** with complete regression evidence. Neither public HTTP nor other report source is ready.

**Planned changes:** Whitelist **only** `leaves` alongside already-verified `employees` and `requests` for authenticated, cross-consistent employee contexts. Preserve default denial for all **eight** other sources (including timePermissions/books/ViewLog). Update C1a/P1b denial suites to verify exactly that set; extend PostgreSQL fixture tests for both employees, conflicting foreign filter, date/status/type narrowing, zero-read rejection for forged/missing owner scope, and service Excel export (no internal row ID or coworker ID leaks). Assert admin/director parity persists. Do not change report SQL, permissions of unrelated resources, report HTTP routes or PDFs.

**Acceptance:** own leave only; never another user's leave, including direct repository and export. All source-denial tests pass and exact head commit CI succeeds. No automatic expansion to time permissions.

## 23-C1b3 closure — employee own leave reports (2026-11-06)

**Plan-first:** `56f584e70634251c8c4ec50b0290f69eeeeb5f9a`.

**Implementation:** `51bb08309a9c6e0923b59228745d18fd438d8bdd` adds only `leaves` as the third internally authorized employee report source, with the existing full employee identity, personnel/request owner and transaction-scope consistency guard; `employees` and `requests` remain enabled internally from earlier audited checkpoints. `71b972d0a67b03fbb0b2d8918ba65641bbc816e5`, `d9f8523c4dd6c212cec639a863787942db2cedac`, and `12ae60359685df478235def3109bda6370f8e7ae` maintain denial tests for **eight** other report types, update P1b read counts and verify actual repo own-leave results. `6ec6f9fbb067d77f59b5637e13c1c6266a107f42` adds migrated PostgreSQL service/XLSX tests for two different employees, foreign `employee` filter, date/type/status filters, omission of internal leave and unrelated employee identifiers, and forged-scope tests rejecting **before any DB read**.

**Verified exact GitHub Actions run:** [42217055691](https://github.com/daboolgame123-creator/Saqa/actions/runs/42217055691), implementation SHA `6ec6f9fbb067d77f59b5637e13c1c6266a107f42`, job `127889578740`, **COMPLETED SUCCESS**, all workflow steps successful (TypeScript/build/PostgreSQL/in-process/HTTP-503/PDF and isolated Docker). Exact relevant log entries:
- `ok 7 - C1b3: employee sees only own leaves in actual service and XLSX`;
- `ok 8 - C1b3: forged leave owner and cross-wired scopes cause zero DB reads`;
- `P1K_ALT09_ISOLATED_JSON_ALL_PASS documents=2 network=none data_only=1`.

**Review:** The `leaves.employee_id` predicate derives from `personnelScope` and is appended to SQL before SELECT; user filters can only narrow it. Test verifies own row, foreign row exclusion, XLSX owner-only output and no internal row identifiers, and all other unreviewed employee report types denied by guard. **C1b3 COMPLETE internally**; `timePermissions`, book reports, ViewLog and unavailable researcher/professor sources remain blocked. HTTP `503 REPORTS_UNAVAILABLE` unchanged, no production rollout.

## 23-C1b4 plan — employee own time permissions (2026-11-06)

**Scope and code audit before implementation:** `timePermissions` is the fourth personnel report table, backed by `time_permissions tp` with `tp.employee_id`. `buildScopedPersonnelReportQuery` already ANDs the session-derived `personnelScope.kind='owner'` predicate with any supplied employee/date/type/status filters. At head `294877e3829e7efc1e25ecc2be757ba0b49e956d`, the shared `assertReportAccess` intentionally denies employee time-permission reports before SQL; `employees`, `requests`, and `leaves` alone are internally approved. HTTP reporting remains 503.

**Restricted implementation:** Add **only** `timePermissions` to the employee allowlist of the shared service/repository guard; preserve one nonblank identical identity in session, personnel owner, request owner and transaction scope. Keep all remaining **seven** employee report types denied before SQL (four book reports, circulars/ViewLog, researchers and professors). Do not change the report router, privileged role scopes, data schema or PDF worker.

**Verification:** Update C1a/P1b denial and read-count expectations. On an isolated migrated PostgreSQL instance with synthetic data for two different employees, exercise actual repository, `ReportApiService.run`, `ReportApiService.export('excel')`: owner vs other, forged conflicting `filter.employee`, local registration-date limits, type/status narrowing and malicious filter data. Prove no foreign employee/record IDs in response and Excel; prove bad owner/personnel/request/transaction identity rejected with **zero DB reads** even for export. Preserve admin/director parity, other-source denial and HTTP 503. Run full triggered CI at the exact implementation SHA; inspect jobs and test counts; independent security review and explicit closure documentation required.

**Acceptance boundary:** This checkpoint permits only internal owner-only `timePermissions`. It does **not** approve book reports, circular/ViewLog, researchers/professors, general HTTP access or Phase 23 release.
