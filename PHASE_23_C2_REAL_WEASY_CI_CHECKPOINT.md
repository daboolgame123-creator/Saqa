# Phase 23 C2 — real WeasyPrint PDF through authorized service (CI-only)

**Base:** `19c19841768d97840bfb55867347871387bc12da` (stacked PR #29).
**Branch:** `integration/phase23-c2-real-weasy-pdf-ci-20261107`.
**Status:** `CI_TEST_ONLY / UNMERGED / OFFICIAL_REPORTS_503`.

## Analysis before implementation

C2 had a successful authenticated/scope-limited ReportApiService → strict JSON → bounded worker handoff, but the subprocess tests used an intentionally **artificial PDF-looking fixture**. Separate ALT-09 generated genuine PDF inside a restricted Docker container using a fixed escaped RTL WeasyPrint template, without passing through the app's own report authorization, PostgreSQL scope, `buildReportExportModel` and `runInternalPdfWorker` chain.

The gap is **true end-to-end PDF rendering** from real migrated synthetic SQL rows, with a PDF parser confirming document content and pages. This is not equivalent to approving the institution's host.

## Implementation

1. Add `server/tests/p1kWeasyStdinWorker.py` to the existing **CI-only** WeasyPrint Docker image. It asserts a non-root `10001:10001` identity, container `NoNewPrivs`, seccomp filter and zero effective caps, bounded `/tmp` tmpfs, no known sensitive host mounts and nonwritable `/etc`. It accepts at most 512 KB of strict versioned JSON via stdin, invokes the already reviewed escaped Arabic HTML template, disables external fetches and emits bounded PDF bytes on stdout. On failure only a generic error is logged. These are defense-in-depth candidate checks, not independent proof of Docker or host confinement.
2. Use the existing internal `ReportApiService.exportIsolatedPdf` with fixed Docker arguments: no network, read-only root, no input/output host mounts, non-root UID, cap-drop all, no-new-privileges, PIDs/CPU/memory/ulimit limits, 16 MB ephemeral tmpfs and `--rm`. No render flags or paths come from report data. The image uses a **mutable CI tag** and is not production provenance-approved.
3. Real migrated disposable PostgreSQL includes 42 synthetic incoming books, one public, 41 Administrative. The employee PDF must contain ONLY the public marker; admin PDF must show first/middle/last markers over multiple real pages. Use Poppler `pdfinfo`, `pdftotext`, `pdffonts` to parse the actual PDF; check DejaVu font availability, scope, internal ID absence and normal container cleanup.
4. New exact-SHA GitHub Actions workflow builds the **experimental image only** and runs this suite plus existing secure C2, C4 synthetic, Chromium, server, DB and API regressions; verifies HTTP reports still return `503 REPORTS_UNAVAILABLE`.

## Production blockers unchanged

This CI proof cannot approve the final image. Dockerfile uses `python:3.12-slim-bookworm` mutable base, package resolution is not a signed/pinned immutable provenance record, and font license/provenance and target-host sandbox remain outstanding. `--rm` after a normal exit is not guaranteed forced cleanup of an orphaned container after CLI SIGKILL, abrupt host crash, deliberate process/session escape, Docker daemon failure or Windows behavior. Those must be validated with host-specific container lifecycle management and actual target server evidence. PDF font and RTL text require separate human visual/first-middle-last review for production acceptance. No HTTP enabling, no release approval, no baseline merge.
