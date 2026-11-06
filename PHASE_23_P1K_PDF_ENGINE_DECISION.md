# ALSQAYA Phase 23 / P1k — PDF engine decision study (2026-11-06)

Status: **PLAN / EXPERIMENTAL; NO PRODUCTION CHANGE**.

## Objective
Choose the simplest defensible Arabic PDF renderer, without enabling the report HTTP endpoints or weakening host security. The existing Chromium test is a reference baseline; its native sandbox fails on current CI (exit 133). Existing PDFKit export also remains a baseline.

## Primary-source research
- Playwright Docker: https://playwright.dev/docs/docker — separate non-root user and a reviewed seccomp profile that permits namespace creation; its published image is primarily a development/test image, not production approval.
- Chromium Ubuntu AppArmor userns: https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
- Ubuntu 24.04 release notes: https://documentation.ubuntu.com/release-notes/24.04/ — restricted unprivileged user namespaces; per-binary AppArmor policy is preferable to disabling host-wide restrictions.
- Docker seccomp: https://docs.docker.com/engine/security/seccomp/ — retain a reviewed restrictive policy, never use unconfined or SYS_ADMIN merely to pass a probe.
- WeasyPrint documentation: https://doc.courtbouillon.org/weasyprint/stable/ — HTML/CSS to PDF, font rendering via Pango/HarfBuzz, no Chromium browser process. Does not mean zero parsing/security risk.

## Candidates and tradeoffs

| Engine | Advantages | Risks / required proof |
|---|---|---|
| Chromium in reviewed sandbox | Already proved synthetic Arabic PDF continuity (85/38), familiar HTML/CSS print | Native sandbox blocked on CI; production browser isolation and updates require review |
| WeasyPrint in isolated worker | No full browser runtime; mature paged-print engine, Pango/HarfBuzz font handling | Separate Python runtime; URL fetcher must forbid network/local file access; Arabic BiDi, long tables, page breaks, fonts and extraction need tests |
| Existing PDFKit | Already integrated in Node; no browser process | Current Arabic visual/BiDi correctness must be compared; layout features differ |

## Decision criteria (must be verified, not assumed)
1. Arabic shaping, mixed Arabic/Latin numbers/dates, copy/search text and logical record order.
2. Complete 85 detail and 38 acknowledgement synthetic records, no duplicates or omissions, bounded page count and visual page-break review.
3. No remote fetches or arbitrary local file reads, restricted fonts and input; process isolation, no writable host mount, time/CPU/memory/PID/output quotas and crash cleanup.
4. Maintain trusted server-side access scoping, fixed template, output size limit and unchanged HTTP 503 gate.
5. Font license, runtime update policy, deployment host feasibility and independent security approval.

## Planned experiment — P1k-ALT-01
**Before implementation:** create a CI-only WeasyPrint probe with pinned package version, synthetic existing HTML fixtures, a URL fetcher that rejects external/local resource access, bounded output and an explicit artifact for extraction/visual comparison. This is not a production dependency or report endpoint. Fail closed if dependency installation or rendering is unavailable; never silently pass. Compare results to the existing Chromium proof. If successful, proceed to a separate production-executor design; otherwise keep Chromium sandbox investigation open.

## Release decision
No renderer is production approved. Do not disable host AppArmor restrictions, grant SYS_ADMIN, enable seccomp=unconfined or expose the report routes. Explicit sign-off and real target-host verification remain required.

## ALT-01 execution and measured result — 2026-11-06

The research and plan above were committed **before implementation** as `aa92a0d9`. The synthetic-only WeasyPrint pilot was added in `c5c2b8e6`, wired into CI in `618b0cd4`, and its fixture-ordering issue corrected in `bb8e7b08`. The first workflow `42134295022` **failed** because the synthetic HTML files were generated later in the pipeline; this was a test setup error, not a PDF rendering defect. The corrected workflow [42134455934](https://github.com/daboolgame123-creator/Saqa/actions/runs/42134455934) **completed SUCCESS**.

**Observed proof from the passing CI job logs:**
- `P1K_WEASYPRINT_CONTINUITY_PASS kind=details records=85 bytes=43814`
- `P1K_WEASYPRINT_CONTINUITY_PASS kind=ack records=38 bytes=22821`

Both PDFs were generated from the same existing synthetic Arabic HTML fixtures as Chromium, and `pdftotext` recovered all numbered records in order with ISO timestamps. WeasyPrint was installed in CI as version `66.0` (not added as a production application dependency). Its URL fetcher rejects all external resources, and PDFs are bounded to 12,000,000 bytes. The existing Chromium and report security workflow tests remained green.

**Decision:** WeasyPrint is a **viable candidate** and warrants a second-stage comparison of visual Arabic shaping, line wraps, pagination, font licenses, dependency supply chain, and isolation under adversarial inputs. This proof does **not** establish comprehensive absence of filesystem access, a complete sandbox, or safe production deployment. Do not replace Chromium or PDFKit yet. Prefer a dedicated isolated WeasyPrint worker if later security and quality checks pass. Keep the Chromium-native sandbox issue recorded as unresolved rather than weakening the host. Reports remain HTTP 503.

**Next plan-first checkpoint:** visual side-by-side PDF review and strict offline/denied-resource test cases for WeasyPrint, then a threat-modelled executor and bounded subprocess with no sensitive mounts. No institutional documents in tests.

## ALT-02 plan — denied-resource regression (2026-11-06)

**Scope before implementation:** Extend only the CI-only WeasyPrint probe `server/tests/p1kWeasyPrintAlternative.py` with deterministic negative fixtures; no changes to report routes, templates, Chromium, PDFKit, application dependencies, authorization, or deployment configuration.

1. Exercise a temporary synthetic local `file://` secret and a loopback `http://127.0.0.1` URL through CSS/HTML resource resolution. Use the same explicit rejecting URL fetcher as ALT-01 and verify that every configured denial is actually invoked (avoid passing simply because no resource was requested).
2. Verify rendered test PDF is structurally recognizable and does not contain synthetic sentinel text; preserve the existing 85/38 order checks.
3. Run available local syntax and functional checks, then confirm the existing CI job executes the new negative probe and succeeds. Inspect exact logs; document failures and fixes.
4. Report the narrow result truthfully: interception of WeasyPrint URL fetches is not proof of complete OS sandboxing, filesystem syscall denial, blocked network sockets, or production readiness. Memory/CPU/time/total disk caps, full visual comparison, dependency security and institutional host remain future gates.

**Acceptance:** test explicitly observes both denied fetch attempts, no sentinel disclosure and no regression in previous synthetic continuity, with passing relevant CI evidence. If CI fails or logs cannot be checked, mark ALT-02 pending rather than complete. **Release gate unchanged:** HTTP 503.

## ALT-02 implementation checkpoint — 2026-11-06

- Plan-first commit: `3c729f825a65f1ed1314ea07b5c702eadfc3886d`.
- Negative-probe source commit: `beff981ebfaf6dcccdc1b11b383467a0e52da418`.
- Added **CI-only** assertions to `server/tests/p1kWeasyPrintAlternative.py` for a synthetic local `file://` resource and `http://127.0.0.1:9` CSS resource. Both must actually reach the rejecting fetcher, and extracted PDF text must not reveal the synthetic sentinel. Existing 85/38 continuity assertions remain unchanged.
- A functionally equivalent negative fixture passed local `python -m py_compile` and execution with **WeasyPrint 68.0** and `pdftotext`, printing `P1K_WEASYPRINT_ALT02_DENIAL_PASS local_file=denied loopback_http=denied callbacks=2`. This is **not** a run of the exact repository file or a version-matched CI test (CI baseline used WeasyPrint 66.0).
- **CI verification: PENDING.** The GitHub connector did not expose a new push-triggered workflow run for this commit; the last verified green workflow remains `42134455934`, which predates ALT-02. Do not call ALT-02 closed until its exact source commit has a verified green CI job and logs containing its denial marker. Preserve failure evidence and fix/retest if it fails.
- **Security scope of proof:** This validates callback rejection for two requested URL schemes and absence of the one synthetic sentinel in PDF output. It does NOT prove OS-level file/network isolation, no raw socket access, memory/time/CPU/disk enforcement, supply-chain safety, or visual Arabic correctness.
- **Unchanged:** existing renderer integrations, Chromium, PDFKit, HTTP `503 REPORTS_UNAVAILABLE`, and production authorization. Next checkpoints: CI evidence for ALT-02, then a separately planned visual comparison and isolated-worker threat model.

## ALT-03A plan — reproducible paired visual evidence (2026-11-06)

**Scope:** CI-only evidence generator. Produce comparable raster PNGs and PDF metadata from already-generated WeasyPrint and Chromium synthetic fixtures, without changing either renderer. This checkpoint is **evidence preparation**, not final human visual sign-off.

1. After the existing Chromium offline print step, assert all four expected PDFs exist, parse bounded page counts using `pdfinfo`, and rasterize the first and last pages at the **same fixed resolution** via `pdftoppm`.
2. Write a machine-readable manifest containing engine, fixture type, page count, PDF byte size, PDF SHA-256 and raster file names. Require nonempty outputs and fail closed on missing commands, outputs, or malformed page counts.
3. Retain output inside the already-archived synthetic preview directory. Inspect relevant CI job steps, logs and produced artifact. If unavailable, report **pending**, not visual success.
4. A subsequent independently reviewed checkpoint must inspect the PNGs side by side and evaluate Arabic glyph joining, whitespace, mixed-direction tokens, truncation and page boundaries; first/last-page sampling is **not** enough to approve all pages.
5. Protected boundaries: no production exporter, routes, permissions, sensitive data, app dependencies or security configuration changes; HTTP 503 unchanged.

**Acceptance for ALT-03A only:** CI log and artifact establish paired, valid, readable comparison evidence for both detail (85) and acknowledgement (38) fixtures on the same source revision. **No claim** about actual visual quality without inspecting the images.

## ALT-03A source checkpoint — 2026-11-06

- Plan-first commit: `e853b35fe065f8fce6cafe970afc560f5f499aa6`.
- New CI-only evidence script: `348520d5146ec697e0e74e33f22f005bfa9057aa`, `server/tests/p1kPairedPdfVisualEvidence.py`.
- Workflow wiring: `b87437527ba0af66990e268544cc33de0650e0da` places the paired-evidence collection step **after both engines have printed** and before the existing archive upload. It leaves the original workflow trigger, prior tests, PDF renderers and report HTTP security boundary unchanged.
- Expected output: four validated synthetic PDFs (detail and acknowledgements for WeasyPrint and Chromium), eight first/last-page raster PNGs at 110 DPI and a JSON metadata manifest (pages, size, hashes, filenames).
- Source-branch verification: the remote named development branch matched `b87437527ba0af66990e268544cc33de0650e0da` at inspection time.
- **Execution status: PENDING.** No new push-triggered CI run or artifact has been directly verified using the available GitHub connector. Its commit-workflow query covers PR runs and returned none; the combined-status query likewise returned no statuses. These empty responses are **not evidence of a passing or failing workflow**. No new images were inspected or visually approved in this checkpoint.
- Before closing ALT-03A, inspect the actual workflow run on the specified SHA, require `P1K_ALT03A_PAIRED_EVIDENCE_READY pairs=2 pdfs=4 pngs=8 visual_approval=no`, retrieve the archived manifest and PNG files, then inspect image pairs for Arabic correctness. Defects require separate review/fixes and a fresh CI run.
- **Unchanged:** no live route exposure; HTTP `503 REPORTS_UNAVAILABLE`; no production renderer or font approval. ALT-02 CI evidence also remains pending.

## ALT-03A historical artifact visual baseline — 2026-11-06

**Evidence source and scope:** Independently downloaded and inspected GitHub Actions historical run `42134455934`, artifact `13464109364` (`phase23-p1j-arabic-pdf-visual-preview`), originating at commit `bb8e7b0878d3a0fda53ae2be7b2d2d486aa7a4d1` **before** ALT-02/ALT-03A source updates. The archive includes four actual `chromium-{details,ack}-probe.pdf` and `weasyprint-{details,ack}-probe.pdf` files.

**Measured comparison using PDF metadata and page-scoped `pdftotext -layout` (directional controls stripped solely for ID matching):**

| Renderer | Details pages | Details IDs | Acknowledgement pages | Ack IDs |
|---|---:|---|---:|---|
| WeasyPrint 66.0 (CI) | 15 | 1–85 continuous, ordered, no duplicates | 5 | 1–38 continuous, ordered |
| Chromium (CI baseline) | 15 | 1–85 continuous, ordered, no duplicates | 5 | 1–38 continuous, ordered |

Both renderers have identical per-page synthetic ID spans: details pages contain 1–5, then successive six-ID groups 6–83, and 84–85 on page 15; acknowledgements are 1–7, 8–15, 16–23, 24–31, 32–38. This gives **content continuity**, not proof that every text field has identical visual layout.

**Visual inspection:** Rasterized first and last pages from all four PDFs using the same scale and viewed paired comparison PNGs. Arabic headings and primary record labels look legible and joined, with comparable overall layout; mixed Arabic/ISO timestamps have congested boundaries between labels and values (noticeable near `تاريخ التسجيل` and `تاريخ الإقرار`), and the final details page has substantial unused space because it contains only records 84–85. This is an observation, **not** blanket visual correctness certification. Middle pages, extreme text wrapping, glyph-level spacing, font licenses, selective text extraction and printed readability require deeper review; visual rating remains **NOT APPROVED**.

**Reproducibility caveat:** These historical documents and render evidence do not prove the new `ALT-03A` workflow step ran. Verify a new Actions run on or after `b87437527ba0af66990e268544cc33de0650e0da`, and retrieve its `p1k-alt03a-paired-evidence.json` to complete that checkpoint. Likewise verify ALT-02's denial marker and checks. The current tool exposing commit-linked workflow runs only includes pull-request runs; absence of results cannot establish CI status.

**Decision:** Continue comparison and readability remediation in synthetic tests; do not substitute either engine, alter permissions, or release the HTTP 503 gate. No target-host security evaluation or independent sign-off has occurred.

## P1k scope-control plan — pragmatic acceptance (2026-11-06)

**User-approved principle:** Aim for **good, readable, dependable** Arabic PDFs rather than perfect typography. Time-box further exploratory visual work; avoid endless renderer experiments or repeated first/last-page evidence generation.

**Plan before executing this scope decision:**
1. Retain previously verified synthetic content-continuity results and visual observations. Distinguish confirmed CI runs from pending CI for the newer changes.
2. Define minimal **blocking** conditions: missing/duplicated/out-of-order authorized report records, illegible/misleading Arabic or dates, corrupt/truncated PDF, unsafe external resource exposure, unbounded resource usage, privilege/access-scope violations, or inability to isolate the chosen renderer on the target deployment host.
3. Classify **non-blocking** cosmetic issues: moderate whitespace, minor alignment/spacing and low page-density when data remain legible and complete.
4. Stop broad renderer comparisons. Choose one candidate after checking the few remaining blockers, and move all other improvements to a backlog. No production change or HTTP 503 removal in this decision alone.
5. Review/document decisions against existing evidence; do not invent successful new CI or target-host results.

**Boundary:** Keep `503 REPORTS_UNAVAILABLE`, permissions, test-only fixtures, and existing export implementation unchanged. This is a documentation and review checkpoint, not deployment permission.

## P1k pragmatic acceptance review and stop rule — 2026-11-06

### Evidence-based current disposition

| Check | Observed evidence | Disposition |
|---|---|---|
| Detail/acknowledgement record continuity | CI run `42134455934` proved 85/38 WeasyPrint extracted records; historical real PDFs from both engines were separately inspected, 15/5 pages, each record number once in order | **PASS (historical synthetic fixtures)** |
| Arabic presentation | Historical first/last page rasters show joined legible Arabic and comparable designs, but mixed-direction label/timestamp boundaries look crowded; middle pages not independently reviewed in this checkpoint | **PARTIAL; check only readability-critical cases** |
| Denied external/local fetch | ALT-02 source contains callback test, functionally equivalent local run was green using WeasyPrint 68.0; exact WeasyPrint 66.0 CI run not verified | **PENDING CI** |
| Comparison evidence pipeline | ALT-03A generator and workflow are committed; no new matching run/artifact verified | **PENDING CI; not a release requirement for its own sake** |
| Production process isolation and resource cap | Chromium native sandbox fails on existing CI; isolated experimental probes do not establish production-host isolation for either candidate | **BLOCKING before deployment** |
| Institution server, access scoping, approvals | No target-host execution or independent production approval here; existing report endpoint returns 503 | **BLOCKING before release; gate preserved** |

### Minimum acceptable PDF (not perfection)

- **Must:** valid bounded PDF; readable Arabic titles/fields; dates and numbers unambiguous; no missing/duplicate/out-of-order authorized records; complete acknowledgements; no dangerous file or network fetch; bounded process/resources; correct report access scopes and safe failure; renderer deployable within reviewed host isolation.
- **Can defer:** cosmetic whitespace, moderately uneven page density, small line-wrap/spacing deviations that do not change meaning, exhaustive pixel-perfect parity between engines, micro-optimizations, comparing more engines.
- **Do not claim ready:** until the relevant exact SHA's critical CI steps are actually observed and the chosen worker can satisfy target-host boundaries. Tests that *are* successful need not be reimplemented or endlessly expanded.

### Next bounded task

1. Verify **one** current run for `ALT-02` and, if present, `ALT-03A`; require the exact denial marker and no failure in report security steps. If connector cannot locate push runs, record the limitation and avoid repeated speculative checks.
2. Make a **single** renderer selection recommendation on existing documented criteria (not an architectural migration): WeasyPrint is the preferred candidate for the next contained implementation prototype because of fewer moving runtime parts and the established synthetic continuity, *subject to* equal security controls; Chromium stays the fallback if host/font/RTL issues require it.
3. Do **one** focused isolation/deployment feasibility proof with CPU/memory/time/output limits and no sensitive host mounts; if the host is not available, stop at experimental status, mark deployment as separately blocked and move to other Phase 23 tasks.
4. Do not spend more iterations on minor appearance imperfections. Reopen PDF layout only for a concrete, reproducible readability/content-loss defect.

**Reviewer note:** this is a scope and risk-priority review based on recorded tests, not an independent security sign-off. HTTP 503 remains active.
