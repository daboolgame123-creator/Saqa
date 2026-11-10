# Phase 23 / P1k — Practical PDF-renderer solutions and decision gates

Date: 2026-11-06  
State: **Research and experimental verification only — NOT production-approved**  
Relates to: [sandbox closure plan](PHASE_23_P1K_SANDBOX_CLOSURE_PLAN.md), [security review](PHASE_23_P1K_CHROMIUM_SECURITY_REVIEW.md)

## Established facts, not assumptions

- Chromium prints correct-looking synthetic Arabic RTL PDF reports inside a constrained Docker container under a **CI-only** `--no-sandbox` override, with 85 detail identifiers and 38 acknowledgement identifiers verified in text extraction.
- Native Chromium sandbox in the **current GitHub Ubuntu CI environment** fails with `No usable sandbox!`. An independent `unshare --user --map-root-user` probe is denied. Host evidence: `docker-default (enforce)` and AppArmor unprivileged namespace restriction `1`.
- We have **not** identified which policy layer individually causes the denial, and have **not** examined the institution's deployment host. The browser image's CI digest is reproducible, but not security-approved.

## Solution A — hardened Chromium executor (preferred if operationally approved)

**Architecture:** Authorized report model -> escaped self-contained offline HTML -> job queue with timeout/size limits -> dedicated unprivileged rendering process inside a strictly bounded, network-disconnected isolation boundary -> validated PDF -> authorized response.

1. Host administrator records actual Linux distribution, AppArmor rules, Docker/runtime version, default seccomp, kernel userns policy and available isolation controls.
2. On a **separate synthetic-only test host**, security reviewer assesses a narrow Chromium-compatible seccomp/AppArmor policy. Official Playwright guidance describes adding `clone`, `setns`, `unshare` permissions to a default seccomp profile for sandboxed browsing. The reviewer must evaluate syscall scope, effective AppArmor profile and kernel exposure before adoption; no blanket `seccomp=unconfined`, global AppArmor disablement or privileged container.
3. Only accept a candidate that independently proves (i) actual userns creation as an unprivileged user, (ii) successful Chromium rendering **without** `--no-sandbox`, (iii) default-deny egress, (iv) read-only root and approved input, (v) isolated capped output, (vi) zero unnecessary capabilities, (vii) process/time/memory/disk limits.
4. Review and pin the browser/OS image digest and provenance, fonts and licenses, vulnerability updates. Design a truly isolated executor interface rather than calling an arbitrary executable from the application process.
5. Repeat Arabic record-continuity tests, mixed-script visual tests and failure injection. Security review is required before any HTTP feature flag change.

**Blocker:** Cannot certify this option solely on GitHub-hosted runner. A functioning, reviewed host-specific sandbox must be demonstrated.

Official references:
- https://playwright.dev/docs/docker
- https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
- https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/
- https://docs.docker.com/engine/security/seccomp/

## Solution B — browser-free renderer (contingency, not an automatic drop-in)

Evaluate a dedicated Arabic-capable text shaping/layout pipeline using **Pango/HarfBuzz + Cairo PDF** or another maintained library with measured Arabic joining, bidi runs, line wrapping, searchable Unicode extraction, page breaks and licensed fonts. An offline unprivileged container is still required, but the Chromium-specific native sandbox dependency disappears. This is a **separate prototype with its own security and quality review**, not a claim that a PDF library is inherently secure.

**Do not switch blindly to WeasyPrint:** its published feature reference still lists right-to-left / bidirectional text as unsupported; a 2026 issue reports malformed ToUnicode extraction for some real Arabic text. A synthetic Arabic appearance-only test is not enough for searchable institutional records. Investigate a candidate only if extracted text and images meet explicit Arabic acceptance criteria.

Official issue and documentation references:
- https://doc.courtbouillon.org/weasyprint/latest/api_reference.html
- https://github.com/Kozea/WeasyPrint/issues/2841

## Solution C — preserve existing PDFKit export while approval is pending

The existing PDFKit exporter remains unchanged and **the report HTTP routes remain 503**. It is not a substitute for proving acceptable Arabic RTL typography; do not quietly enable PDFKit or browser output as a fallback.

## Work started now — P1k-S5: untrusted output hardening

The experimental internal-only Node.js renderer has been modified to:
- Open PDF output with Linux `O_NOFOLLOW`, refusing symlink targets.
- Require a **regular file**, check its size before allocation, then read exactly its expected size, accounting for partial `FileHandle.read` calls.
- Reject files changing size during read, oversized output and obvious header-valid but EOF-missing partial files.
- Keep the browser process-limit/cleanup/timeout guards and avoid altering HTTP routing or role permissions.

Added negative regression tests: malicious symlink replacing the PDF output, and a PDF-like file containing a header but no EOF trailer. **Verified:** GitHub Actions [42117133717](https://github.com/daboolgame123-creator/Saqa/actions/runs/42117133717) for commit `c4289636` completed **SUCCESS** with zero failed steps, including the new symlink/truncated-file tests, real Chromium smoke test, TypeScript/build, isolated database tests, container Arabic PDF continuity, and HTTP 503 checks. The first run `42116815957` failed only because an old missing-file assertion still expected the raw `ENOENT` message; commit `c4289636` updated it to the deliberate fail-closed `PDF browser output not readable` error.

Limits: a header/trailer check is **not** a full PDF parser, does not prevent generation-time disk exhaustion, does not replace browser isolation or globally bound concurrency, and does not authorize production release.

## Next acceptance order

1. Finish CI regressions for output hardening and record exact run.
2. Add bounded generation-time output filesystem quotas, failure/cleanup and malformed PDF probes without changing the live API.
3. Receive host OS and isolation policy facts, then run a reviewed Solution A test or explicitly decide to prototype Solution B.
4. Require S1–S7 approvals from the closure plan before any Phase 23 release; Phase 22 OCR remains separate.

**Release control:** P1k OPEN. No change to `main`, no production security exception, no report HTTP enablement.
