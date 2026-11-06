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
