# Phase 23 — C4/S2 Docker crash-recovery CI checkpoint (2026-11-07)

**Classification:** INTERNAL SYNTHETIC CI PROOF / TARGET HOST EXTERNAL.  
**Base:** PR #33 at \`e069cc748e58db7fe23555ab414993e5b14d03d9\`.  
**Branch:** \`integration/phase23-c4-crash-recovery-ci-20261107\`.  
**Approval:** \`RELEASE_NO_GO\`; HTTP \`503 REPORTS_UNAVAILABLE\` remains; no merge/activation is authorized.

## Analyze → plan → implement

**Gap:** PR #33 independently verifies \`docker rm -f\` and \`docker container inspect\` in its Node supervisor's normal resolution, cancellation and timeout paths. \`SIGKILL\` or an abrupt crash bypasses that Node process's cleanup path. Docker daemon ownership survives process lifetime in some conditions; \`--rm\` alone does not provide a host-level orphan-recovery guarantee.

**Minimal CI checkpoint:** Start a uniquely named, test-labelled, no-network, non-root, read-only, resource-bounded Python sleeper using the *already built CI-only* C2 Docker image. Kill its separate Node supervisor with \`SIGKILL\` only **after** proving the daemon container is running. Prove the container is still running after the supervisor dies. Independently discover it using **both exact synthetic labels**, verify its nonce name/labels, force-remove it, and prove absence. If the orphan never exists, fail the test: this is not a valid recovery demonstration.

The new test is \`server/tests/integration/reportC4CrashRecovery.integration.mjs\`, wired into the C2 real-Docker GitHub workflow on the C4 branch. No report payload, personnel data, production Docker image or institutional machine is accessed. Production C2 worker code, report access policies and official routes remain unchanged.

**Acceptance:** Exact C4 head SHA must show completed **SUCCESS** with the named C4 test passing, and all previous C2 workflow steps still passing. Before that, status is \`PENDING_CI\`. This is evidence of the possibility of an *independent* reaper on GitHub's disposable Linux runner, not implementation or approval of a production watchdog.

## What still requires the institution's host (RELEASE NO-GO)

1. Implement and register a **separate host-owned watchdog** (for example a systemd service/timer), not a Node shutdown hook. It must survive/restart independently of the ALSQAYA application.
2. Match **only** the final review-approved \`alsqaya.c2.managed=true\` label plus the strict \`alsqaya-c2-<24 hex>\` production naming convention, deployed image identity and approved local Docker endpoint. Avoid \`docker system prune\`, wildcard deletion and untrusted report input. The CI-only \`alsqaya.c4.crash-ci=true\` label and names must never be part of a production cleanup rule.
3. Apply a conservative stale-worker age **greater than maximum legitimate execution plus cleanup grace** (start with an assessed policy rather than an arbitrary hard-coded age), ensure only one reaper instance runs, and audit its decisions and Docker errors. Avoid killing a live and valid export. Fail closed / alert on daemon unavailability and ambiguous inspect fields.
4. Restrict watchdog access: the Docker socket grants powerful host privileges. Use a host administrator-approved service account and socket access design, record sanitized logs, do not put any report bytes, environment secrets or raw inspect output into public CI.
5. Verify startup, scheduled recovery and crash/reboot/daemon-restart negative cases on the actual host using synthetic data, including an intentionally stale C2 production-shaped test container. Capture the before/after names, timestamps and Docker inspect evidence privately, with security review of the sanitized summary.
6. Approve exact immutable **registry image digest**, pinned package supply chain, final Arabic font/license/hash, target-host cgroups/seccomp/LSM and the Arabic visual print sample separately. A local CI \`sha256:<image-id>\` does **not** satisfy provenance.

## Release closure still blocked

- Independent role and source/filter/Excel/PDF equality review; unresolved source definitions must stay explicitly unavailable.
- Human PDF acceptance and host-specific defense-in-depth.
- Reviewed PR dependency chain, rollback and final exact-SHA CI.
- No removal of \`503 REPORTS_UNAVAILABLE\` or PR merge without explicit owner approval.

**Evidence to complete after CI:** actual C4 commit SHA, run ID, conclusion and C4 step result. No claim of passing test before GitHub reports a completed matching run.

## C4/S2 additional static acceptance alignment

**Found during same-SHA source review:** the older offline C4 inspector required both `/tmp` and `/output` tmpfs, but the actual C2 managed worker has a single restricted `/tmp` tmpfs (16 MiB) and sends PDFs on stdout. On a real C2 worker, the old checker would reject the correct container for a **checker/launcher contract mismatch**, not because the worker failed its own runtime flags.

Updated the independent C4 inspector's synthetic policy to require **exactly** `/tmp`, maximum 16 MiB, `rw,nosuid,nodev,mode=1777`, and to reject unexpected `/output` or other tmpfs paths. Its synthetic allow/deny fixtures now match that actual C2 stdout-only handoff. This narrows the checker, does not grant runtime permission, and must pass the C4 static tests on the final SHA. The production immutable registry digest and actual target-host Docker inspect remain external/NO-GO.
