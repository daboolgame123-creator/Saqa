# Phase 23 C2/C4 — Docker daemon container lifecycle supervisor

**Date:** 2026-11-07. **Parent:** PR #32 \`e0a2585075570948d1ce8aacd6d9706f4cf4c15e\`.
**Branch:** \`integration/phase23-c2-docker-lifecycle-20261107\`.
**State:** \`DRAFT / SYNTHETIC_CI_ONLY / NO_HTTP_ACTIVATION / C4_TARGET_HOST_NO_GO\`.

## Analysis before implementation
The existing \`runInternalPdfWorker\` uses a POSIX process group. It can kill a CLI launcher and its immediate non-detached process descendants but **does not own Docker-daemon-managed containers**. \`docker run --rm\` removes a container after a normal exit but is not independent proof of forced removal after Docker CLI SIGKILL, timeout or cancellation. A stopped CLI may leave an external container with a stale name.

## Changes
- New internal, not-HTTP-wired \`reportDockerPdfWorker.ts\` creates a cryptographically random dedicated container name. It builds *all* Docker invocation arguments itself: \`--pull=never\`, \`-i\`, nonroot, network none, read-only root, no caps, no-new-privileges, bounded PIDs/memory/CPU/tmpfs and file descriptor/output quotas. No report input enters Docker flags, labels, name, image or shell.
- Fixed image must be a repository \`@sha256:<digest>\` or local \`sha256:<id>\` only for the disposable CI candidate. Mutable tags like \`latest\` are rejected. **A local CI image ID does not establish production image provenance**.
- On **success and every rejected execution path after spawn**, supervisor invokes \`docker rm -f <unique-name>\` then \`docker container inspect <unique-name>\`. It only returns valid PDF after confirming **No such object/container**, with bounded command duration, redacted error detail and finite retries. Missing daemon/permission errors do not masquerade as successful cleanup. Calling method with pre-aborted signal rejects before Docker.
- Internal \`ReportApiService.exportManagedDockerPdf\` performs same trusted access + scoped SQL + export-model validation before supervised render. This does not replace existing PDFKit or unshield any official report routes.
- New synthetic tests validate mutable image rejection/pre-cancel and run actual Docker through migrated synthetic PostgreSQL/WeasyPrint, including tests requiring an **actually started** container before abortion, timeout, success, output integrity, all 42 incoming books, 5 circulars and 38 distinct verified ViewLog acknowledgements. CI also checks no labeled Docker container survives normal or failed requests.
- Full GitHub Actions validates TS/build, RTL template safety, C4 synthetic inspect, C2 and service scope tests, Chromium RBAC/archive/503, all server/DB/API tests.

## Limits that remain genuinely external
This supervisor cannot recover from Node process kill, crash of the host/Docker daemon, malicious Docker daemon, remote Docker endpoint, detached privileged processes beyond the container, Windows host quirks or failure of its Docker cleanup command. The production operator **must** supply immutable registry image digest, font provenance/license/hashes, and a host/container watchdog that cleans named/labelled stale workers across application restarts. Actual target-host cgroups/seccomp/LSM/network/mount enforcement, crash-restart negative tests, and human Arabic print sign-off are C4 blockers; CI-only success is insufficient. Docker CLI error text is never exposed to users and no institution datasets are read.

**Never report success or close this checkpoint without exact-SHA CI.** Keep \`REPORTS_UNAVAILABLE\` HTTP 503, all PRs draft/unmerged and release NO-GO.
