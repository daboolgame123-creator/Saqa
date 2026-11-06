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

## C2-S4 planned boundary proof — stdin-only and empty environment

Before another implementation change, add a synthetic child-process regression to prove the launcher:
1. hands the strict versioned report JSON through child `stdin` (not CLI argv);
2. does not inherit a deliberately planted environment secret; and
3. treats HTML/URL-like content as literal JSON data that the child can parse, without interpreting it.

Use Node as the local test executable only; no actual HTML/PDF rendering, network, Docker, institutional records or service integration. The worker remains UNWIRED. This is a transport/test checkpoint and cannot replace actual C4 sandbox approval.

## C2-S4 completed source test — 2026-11-06

Added one synthetic Node-child regression to `server/tests/reportC2PdfWorker.test.ts`: the child reads the exact versioned report JSON from stdin, checks a secret synthetic marker and a literal file-URL-looking title cell, verifies the secret marker is absent from `process.argv`, and verifies that a deliberately set parent-only environment variable is absent from the child. The test restores the original parent environment in `finally`. No real files, sockets, renderer, institution secrets or HTTP routes are used.

**Narrow execution evidence:** A manually reproduced standalone Node `spawnSync` experiment in the analysis container executed the generated child-script logic once with synthetic input; `status=0`, expected stdout matched, stderr empty. **This did not import or run the GitHub TypeScript test or app launcher**, so it is not a passing C2 test/CI claim. The exact branch needs `npm ci`, `npm run lint`, and `node --import tsx --test server/tests/reportC2PdfWorker.test.ts server/tests/reportC2PdfHandoffContract.test.ts` on CI or OpenCode, with SHA recorded. Keep C2 unmerged and the HTTP 503 guard unchanged.

## C2-S5 analysis — bound concurrency before production coupling (2026-11-06)

The internal launcher currently bounds duration and output **per child**, but does not bound the total number of concurrent child processes. This is a real resource-exhaustion possibility if ever connected to the export service. Introduce a conservative process-global **two in-flight workers** limit (not configurable by requests) and fail closed immediately on a third attempt. Crucially, a timeout or stream error must NOT free capacity until the child's `close` event confirms process termination; a synchronous spawn exception must free its reserved slot. Add a synthetic regression where two children deliberately remain alive awaiting stdin end plus a time hold, a third is rejected, and capacity is restored after both complete. This is local-node-only protection; deployments with multiple processes require host-level limits in C4.

## C2-S5 implementation checkpoint — 2026-11-06

- Implemented conservative, module-local limit of **2 simultaneous child processes** in `reportPdfWorker.ts`; third parallel report fails with `REPORT_PDF_WORKER_UNAVAILABLE` rather than starting another worker or queuing unlimited input.
- Reserved slots are released on the child's **`close` event**, even if its promise was already rejected due to timeout, stderr overrun or other stream error. If `spawn` throws synchronously, its reserved slot is released immediately. This favors fail-closed availability over potentially permitting orphaned concurrent processes.
- Added a synthetic concurrency test in `reportC2PdfWorker.test.ts` that starts two delayed child processes, verifies a third is refused, then verifies a new job is admitted after both children close. **Committed, not run against repository toolchain/CI**.
- Remaining C4 requirement: module-local admission control does NOT limit total processes across a cluster or ensure container descendant cleanup. Enforce per-host cgroups/container concurrency and prove no orphans at the approved deployment host. Keep C2 unmerged, PDFKit unchanged and HTTP 503 active.

## C2-S6 analysis before patch — admission order + synchronous stdin failures

Audit of the unconnected worker launcher identified two bounded failure-path improvements: (a) the JSON input was encoded *before* checking the two-worker admission limit, wasting up to the input byte budget on a rejected third request; (b) `child.stdin.end(input)` had no synchronous exception guard, so an immediate stream throw could escape the Promise executor without requesting worker termination, while the capacity slot remained occupied until close. Implement admission check before input encoding (but do not increment slots until encoding succeeds) and catch `end` throws through the existing fail-closed `stop` pathway. Test that a rejected third request with malformed input is rejected for capacity before any encoding and that invalid data does not consume a slot when capacity is available. No HTTP or Docker integration.

## C2-S6 implementation checkpoint — 2026-11-06

- `runInternalPdfWorker` now checks the two-worker capacity limit **before** encoding the report JSON, avoiding needless serialization of denied third jobs. Encoding still completes before claiming a process slot, so malformed input does not leak capacity.
- `child.stdin.end(input)` is now protected by a synchronous `try/catch` that terminates the child and rejects through the same fail-closed error channel; the slot remains reserved until `close`.
- Added an eighth synthetic worker test: two delayed accepted workers saturate the limit; a deliberately invalid unpaired-surrogate payload receives the concurrency denial first; once both workers exit the invalid payload fails as `ReportPdfInputError`, and a valid worker can start. **Code committed; repo TypeScript/CI tests not executed here.**
- The child launcher is still **UNWIRED** and **not a substitute for C4 container isolation**. Review and run at exact SHA before merge. Keep `HTTP 503 REPORTS_UNAVAILABLE`, existing PDFKit, and the OpenCode target branch unchanged.

## C2-S7 fix: remove false-positive stdin-only evidence — 2026-11-06

Code audit found a **test bug** in `reportC2PdfWorker.test.ts`: the synthetic secret literal was embedded into the inline `node -e` child script. Inspecting `process.argv` alone would not detect that leak because Node stores eval code in `process.execArgv`. Fixed the test to compare the title against a second value parsed **from stdin**, without placing the title literal into the script; require the child to check both `process.argv` and `process.execArgv`; add an explicit parent assertion that `childCode` does not contain the marker. The environment inheritance check remains unchanged.

A focused standalone Node 22 `spawnSync` rehearsal of the corrected synthetic child program was **actually run** in the analysis container: status 0, empty stderr, expected PDF-fixture stdout, and no marker in child script. This establishes only the child-test script's syntactic/behavioral validity, **not** the repository's TypeScript tests, launcher code, sandboxing or CI. The fix was committed to the isolated branch; branch remains UNWIRED, HTTP 503 unchanged, external exact-SHA CI and C4 still required.

## C2-S8 analysis — bounded internal cancellation (2026-11-06)

The currently unconnected worker handles timeout/stream failure but cannot be cancelled by its trusted caller. A future disconnected request could leave work running until the full timeout. Add an **optional internal AbortSignal**, NOT a request-derived command or renderer argument: abort-before-start must fail before input encoding and slot reservation; abort during execution must request child termination and fail closed. Remove the abort event listener on process `close` to avoid retention and preserve the capacity slot until `close`. Cancellation does not substitute for container-child lifecycle cleanup in C4. Add tests for preaborted signal, abort during a delayed child, and subsequent admission.

## C2-S8 implementation — cancellable worker (2026-11-06)

- Added optional trusted `AbortSignal` to `runInternalPdfWorker(model, config, signal?)`. A signal already aborted before launch is rejected before model encoding, process spawn or slot reservation; after launch an abort requests immediate termination and returns the established `REPORT_PDF_WORKER_UNAVAILABLE` error, without exposing partial bytes.
- The slot remains reserved until the child `close` event (existing C2-S5 invariant), and the abort listener is removed on `close` to avoid lingering references.
- Added one synthetic test group to `server/tests/reportC2PdfWorker.test.ts` covering pre-cancelled and immediately cancelled running operations, followed by a new successful operation.
- **No test run/CI evidence has been obtained for this exact SHA**. These changes remain on the isolated C2 branch, not merged into the development branch. A signal is not wired to HTTP or service callers, so this is preparatory safety/availability code only. Production container teardown, quotas and Arabic output still require C4 approval.

## C2 draft PR / external validation gate — 2026-11-06

Opened **Draft PR #2**: https://github.com/daboolgame123-creator/Saqa/pull/2 from `development/phase-23-c2-worker-isolated-20261106` into `development/phase-23-wip-20261105`. GitHub confirmed `draft: true`, `merged: false`, and the base branch remained unchanged. The PR explicitly prohibits merging until exact-SHA CI and independent security/host review. **Opening a draft is not approving or merging a change.**

The GitHub connector's available commit workflow lookup returned an empty set immediately after opening the PR; this endpoint is limited to PR-triggered runs and is not evidence of a passing or failing job. Combined classic commit statuses were also empty. Record eventual run/job IDs, actual head SHA and test results before any acceptance claim. Changes to this document do not implement or activate PDF rendering.

## C2-S9 analysis — whole-application CI acceptance on isolated branch (2026-11-06)

The focused CI was **actually verified**: workflow run `42291900747`, job `128147162882`, PR head `230805e3464247c4962790425728697741d6d1a3` succeeded with locked npm install, TypeScript, C2 worker/JSON tests and Vite build. It is **not** a whole-application regression: the existing C2 workflow has no `test:server`, `test:db` or `test:api` run. The repository already provides these scripts and synthetic embedded PostgreSQL fixtures; only a CI runner is required, no institution data or deployed server.

**Plan:** Add a second, independent `full-regression` job to the C2-only workflow. Use Node 22 Ubuntu, `CI=true`, locked `npm ci`; run all three suites in order, fail fast on errors, keep logs/job identity. Maintain the already-working focused worker job unchanged. Permit a 30-minute bounded job for the synthetic DB suites. **Do not merge PR #2** on CI success alone: Docker C4, production Arabic PDF and final Phase 23 security acceptance are separately blocked. The workflow change will create a new HEAD and require new exact-SHA verification.
