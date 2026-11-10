# Phase 23 C2 — POSIX process tree cleanup checkpoint

**Base:** `e8fedfdde736b76279369d39bfa8bbdc8409c1bf` (PR #28, internal-only C2 handoff).
**Branch:** `integration/phase23-c2-process-tree-20261107`.
**Policy:** No HTTP activation, baseline merge, real institutional data or production container assumptions.

## Analyze before change
The C2 worker launcher previously invoked `child.kill('SIGKILL')` on error/timeout/cancellation. Killing the **immediate child process** is not proof that its non-detached descendants have stopped. A worker wrapper may create nested processes. An orphan could keep consuming host resources even though the caller already received an error or a synthetic PDF-looking result.

## Implement
On POSIX only, launch each worker with `detached: true` to give its launcher a **private process group** and use `process.kill(-pid, 'SIGKILL')` to terminate the whole dedicated process group. If group signalling is unavailable, fall back to direct child kill. Terminate leftovers also when the immediate launcher exits successfully. Existing admission limit, strict JSON stdin contract, finite timeout, output limits, stderr redaction and per-child close accounting remain unchanged. Windows retains direct child termination and requires host-specific worker tree controls.

## Test strategy
- Existing worker timeout, abort, oversized output, invalid process, strict input and saturation tests must keep passing.
- New POSIX-only integration regression starts a synthetic Node launcher which starts a non-detached grandchild writing a heartbeat to an owned temporary file with stdio ignored. On **cancellation** and **normal launcher exit**, the grandchild must stop producing heartbeat data. The test has an emergency cleanup path even if implementation regresses.
- Exact-SHA workflow executes focused C2 and C4 synthetic tests, authenticated migrated PostgreSQL service-worker handoff, Chromium archive/pilot UAT, full TypeScript/build and server/DB/API tests; it preserves the `503 REPORTS_UNAVAILABLE` gate.
- No test uses production documents, real institution network, Docker or PDF fonts.

## Strict limitations
This improves **local POSIX process-group** teardown only; it is **not** enough to guarantee cleanup of Docker containers, descendants that call `setsid`/detach into another group, remote renderers, Windows processes or hostile runtime escapes. C4 target-host image digest, effective cgroups/seccomp/LSM, no network, worker UID, mount isolation, font licenses, container IDs, timeouts and real Arabic PDF fidelity all require real independently captured evidence before release.

**Release status:** `INTERNAL_ONLY / DRAFT / C4 HOST NO-GO`. Do not remove HTTP 503, approve a production PDF renderer or merge into the institutional baseline.
