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

## C2 isolated implementation checkpoint — 2026-11-06 (parallel to OpenCode)

**Isolation:** Work is committed exclusively on `development/phase-23-c2-worker-isolated-20261106`, created from the GitHub development branch while OpenCode verifies the main Phase 23 branch. **Do not cherry-pick/merge it during an in-progress exact-SHA verification.**

**Implemented (internal, UNWIRED):**
- `server/src/api/services/reportPdfWorker.ts`: server-owned executable/argv contract; data-only `encodeReportPdfInput(model)` before child creation; `spawn(..., {shell:false, stdio: pipe, env:{}})` with fixed time/output/error caps; process timeout termination; no exposure of stderr or partial PDF on child failure; PDF header/version + EOF tail + byte budget preflight. No filesystem output, no arbitrary template, URL or HTML worker arguments, no new HTTP path. All renderer commands **must** be reviewed deployer-owned fixed config; this library alone does NOT impose Docker/seccomp/network isolation.
- `server/tests/reportC2PdfWorker.test.ts`: five synthetic child-process test groups: accepted bounded transport fixture, bad/empty/truncated/overlong bytes, nonzero/missing executable, timeout/stderr overrun, invalid configuration. Synthetic fixture is not a valid fully parsed/rendered PDF and does not establish Arabic layout.

**Remaining before merge/release:** (1) execute TypeScript and tests in clean suitable environment on exact branch SHA; (2) independently review Windows/Linux child behavior and stream/termination failure cases; (3) select immutable Docker image and enforce no-network, read-only, no privileges, seccomp, UID, bounded mount/IO etc; (4) integrate only behind internal policy gate after security review and prove authorized `ReportApiService.run` to worker on migrated synthetic data; (5) production host C4 provenance/Arabic rendering proof. Existing PDFKit path and `HTTP 503 REPORTS_UNAVAILABLE` are unchanged. **No production approval or CI result claimed.**

## C2-S2: executable/argument validation — analysis before implementation

Static review found a mismatch between the launcher contract and implementation: `InternalPdfWorkerConfig.executable` was documented as an absolute, deployment-owned executable, yet `checkedConfig` accepted relative names; `args` had per-string length caps but no item-count cap. This is not an active HTTP vulnerability because the worker remains UNWIRED; nevertheless, leaving the contract unverifiable would complicate host approval.

Planned fix: require `path.isAbsolute(executable)`, bound executable length, bound argument count and reject embedded NUL in executable/arguments; do not attempt to inspect or validate Docker isolation flags in a generic process launcher. Use an absolute nonexistent path to exercise process-start failure rather than a relative string that should now fail configuration validation. Add unit tests for invalid relative executable, NUL, excessive args, and good explicit absolute Node child. This does not establish image provenance or container lifecycle cleanup, both remain C4 blockers.

## C2-S2 source checkpoint — fixed executable/argv constraints (2026-11-06)

- Strengthened `server/src/api/services/reportPdfWorker.ts` so the internal launcher requires `isAbsolute(executable)`, rejects NUL and oversized executable paths, caps argv at 64 values, and rejects NUL/oversized arguments. This matches the existing server-owned configuration contract; the process is still NOT callable from report routes.
- Extended `server/tests/reportC2PdfWorker.test.ts`: an absolute nonexistent binary exercises spawn error behavior; a sixth test checks relative executables, embedded NUL and oversized argv are rejected. No test execution/CI has been established for this branch.
- **C4 hard blocker:** `child.kill('SIGKILL')` terminates the local launcher process, **not necessarily a container workload it may have started**. The eventual container runtime integration needs a host-specific mechanism to prove that timeouts, crashes, client disconnects and concurrency bounds leave no orphaned worker/container. Must check container IDs, process trees, temporary resources and enforced cgroup limits under test. Do not infer container cleanup from this generic Node launcher.
- Do not merge this branch during OpenCode's exact-SHA test. Once main-branch tests finish, review the isolated diff, then run full lint/server/DB/API/build on the selected merge SHA. Existing PDFKit and HTTP 503 remain unchanged.

## C2-S3 independent verification lane — 2026-11-06

Created an isolated GitHub Actions workflow `.github/workflows/phase23-c2-worker.yml` on branch `development/phase-23-c2-worker-isolated-20261106`. It is scoped to push changes on that branch (and matching pull requests), and performs `npm ci`, `npm run lint`, the two C2 worker/JSON handoff unit suites and `npm run build` on Node 22 Ubuntu. It does not modify the main development branch or report HTTP permissions.

**Evidence check:** Re-fetched isolated branch HEAD `3723105ad235ab85088baad49cb2f85604184303`. GitHub commit-status lookup returned zero individual statuses, and the connected workflow lookup returned zero PR-triggered runs; the latter does not enumerate ordinary push-triggered runs. **No successful CI run was observed or asserted.** The job may be pending/not surfaced by the connected API; externally verify the actual GitHub Actions page and full job logs before treating this source as tested.

**Next gate:** obtain exact-SHA TypeScript and worker test results; correct failures on this isolated branch only. Do not merge into the OpenCode verification branch while its SHA is being tested, and do not activate C2/PDF, remove HTTP 503 or sign off container/host isolation (C4).
