# Phase 23 — C2 secure PDF application integration: design and acceptance plan

**Date:** 2026-11-06
**Status:** PREPARATORY_ONLY / OPEN; not integrated or deployed.
**Classification:** HYBRID: independent code/contract audit + synthetic boundary tests can be written in ChatGPT; actual worker-launcher, Docker, host containment and full CI evidence need suitable execution.
**At planning start:** `ab68e78a04514468cafc02c9c0c5e53a07721afb` (recheck HEAD; other agents may be working concurrently).
**Preceding work:** C1c-S1 remains WAITING_EXTERNAL; C1d authorization has a separate preparatory plan. No HTTP activation.

## 1. Observed existing implementation

- `ReportApiService.export()` always invokes `this.run(filter, access)` first; `run` calls `assertReportAccess`, obtains repository-scoped rows, and derives statistics from those same rows. Export invokes `renderReportExport` in `server/src/api/services/reportExport.ts`.
- `renderReportExport` currently renders PDF through PDFKit and an explicit Arabic font; it does **not** launch the isolated WeasyPrint worker. Existing PDFKit behavior and tests are an internal baseline, not a production-approved Arabic-print endpoint.
- `buildReportExportModel(reportType, report)` is the shared display-to-export transformation: validates row/count coherence and export budgets; excludes raw record IDs from detail columns; builds circular/acknowledgement indicators only if the specialized payload is internally coherent.
- `encodeReportPdfInput(model)` validates a strict data-only `schemaVersion=1` object with fixed keys/column widths, UTF-8/Unicode checks, per-row and total budgets. It must be called ONLY on an authorized `ReportExportModel`, not on HTTP body data.
- Existing CI-only ALT-07–09 prove synthetic JSON → fixed escaped RTL template → WeasyPrint inside isolated Docker; the Docker runner is **not** connected to `ReportApiService.export` and does not establish deployment-host approval.
- HTTP reporting is still explicitly `503 REPORTS_UNAVAILABLE`; this gate must not be removed or weakened during C2.

## 2. Security design: proposed production path (NOT implemented here)

`trusted session → assertReportAccess → ReportApiService.run → buildReportExportModel → encodeReportPdfInput → reviewed worker launcher → validate bounded PDF → ExportResult`

The launcher must never accept raw HTML, URL/path, command-line arguments, fonts, arbitrary templates, recipient data or a full session/request object from callers. The only untrusted content crossing into the renderer is the versioned data JSON generated internally from already-authorized rows. No raw employee IDs, account IDs, session references or audit secrets may be in the worker input unless explicitly approved for display.

Prefer a fixed, versioned request/response contract over running arbitrary shell strings. Launcher executable, image digest, fonts, arguments and limits are server-owned configuration subject to C4 provenance approval. All renderer exits, malformed envelopes, excessive output, nonzero codes, timeouts, resource-limit failures and PDF validation failures must reject atomically with no success-shaped partial bytes or host temporary-file disclosure. Clean only owned ephemeral files. Capture bounded, redacted diagnostic logs and no sensitive document bodies.

No writable institutional mounts, host network or broad privileges. Container read-only root, no network, unprivileged UID, capabilities dropped, no-new-privileges, seccomp/LSM review, bounded PID/CPU/memory and time/IO/file-size quotas; revalidate on the actual institutional host. Container output may be retrieved only through an explicitly bounded allowlist after the process finishes successfully. A worker's internal JSON validation and offline URL fetcher are additional defenses, not substitutes for OS isolation.

**Access and operational distinction:** A report type already allowed to `admin/director` internally is not an HTTP activation. Unsupported `employee` sources must continue to fail before repository reads or renderer initialization. Do not switch the default PDF engine until integration tests and C4 operational checks pass.

## 3. Independent tests that can be prepared without Docker

- Build a *real* authorized `ReportApiService.run` result from a synthetic fake `ReportRepository` with fixed rows, convert via `buildReportExportModel` and `encodeReportPdfInput`, decode it, and assert original row IDs/session identifiers are not present.
- Reject forged employee report types on `run` / `export` **before** invoking the fake repository; never invoke an encoder/worker for rejected scope.
- Reject report/count mismatch, circular ack count mismatch, oversized input, unexpected object metadata and malformed UTF-8 at the JSON boundary.
- Ensure model contents are cloned, caller mutations after serialization do not change payload; markup and URLs remain *literal JSON strings*, never trusted executable HTML.
- These test results prove only the application-side data model contract, not Docker isolation, PDF rendering or target-host readiness.

## 4. External execution and acceptance

1. Independently review this contract and current PDFKit + worker implementation. Identify exact integration point and expected `ExportResult` shape; retain Excel unchanged.
2. Implement a small, fail-closed launcher with fixed config, no shell interpolation, controlled temp paths, output and timeout caps; build it behind an internal-only feature gate without changing HTTP 503.
3. Run true integration from `ReportApiService.run` with real migrated synthetic PostgreSQL + one admin/director visible report, plus authorization failure cases before worker invocation.
4. Test normal two-page Arabic output, corrupt JSON, HTML/file/URL probes, nonzero exit, midstream crash, timeout, truncated PDF, wrong MIME/PDF header/EOF, oversized output, temp-file cleanup, parallel invocations, and rollback to HTTP 503 on all errors.
5. Validate image/font digest and license, patch policy, target-host cgroup/seccomp/LSM, network/storage restrictions, and correct Arabic content on first/middle/last pages (C4). Never assume CI container host represents production.
6. Verify exact-SHA CI and reviewer/tester sign-off; record negative tests and immutable artifacts. Only then approve the engine swap and separately review the HTTP report-route gate.

## 5. Release boundaries

- Phase 23 OPEN and `503 REPORTS_UNAVAILABLE` unchanged.
- C2 is **not implemented** by this document or any JSON boundary test alone.
- Existing ALT-09 Docker proof is reusable; do not repeat exploratory renderer benchmarking.
- Keep previously validated `C1b4` closure intact. C1c and C1d authorization remain separate gates.
- If OpenCode changes the same branch concurrently, fetch current file SHA immediately before updates and do not overwrite its work.

**Next safe subtask in ChatGPT:** write isolated contract tests for `ReportApiService.run` → model → strict JSON, using synthetic data only. Do not claim green until actual execution/CI evidence exists.

## C2 preparatory contract-test checkpoint (2026-11-06)

Created `server/tests/reportC2PdfHandoffContract.test.ts`: three synthetic-only Node tests cover an authorized `ReportApiService.run` → `buildReportExportModel` → `encodeReportPdfInput` → `decodeReportPdfInput` handoff; absence of internal row IDs or session metadata and literal treatment of hostile-looking strings; employee rejection before fake repository access across the four unapproved book report types; and fail-closed count/envelope/UTF-8 cases. **These tests have been written, not executed in this session.** Execute `npm run test:server`, `npm run lint`, relevant full regressions and CI at the actual HEAD before promoting this checkpoint to VERIFIED; review any failures independently. No renderer or routes changed.
