# Phase 23 / C2 — internal authorized service-to-worker application handoff

**Base:** `2fdf27b6fa5f59e7aaf159fffc2d1df31a1fe042` (Phase 23 cursor PR #27).
**Branch:** `integration/phase23-c2-internal-handoff-20261107`.
**Classification:** internal code and synthetic test only; **NOT an HTTP or production PDF activation**.

## Analysis before implementation

Previously `ReportApiService.export` used the legacy PDFKit path; the standalone `runInternalPdfWorker` accepted strictly validated JSON but was **UNWIRED** to the authorized `ReportApiService.run` output. Merely demonstrating the subprocess itself did not demonstrate that institutional scope checks happen before launching the worker.

## Implemented boundary

An additional **internal-only** `ReportApiService.exportIsolatedPdf` operation performs:

1. `assertReportAccess` and SQL-scoped `run(filter, access)`;
2. `buildReportExportModel` with consistency, identity and row count guards;
3. `runInternalPdfWorker` with `encodeReportPdfInput` data-only JSON over child stdin;
4. fixed PDF export metadata returned with bounded, verified transport bytes.

Worker executable and argv remain supplied as **server-owned trusted configuration**, never HTTP parameters. Existing `export` (PDFKit/Excel), all HTTP routes, role handling, PDF rendering settings and the global `503 REPORTS_UNAVAILABLE` guard are untouched.

## Tests and evidence boundaries

- Migrated synthetic PostgreSQL populates a visible incoming book and an Administrative-only book; confirms employee C1c PDF worker input never contains the hidden row or internal person/transaction IDs, while admin can retrieve both.
- Worker process test fixture reads the full strict JSON on stdin, reproducing it inside an **artificial PDF-looking byte stream** for examination. **This is not a real PDF renderer or proof of Arabic visual correctness.**
- For an unsupported employee report, the access guard rejects before fake repository reads or child launch.
- 251 input rows fail the fixed JSON budget before launch; pre-cancelled operation rejects without returning PDF.
- New exact-SHA workflow adds the C4 **offline synthetic** inspect-policy unittest, focused service-to-worker PostgreSQL test, worker contract tests, TypeScript/build/Chromium, all server/DB/API regressions and the formal report 503 guard.
- Do not mark tests passed before observing the exact-SHA run.

## Still blocking official activation

- **C2:** audited launcher/worker wiring in the actual reviewed application deployment and rendering output; real Arabic PDF with real tested font and layout; trusted fixed executable/image config and cleanup on crash/timeout.
- **C4:** immutable image digest and license/font provenance; actual target-host no-network, read-only, capabilities/seccomp, CPU/memory/PIDs and worker process-group teardown checks, with recorded sanitized evidence.
- **C1/C3:** exhaustive authorized institutional scope and export-filter correctness, including unresolved researcher/professor sources; no successful fictitious report.
- **Final release:** independent security review, real LAN/UAT, backups and approved baseline merge only with explicit owner authorization.

**No production approval, no base-branch merge and no HTTP report activation** from this checkpoint alone.
