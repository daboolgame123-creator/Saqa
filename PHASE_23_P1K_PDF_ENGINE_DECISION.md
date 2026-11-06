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

## P1k ALT-04 plan — bounded real WeasyPrint subprocess (2026-11-06)

**Before implementation:** close one practical gap without expanding PDF layout scope. In the existing synthetic CI verification, run actual WeasyPrint 66.0 in a separate subprocess with a monotonic timeout, Linux RLIMIT_AS and RLIMIT_FSIZE, fixed finite input/output budgets, a deny-all resource fetcher, and a subprocess-kill/cleanup negative test. Avoid Docker image building or new production integrations.

1. Add `server/tests/p1kWeasyBoundedWorker.py` as a CI-only self-contained synthetic smoke/negative test, invoked **after** the pinned WeasyPrint installation in the existing workflow.
2. Success path: generate a small valid Arabic PDF under limits; capture a proof marker, bound stdout/output size; validate the signature, trailer and extracted Arabic synthetic marker.
3. Failure path: intentionally time out an isolated Python subprocess to demonstrate termination and cleanup. Keep all temporary paths disposable; never use institutional or host-secret records.
4. Use `resource.setrlimit` on Linux and `subprocess.run(timeout=...)` with `start_new_session=True`; kill the process group on a timeout if required. Clearly state these are **process-level resource controls, NOT filesystem/network isolation** and are not equivalent to Docker or a sandbox.
5. Run local syntax / runtime tests where possible; require exact SHA CI confirmation for closure. No production report route, PDF engine integration or authorization changes. Existing HTTP 503 stays.
6. **Acceptance:** one valid bounded PDF success, one proven timeout-and-cleanup failure, and green relevant CI; if CI cannot be checked, retain pending status and stop speculative follow-up.

No additional cosmetic PDF experiments are authorized by this step.

## P1k ALT-04 execution and review — 2026-11-06

- Plan-first commit: `cf834ce44957d9fc23dac97b86dea09504691cf9`.
- CI-only worker test: `cf8a2340728bd2b671c09c4d50db81e518f4500f` (`server/tests/p1kWeasyBoundedWorker.py`).
- Workflow wiring: `ed5aed8a4cd5302c976e6b7ba7a0cd2de34c93d6`, after the CI step that pins WeasyPrint 66.0.
- A functionally equivalent standalone script was syntax-checked and executed locally on Linux with WeasyPrint **68.0**, showing:
  - `P1K_WEASY_BOUNDED_RENDER_PASS bytes=172019`
  - `P1K_WEASY_BOUNDED_TIMEOUT_PASS killed=1`
  - `P1K_WEASY_BOUNDED_CLEANUP_PASS temporary_directory_removed=1`
- A first local version attempted to assert exact Arabic extraction and **failed** even though the PDF was generated; the check was corrected to a stable synthetic ASCII content marker. This result does **not** establish correct Arabic extraction under a selected font; the earlier 85/38 dedicated probe remains the continuity evidence.
- **CI remains UNVERIFIED** on the new commit. The GitHub connector exposes PR-triggered commit runs rather than the needed push-run list, and direct public Actions viewing was unavailable. Do not call ALT-04 complete until a matching CI job passes and the three output markers are verified.
- The experiment exercises a separate real PDF process, `RLIMIT_AS` (1.5 GiB), `RLIMIT_FSIZE` (12 MB), disabled core dumps, a 30-second render timeout, and forced process-group termination for a synthetic stall, with disposable temporary output.
- **Limitations:** `RLIMIT_AS` is an address-space ceiling, not a direct RSS or host-memory guarantee; `RLIMIT_FSIZE` applies per output file and does not bound aggregate writes. The test does not provide filesystem or network isolation, secure target-host deployment, or authorization validation. Existing independent Docker probes are not evidence the WeasyPrint subprocess runs *inside* their boundary.
- **Scope held:** no production renderer wiring, report route activation, permission changes or cosmetic layout iteration; HTTP `503 REPORTS_UNAVAILABLE` unchanged. Next task only after CI evidence: decide whether a single deployment-host feasibility check is possible; otherwise pause PDF integration and proceed with other Phase 23 work.

## P1k ALT-05 plan — improve field spacing and page density (2026-11-06)

**User direction:** Do not postpone minor layout defects. Improve readability, spacing and whitespace as part of completing the phase, without unnecessary perfectionism or production activation.

**Plan before editing:** Make one reversible change to the shared **synthetic-only** RTL HTML fixture used by both WeasyPrint and Chromium (`server/tests/reportHtmlPrintProbe.ts`). This is a layout-validation experiment; it does not alter the current production PDFKit exporter or enable routes.

1. Replace narrow, baseline-aligned label/value flex sizing with a fixed, readable label column and a separate flexible value column. Keep ISO dates as explicitly LTR, non-wrapping units, and use bidi isolation; do not reverse Arabic characters or change report values.
2. Tighten excessive record margins/padding *slightly* to make better use of A4 while preserving `break-inside:avoid`, readable font size and record boundaries. No artificial page filling, scaling or dropping records.
3. Run the available syntax/source-level checks and render/extract a synthetic fixture where the environment permits; inspect CI for both engines and confirm 85/38 continuity after the change. If CI cannot be verified, report pending.
4. Document any remaining actual visual defects after inspection; cosmetic differences do not block this source checkpoint, but misleading dates, missing text or authorization/security failures do.
5. No changes to PDF engine authorization, routes, permissions, real data, deployment security or the HTTP 503 gate.

**Acceptance:** clear non-overlapping label and ISO date layout in inspected samples plus intact 85/38 synthetic record count, subject to CI/visual verification. Do not claim final production typography approval from source inspection.

## P1k ALT-05 execution checkpoint — 2026-11-06

- Plan-first commit: `4de79e2ad1d5a4cd35502d1e52ea359bd6d7cae9`.
- Source change: `6b289d6126ae1845c024cd0b08e54b95412a9655`, **synthetic-only shared HTML fixture** `server/tests/reportHtmlPrintProbe.ts`. Replaced baseline-aligned flex sizing with top-aligned, explicit 29mm label column and 4mm gap; values take remaining width. Kept `bdi` isolation and added `white-space:nowrap` to the LTR date value. Slightly reduced record and heading margins and line height, without reducing 10pt body text or changing `break-inside:avoid`.
- Independent **locally recreated equivalent CSS fixture**, not the exact GitHub TypeScript-generated fixture: WeasyPrint **68.0** rendered and `pdftotext` extracted **85/85** and **38/38** numbered synthetic records in strict order. Its short 3-field example occupied 8 and 4 pages respectively, **not comparable** to the actual 6-field report fixtures or prior 15/5 page counts.
- A first local match falsely reported zero records because `pdftotext` preserves Unicode bidi control marks around numbers; after stripping directional controls (as the repository's existing continuity probe does), matching correctly recovered all record IDs. Raster of sample first detail page was opened and inspected: labels and dates are in clearly separated columns without visible overlap in that example; this is not a comprehensive font/visual review.
- **CI / committed fixture output: UNVERIFIED** for new SHA until a push-triggered workflow is inspected. The GitHub public Actions page was inaccessible via the available browser and the connector's commit-specific run query does not enumerate push runs. Do not infer production readiness or lossless real report data from the local recreated fixture.
- Remaining scope still includes the user's request not to postpone cosmetic flaws: compare *actual* revised PDFs, address any reproducible spacing/pagination defects before closing the PDF phase, but avoid changing production report routes or permissions. Keep the `503 REPORTS_UNAVAILABLE` release gate.

## ALT-05B plan — validate actual PDF field completeness (2026-11-06)

**Why:** Existing PDF continuity checks ensure ordered record identifiers, but a visual/layout change might still drop an individual date, label or field. Avoid more cosmetic experimentation; add one targeted fail-closed regression on the PDFs produced by *both* real engines.

1. Build `server/tests/p1kPdfFieldCompleteness.py`, a CI-only `pdftotext -layout` auditor of the four actual synthetic PDFs (85 detail and 38 acknowledgement records for WeasyPrint and Chromium).
2. For every PDF, assert ordered complete IDs and exact expected per-record ISO timestamp count; test per-record field labels without relying on unstable Arabic ligature spelling in extracted text (use stable labels proven in the historical artifact, and ASCII timestamp format). Explicitly strip Unicode bidi controls only for matching.
3. Place the new CI step after paired PDF generation, before artifact archival. Verify the same auditor against the previously downloaded original CI artifact where possible. Do not substitute a recreated template for actual rendered PDF proof.
4. Record precise source commits, local/historical evidence and whether CI was really observed. No production exporter or report route changes.

**Acceptance:** both engines retain 85 detail and 38 acknowledgement IDs, all 123 ISO dates, and all selected per-record field labels. This is semantic field completeness, **not** an automated visual typography score. Exact new-commit CI remains required for closure; HTTP 503 remains unchanged.

## ALT-05B evidence and implementation checkpoint — 2026-11-06

- Plan committed **before code**: `0aad433acd59f632b21a85f0ba0d9d150363f149`.
- Field-completeness auditor created at `47ee3ac6ec96d192575e312a5f960aa591f0ccd8`, corrected escape sequences at `6a41141c5d1d08345493f0a368fc94d2b6d45831`, and wired into the existing push CI workflow at `4cfc513572af3272af3e40f0d64a45b7c673ff7e`.
- **Historical real-artifact test (passed):** extracted the *actual four PDFs* from historical CI run `42134455934`, artifact `13464109364` (commit `bb8e7b08`). Ran a locally identical semantic auditor using `pdftotext -layout`; received four `P1K_PDF_FIELDS_PASS` markers and `P1K_PDF_FIELDS_ALL_PASS pdfs=4 details=85 acknowledgements=38`. Both engines had 85 ordered detail IDs and 85 ISO dates, plus 38 ordered acknowledgement IDs and 38 ISO dates. Counts for four stable detail labels and two stable acknowledgement labels matched each record count.
- **False alarm resolved before committing final test:** the extracted Arabic spelling of `الملاحظات` (and `تاريخ الإقرار`) differs from the Unicode source because of font shaping / extraction and cannot be used as an exact count without normalization; removed those from strict label assertions rather than misreport missing fields. This **does not** prove those labels are visually absent.
- **New-source CI: PENDING.** The historical PDFs predate ALT-05's compact layout and ALT-05B. The new step will fail on loss of a stable label or timestamp, but no current SHA-matched GitHub Actions run or artifact is verified in this checkpoint. Do not assert new-layout PDF tests passed.
- **Limits:** extracted-text completeness is not visual typography certification or an employee-scope test. The existing Arabic visual review, production PDF worker sandboxing, actual host, and report authorization sign-off remain separate. HTTP `503 REPORTS_UNAVAILABLE` untouched.

## ALT-05C plan — correct observed ISO date placement (2026-11-06)

**Problem confirmed before source change:** Re-created the actual historical synthetic HTML fixtures with the exact ALT-05 CSS replacements and rendered both PDFs locally using WeasyPrint 68.0. Real raster images of details page 7 and acknowledgements page 3 showed ISO date values stranded at the far left of each card, unlike adjacent right-aligned values. The data were not lost (85/38 IDs and dates; 15/5 pages), but visual scanning was poor.

**Minimal implementation plan:** Change exactly the synthetic fixture's LTR value `text-align:left` to `text-align:right`, **without** removing `dir=ltr` or `unicode-bidi:isolate`. This moves ISO dates adjacent to their Arabic labels while preserving date character ordering. Do not change fonts, authorisation or production exporter.

**Tests:** Locally re-rendered both real fixtures with that one CSS adjustment and inspected page 7 and acknowledgement page 3. Require full 85/38 ordered IDs and exact date counts on the corrected PDFs. CI on the committed source must eventually be checked separately; Chromium local render did not complete in this environment, so no Chromium visual claim.

**Protected boundaries:** No report routes, scopes, deployment security, or institution data; leave HTTP `503 REPORTS_UNAVAILABLE` unchanged.

## ALT-05C executed result — 2026-11-06

- Plan-first commit `3c3f55540515f3e842f006c748c4c28aa2d2465d`. Source fix commit `b91e2fae95c86934179caf00ba249126487de042` changes **only** synthetic HTML CSS `.field-value[dir=ltr]` from `text-align:left` to `text-align:right`. The time string retains `dir=ltr`, `unicode-bidi:isolate` and `white-space:nowrap`.
- Local source-equivalent proof used the real HTML files downloaded from historical GitHub Actions artifact `13464109364` for both fixture types. Applied the committed ALT-05 CSS transformation and this final one-rule fix; rendered using **WeasyPrint 68.0**; visually opened details **page 7** and acknowledgements **page 3** both before and after the final alignment. The fix moves dates next to their Arabic labels and leaves a readable gap; no visible overlap in either inspected page.
- On the final PDFs, `pdftotext -layout -enc UTF-8` after removing directional formatting marks showed **85/85 ordered detail IDs**, **85/85 ISO dates**, each of 4 stable detail labels **85 times**; **38/38 ordered acknowledgement IDs**, **38/38 ISO dates**, each of 2 stable acknowledgement labels **38 times**. Page counts remain **15 detail and 5 acknowledgement**, matching historical reference; this is not evidence of zero visual defects on uninspected pages.
- The local Chromium binary did not complete printing under the current environment, so **no local Chromium verdict** was issued. Exact current commit's pinned WeasyPrint **66.0** and full GitHub Actions result remain **UNVERIFIED**; do not claim new CI success or production approval.
- This corrects a **real, observed cosmetic readability defect**, consistent with the user's instruction not to postpone spacing. It changes no official PDFKit code, worker deployment, access roles or HTTP endpoint; `503 REPORTS_UNAVAILABLE` stays in place. Do not mark P1k complete until the CI, worker isolation and authorization release gates are independently verified.

## ALT-05D plan — page-by-page completeness (2026-11-06)

**Objective:** close the remaining low-effort page boundary and spacing audit without opening further styling experiments.

1. Inspect the real locally re-rendered ALT-05C WeasyPrint PDFs (historical synthetic HTML with the committed CSS applied), rasterize **all** pages into contact sheets, and check page-scoped ID/date continuity. This is a local source-equivalent comparison, **not** the exact compiled GitHub fixture or CI version 66.0.
2. Extend only `server/tests/p1kPdfFieldCompleteness.py` to assert that **each PDF page containing records has as many ISO timestamps as record IDs**, and that no page has a timestamp with no corresponding record. Continue to require full ordered 85/38 records, dates and per-record stable label totals. Reject blank/orphan pages.
3. Execute the revised check on the two available local WeasyPrint PDFs and historical four-engine PDFs; inspect any failures and fix. A newer CI run must still be confirmed independently before declaring repository CI green.
4. Document all-page inspection results. Keep the historical Chromium pass separate from newer WeasyPrint 68.0 render; local Chromium stalled in this environment. Retain all PDF cosmetic improvements requested by the user, but do not invent defects or make nonessential styling changes.
5. **No** production renderer, report HTTP routes, access controls, host isolation or data fixture changes. HTTP `503 REPORTS_UNAVAILABLE` remains in force.

**Acceptance:** no missing/duplicate IDs, timestamps or selected labels, no per-page orphan timestamp, and no visually observed page-break fragmentation in inspected synthetic samples; production security and fresh CI remain separate release gates.

## ALT-05D review and test outcome — 2026-11-06

- Plan-first commit: `687f8118bc87be90964d0568bda5b3edb4367933`. Implementation commit: `6f725262ac3f601ff36688b67cd142a45b2f81a3` (`server/tests/p1kPdfFieldCompleteness.py`, CI step already executes this file).
- The enhanced real-PDF auditor splits `pdftotext -layout` output on form feeds and **rejects any blank page, any page with no record ID, any page with a different number of IDs and ISO dates, or any page missing one of the selected per-record field labels**. It preserves overall contiguous 85/38 ID and timestamp assertions. This catches record/date split across pages that an aggregate-only count could miss.
- **Independent local functional checks PASS on six actual PDF files**, using equivalent Python assertions and `pdftotext` on: four unmodified PDFs from historical successful GitHub Actions artifact `13464109364` (`bb8e7b08`, Chromium + WeasyPrint, details + acknowledgement), and two locally re-rendered ALT-05C WeasyPrint 68.0 PDFs (`fixed-details.pdf`, `fixed-ack.pdf`) prepared from the historical synthetic HTML fixtures with the committed CSS applied. Each of the six files passed all per-page ID/date/label counts and overall ordered record counts.
- **Exact page distributions on the locally corrected WeasyPrint PDFs:** details 15 pages; pages 1–14 each hold six complete records (1–84), page 15 holds record 85. Acknowledgements five pages: page 1 holds 1–8, pages 2–4 hold 9–17, 18–26 and 27–35, page 5 holds 36–38. Every page has exactly one timestamp and each selected label per contained record.
- **Visual inspection:** Created contact sheets of **all 15 details and all five acknowledgement pages** in the locally corrected WeasyPrint 68.0 output. The page sequence and card outlines appear consistent, with no visually obvious split-card or overlapping rows at this contact-sheet scale. Page 15 and page 5 have substantial blank space due to residual record counts; treat as cosmetic, not data loss. Contact sheets are a screening method, not a high-resolution glyph certification.
- **Chromium local failure:** A separate local headless Chromium attempt with a 20-second timeout exited `124` and produced no PDF; no new Chromium CSS-layout claim. The four historical engine PDFs still passed the page-completeness regression locally.
- **CI verification not yet available:** Newer push-triggered workflow run list cannot be fetched via the current connector, and public GitHub Actions pages were inaccessible from the web tool. No evidence that workflow at or after `6f725262` passed. **ALT-02/ALT-03A/ALT-04/ALT-05B/05C/05D new-commit CI statuses remain UNVERIFIED**; do not approve production or close them based solely on historical/local success.
- **Scope:** This was a narrowly scoped page-integrity enhancement and full synthetic page inspection. No new styling changes, real personnel data, routes, permissions, application exporter or runtime worker; `503 REPORTS_UNAVAILABLE` still required.

## ALT-05D verification checkpoint — 2026-11-06 (no new feature scope)

**Plan for this review:** On unchanged source commit `f3f71acca58552015d86af90bd647fd591752236`, run the existing page-level PDF auditor against real archived PDFs and corrected local renders, add a deliberate corrupted-fixture control, inspect current branch/CI metadata, and report only observed evidence. No new PDF layout or production changes were planned.

**Actual results:**
- Confirmed remote development branch was **identical** to `f3f71acca58552015d86af90bd647fd591752236` before this documentation edit.
- Independently reproduced `server/tests/p1kPdfFieldCompleteness.py` checks locally on the actual **four historical CI PDFs** from artifact `13464109364`: four individual `P1K_PDF_FIELDS_PASS` lines plus `P1K_PDF_FIELDS_ALL_PASS pdfs=4 details=85 acknowledgements=38`.
- The same real-PDF validation also passed against a **mixed diagnostic set**: two corrected local WeasyPrint 68.0 PDFs (`fixed-details.pdf`, `fixed-ack.pdf`) and two older Chromium PDFs. This supports page-level and field checks for the corrected WeasyPrint layout, **not** a new paired Chromium visual comparison or a single CI execution.
- **Negative control PASS:** deliberately substituted the historical acknowledgement PDF for the historical Chromium details PDF. Auditor exited with status `1` on `chromium-details-probe.pdf: record IDs do not match 1..85`. This proves the local auditor rejects at least this concrete incorrect PDF rather than merely reporting success.
- **CI evidence limitation unchanged:** GitHub's combined-commit statuses returned an empty list, and available commit-run lookup returned an empty **PR-only** run list. Direct web viewing of Actions failed. These results do not establish push workflow success/failure. No matching newest SHA CI logs, manifest or artifact could be verified. **CI remains PENDING**.
- **Stop condition:** do not add more PDF completeness tests unless a reproducible defect appears. Close CI only with exact-run logs on a current commit, and retain the separate production sandbox/security review and HTTP `503 REPORTS_UNAVAILABLE` boundary. No official PDF worker was integrated or enabled in this checkpoint.

## ALT-02 through ALT-05D — exact GitHub Actions CI closure (2026-11-06)

**Review plan:** Resolve previously unverified Push workflow executions by querying the supported GitHub REST Actions run collection through the connected GitHub fetch capability, then inspect the run's individual steps and job log **on the implementation commit**, download the evidence artifact, and review paired samples. Document what is genuinely closed without treating experimental worker checks as deployment approval.

**Newly obtained authoritative evidence:**
- [GitHub Actions run 42140333357](https://github.com/daboolgame123-creator/Saqa/actions/runs/42140333357) / push commit **`6f725262ac3f601ff36688b67cd142a45b2f81a3`**: **completed SUCCESS** at 2026-11-06 00:58 UTC. Job `verify` ID **127638765616**: all individually listed steps completed **success**, including TypeScript, build, PostgreSQL report tests, PDF exports, personnel ownership, authenticated HTTP report security, Chromium regressions, WeasyPrint and both Docker experiments.
- Exact CI log markers at that SHA:
  - `P1K_WEASYPRINT_CONTINUITY_PASS kind=details records=85 bytes=44078`
  - `P1K_WEASYPRINT_CONTINUITY_PASS kind=ack records=38 bytes=22969`
  - `P1K_WEASYPRINT_ALT02_DENIAL_PASS local_file=denied loopback_http=denied callbacks=2`
  - `P1K_WEASY_BOUNDED_RENDER_PASS bytes=8326`
  - `P1K_WEASY_BOUNDED_TIMEOUT_PASS killed=1`
  - `P1K_WEASY_BOUNDED_CLEANUP_PASS temporary_directory_removed=1`
  - Four `P1K_PDF_FIELDS_PASS` markers (both engines, details 85 dates, acknowledgements 38 dates)
  - `P1K_PDF_FIELDS_ALL_PASS pdfs=4 details=85 acknowledgements=38`
  - `P1K_ALT03A_PAIRED_EVIDENCE_READY pairs=2 pdfs=4 pngs=8 visual_approval=no`.
- Downloaded the **actual new artifact** ID **13467413190** (`phase23-p1j-arabic-pdf-visual-preview`) and verified it contains four engine PDF files, **eight** `alt03a-*-{first,last}.png` samples and a `p1k-alt03a-paired-evidence.json` manifest. Manifest: both engines yield **15 details pages and five acknowledgement pages**. SHA-256 digests, actual PDF sizes and raster names are recorded per item.
- Created and directly inspected paired first/last-page contact sheets from that newly downloaded artifact. Observed Arabic headings, detail/acknowledgement labels, ISO dates and distinct records appear legible; date fields now sit alongside their Arabic labels rather than stranded at the far page edge. No visible overlaps in these sampled pages. Empty space on final pages is a layout-density artifact from remaining records, not a data-loss incident. This **does not certify every glyph or every page at print resolution**.

**Decision update:** The **CI portions** of ALT-02, ALT-03A, ALT-04, ALT-05B, ALT-05C and ALT-05D are now **VERIFIED PASS**, no longer pending. Their experimental source-level/CI acceptance is complete, subject to the limited proof scope described above. The subsequent documentation-only commits do not invalidate the successful test source baseline (the tested scripts and workflow match `6f725262`). No additional PDF test duplication is needed for these cases.

**Remaining release blockers (not formatting polish):**
1. Actual **WeasyPrint runtime isolation** within a container/worker on the deployment host, with no network, secret mounts, writable host access, and demonstrable CPU/memory/time/output limits. Existing independent container boundary and bounded Python worker tests do **not** prove the real PDF renderer is inside that boundary.
2. Production export integration must preserve per-user authorization and scoped query data, fail closed, and receive independent review; current HTML-based experiments are CI-only, while the official PDFKit path remains unchanged.
3. Host feasibility, deployment-font licensing/quality and explicit security/release sign-off, before removing `HTTP 503 REPORTS_UNAVAILABLE`.

**Working recommendation:** WeasyPrint remains the favored candidate for a **single isolated-worker prototype**; Chromium is a tested fallback. Avoid more cosmetic experiments unless a concrete readability defect is reproduced. **Never** interpret green CI as proof of production host isolation.

## ALT-06 plan — run the real WeasyPrint engine *inside* an isolated container (2026-11-06)

**Scope before edits:** one CI-only synthetic deployment-feasibility proof. Do not integrate it into the production exporter. Prior verification: exact GitHub Actions run `42140333357` passed all existing report-security and PDF tests, but the *real WeasyPrint renderer* has not yet run inside the independently probed Docker boundary.

1. Add a small dedicated test image, based on Python slim and pinned `weasyprint==66.0`, with the platform's installed font/runtime dependencies. Build it **before** execution, with outbound network disabled **at runtime**. Image-build networking remains a distinct supply-chain/deployment concern and cannot be described as offline.
2. Render the existing 85-detail and 38-acknowledgement synthetic HTML fixtures **inside Docker**, as an unprivileged UID with `--network none`, read-only root, no capabilities, `no-new-privileges`, default Docker seccomp, restricted PID/CPU/memory/file-size/temporary-storage limits, and **only read-only synthetic input bind**; no writable host mount or host secrets.
3. Archive only a fixed allowlist of evidence files from an in-container tmpfs to a bounded stdout tar. Validate exact members, file sizes and PDF content/record order on the host **before** accepting any evidence; deny suspicious archive members.
4. Prove boundary at runtime (UID, kernel `NoNewPrivs`, `Seccomp`, `CapEff`, read-only root/input, absent host secret, bounded output tmpfs, representative egress failure), and fail closed if any check fails. Require valid PDFs and uninterrupted 85/38 synthetic records. No HTTP endpoint changes.
5. Wire a single gated CI step before artifact upload. Verify the exact run and logs, investigate failures and document concrete image identity and remaining target-host caveats. **Do not claim production isolation** from CI alone: host kernel/cgroup configuration, base-image digest/signature, patch policy, font license, security review and authorization-to-export integration remain independent release gates.

**Acceptance:** the actual WeasyPrint process renders both PDFs under the reviewed CI Docker restrictions; all integrity and boundary checks pass in the same run. On a CI failure, retain open status and repair/retest rather than bypass restrictions. **Preserve** HTTP `503 REPORTS_UNAVAILABLE`.

## ALT-06 implementation, independent CI and artifact review — 2026-11-06

**Plan-first:** `2267e08270eb70c00c1ef7b26fcf3ecd3a39b91c`.

**Source commits:**
- `b82c97083399b3928eea8771929101d7b450893b` — dedicated CI-only WeasyPrint `66.0` Dockerfile.
- `c29aab50b277ee767a410fda392e36c173601872` — restricted-container worker (unprivileged UID, kernel restriction checks, deny-all URL fetcher, tar evidence).
- `3f763d4e83953c7686b128f34d0e0edee8480f4c` — host runner (Docker limits, synthetic read-only bind, isolated tmpfs, fixed-member TAR validation and full 85/38 continuity).
- `aa0e9e7f4715f630d11b4e5af84d2979bb553715` — CI step wired after browser isolated print and before archiving.

**Exact, confirmed GitHub Actions evidence:**
- [Run 42196911962](https://github.com/daboolgame123-creator/Saqa/actions/runs/42196911962), head `aa0e9e7f4715f630d11b4e5af84d2979bb553715`: **COMPLETED SUCCESS**, all steps passed, including security HTTP report gate.
- Job log:
  - `P1K_WEASY_ISOLATED_WORKER_FINISHED`
  - `P1K_WEASY_ISOLATED_PDF_PASS kind=details records=85 dates=85 bytes=44078`
  - `P1K_WEASY_ISOLATED_PDF_PASS kind=ack records=38 dates=38 bytes=22967`
  - `P1K_WEASY_ISOLATED_ALL_PASS synthetic=1 documents=2 network=none`
- Downloaded actual run artifact **13491814652** (61 entries). Verified both `container-weasyprint-*.pdf` outputs, `p1k-weasy-image-id.txt`, and boundary proof file. Exact proof:
  `P1K_WEASY_ISOLATED_BOUNDARY_PASS uid=10001 no_new_privs=1 seccomp=2 capeff=0 network=denied input=readonly root=readonly`.
- The test uses `docker run --network none --read-only --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 768m --cpus 1`, per-file cap of 12 MiB, 32 MiB tmpfs output and read-only synthetic input bind **without a host-writable mount**. A fixed-member TAR is checked before accepting result. Image identity is archived. The output contains precisely the existing 85 and 38 ordered synthetic records and timestamps.

**Security review and limitations:** **ALT-06 CI experimental acceptance: PASS.** This is the first confirmed run in which the actual WeasyPrint runtime generated Arabic PDFs *inside* the isolated container. This does **not** approve a production image, because the base tag `python:3.12-slim-bookworm` is not pinned by immutable digest; image dependency lock/checksums, patch policy and font licensing require review, as do target-host Docker/kernel/cgroup/LSM configuration and institutional deployment. Building the image accesses package registries; the **rendering process alone** is offline. Other possible host boundary attacks are not exhaustively excluded by these checks. Do not copy this CI container into production without separate review.

**Release boundaries unchanged:** The new code is **test-only** and does not connect to official PDFKit/export HTTP routes, per-user scope calculations or sensitive documents. `HTTP 503 REPORTS_UNAVAILABLE` must continue. **Next distinct development task:** review and design a production-safe, authorized input contract for the isolated renderer, with explicit failure behavior and deployment checks, then implement only after a new plan-first checkpoint.

## ALT-07 plan — trusted structured input contract (2026-11-06)

**Pre-implementation analysis:** `reportExport.ts` already enforces `buildReportExportModel(reportType, report)` from a scoped `ReportResponse`, applies 250-row/row-text caps to PDFKit, and explicitly keeps every report HTTP route at 503. The isolated WeasyPrint experiment instead consumes synthetic HTML fixture files and has no trusted application data boundary. Passing user-controlled HTML into the renderer would bypass the intended template boundary.

**One bounded task:** Define and test a **structured-only, versioned UTF-8 JSON envelope**, produced exclusively from an already-constructed `ReportExportModel`. No HTML, SQL, file paths, URLs, roles, employee IDs, raw unscoped report rows, or request objects cross this interface. The container will eventually render it with a fixed audited template; **not part of ALT-07**.

1. Add `server/src/api/services/reportPdfInput.ts` with a typed serializable v1 payload and pure `encode`/strict `decode` functions. Fail closed on unknown properties, wrong types, invalid width, excessive rows/text, invalid schema version, malformed UTF-8, and total byte size. Preserve all allowed scalar values exactly (including Arabic, dates and dangerous-looking markup strings) rather than silently modifying/reversing them. Require exact 8 detail columns and 3 acknowledgement columns.
2. Add focused tests in `server/tests/reportPdfInput.test.ts`: valid synthetic scoped model, deterministic round trip, HTML-ish literal values as data, missing/extra fields, wrong version, excess resource caps, invalid UTF-8/JSON, acknowledgement inconsistency, and mutation after encoding. Ensure no credential, internal ID, or authorization object is serialized.
3. Run direct relevant tests locally if possible and add the focused test to the existing CI job as a gating step. Examine exact push CI run/step/log, fix regressions, document evidence.
4. **Security boundaries:** Pure data contract only, no live worker invocations and no change to `renderReportExport`, `ReportApiService`, access scopes, PDFKit production path or routing; keep `503 REPORTS_UNAVAILABLE`. The isolated worker must never interpret the user's field values as HTML or use them as filesystem/network paths. A trusted caller must first run the existing service authorization and `buildReportExportModel`; a type assertion or raw request cannot substitute for that.
5. **Completion:** Contract and its negative tests green on the exact commit, with explicit review. Integration/deployment remains a separate plan-first gate. **Never claim this contract alone proves authorization**; HTTP remains closed.

## ALT-07 source + CI closure — versioned structured PDF data input (2026-11-06)

**Plan-first commit:** `66c0f114d8692cd3497ab3a0840fe6f5590c6ec0`.

**Changes:** `adf56a6ebf4ad25a59f4db8ecf899804f4828f38` added `server/src/api/services/reportPdfInput.ts`; `e9943dc196f17c1f2be6ebd73db8f4c065b7f9fb` added `server/tests/reportPdfInput.test.ts`; `490cf042ad9f3f84ad4dfa4c77e45217c353a64b` gates the tests in GitHub Actions. These are **not invoked by official PDF export endpoints**.

**Actual validation:** [GitHub Actions run 42198481188](https://github.com/daboolgame123-creator/Saqa/actions/runs/42198481188), push head `490cf042ad9f3f84ad4dfa4c77e45217c353a64b`, job ID `127827594282`, completed **SUCCESS**, no failing steps. CI logs specifically show **five ALT-07 tests passed (5/5), 0 failed**, as well as successful TypeScript, build, PostgreSQL report scope/security, exports and previously verified isolated PDF probes.

**Reviewed contract properties:**
- Typed `ReportPdfInputV1` carrying only `schemaVersion=1`, `title`, `summary`, `details`, `acknowledgements`, `hasAcknowledgements`; no report row IDs, actor, session, role, URL-fetch configuration, path names, raw HTML templates or request object as protocol fields.
- Strict expected-key allowlisting on the payload and canonical trusted-model shape, UTF-8 fatal parsing, fixed detail/acknowledgement column count (8/3), maximum 250 rows per section, 100 summary rows, 1200 characters per detail/ack row, 4000 characters per cell, 180000 characters total, 512000 encoded bytes. No silent content truncation.
- Data values remain literal; strings that look like `<img ...>` or spreadsheet formulas remain **uninterpreted text**. The **future rendering template must HTML-escape each value**; ALT-07 is not an HTML sanitizer, an authorization check or an executable worker.
- Tests reject unknown keys, malformed Unicode/JSON/UTF-8, inconsistent acknowledgement flags, excessive sizes, malformed rows, and forged metadata; demonstrate deterministic encoding, defensive copying and no internal ID propagation from the source synthetic `ReportResponse`.

**Independent review / limits:** The serializer type is `ReportExportModel`, but TypeScript types and JSON validation **cannot prove authorization or provenance** against malicious callers. The eventual server integration **must** obtain a trusted `ReportResponse` exclusively through `ReportApiService` with verified access context and create the export model via `buildReportExportModel`, never deserialize user-submitted payloads into a privileged export path. Do not place any unsanitized serialized value into executable HTML, a URL, path or CSS. The current CI Docker worker still reads **synthetic HTML**, not this structured payload: end-to-end authorized handoff, renderer fixed template, signed image supply-chain and target-host test remain **NOT IMPLEMENTED**.

**Disposition:** **ALT-07 implementation + CI tests COMPLETE**; production integration **NOT STARTED**, routes remain `503 REPORTS_UNAVAILABLE`. Next step requires a distinct plan-first, in-process structured-input-to-escaped-HTML renderer proof and safe container handoff (not an HTTP activation).

## ALT-08 plan — fixed escaped Arabic HTML from structured PDF JSON (2026-11-06)

**Task boundary:** Implement and verify one **CI-only, structured-data-to-fixed-template** renderer demonstration. ALT-07 already provides a strict TypeScript v1 JSON encoder; ALT-06 already proves restricted Docker execution for fixed synthetic HTML. This step tests the missing conversion and JSON handoff, **without** modifying official PDFKit exporter, ReportApiService, permissions, or any HTTP route.

1. Add `server/tests/p1kPdfJsonFixture.ts` to create two synthetic v1 JSON files by using the **real ALT-07 encoder** on `buildReportExportModel` for summary/details and circular acknowledgements, including HTML-looking payloads. No confidential or institutional records.
2. Add `server/tests/p1kWeasyJsonTemplate.py` as a Python **fixed-template** converter accepting only the v1 envelope with exact key, type, column and byte budgets matching ALT-07. Escape all values using `html.escape(quote=True)`; no user HTML, CSS, style attributes, URLs, local paths or dynamic fonts enter the template. Keep Arabic/RTL and isolate ASCII-like date values using controlled `bdi dir=ltr`, preserve Arabic word spacing and page-break protection.
3. Add `server/tests/test_p1k_weasy_json_template.py` for strict positive/negative input cases: literal `<img src=file:///...>`, script and style injection, extra keys, oversize, invalid version, malformed UTF-8, row columns, hidden identity fields and acknowledgement mismatch. Confirm template has literal escaped strings, no executable tags.
4. In CI, first generate JSON from TypeScript model, then execute the Python template regression suite, and actually generate two PDFs from the JSON using the already-installed WeasyPrint with a rejecting URL fetcher, verify PDFs valid and extracted synthetic identifiers/date strings. **Do not treat Python-only JSON inputs as proof of service authorization.**
5. Independently review the exact run and logs; fix failed tests before closing. A future distinct step will pass this fixed-template path into the ALT-06 Docker runner using an explicit input mount instead of HTML. Production renderer wiring remains blocked pending that test, host/security approval, and access-scope review.

**Acceptance:** deterministic JSON comes from existing trusted-model-building code; Python rejects malformed inputs, HTML-escapes all literal report values, both offline PDFs contain expected synthetic identifiers and counts, exact CI passes. Keep HTTP `503 REPORTS_UNAVAILABLE`.

## ALT-08 closure — escaped structured JSON to synthetic Arabic PDF (2026-11-06)

**Plan-first:** `b21c0e0dfd1e4394fb8c6e922949d0ad7f602948`.

**Changes and review:**
- `26fd0663a0fa6171d7c27b35520151bfeea5f4aa`: test-only TypeScript generator creates two version-1 JSON files through **real** `buildReportExportModel` and `encodeReportPdfInput`, with only synthetic identities, reports and hostile-looking literal values.
- `7ce9ae966e89497ae90ceba98eea10981baf40f1`: strict Python `p1kWeasyJsonTemplate.py` decoder and fixed Arabic/RTL HTML template. String values are escaped with `html.escape(quote=True)`; no report-controlled paths, network assets, scripts or styles are interpolated. The WeasyPrint URL fetcher rejects external resources.
- `665d3ea971341db1d0f2a1d3b1c87b6593f6a700`: positive/negative Python tests. CI step `835312f084cba865538f0ac51ded965ad310e8f1` generates JSON, checks template escaping and malformed inputs, renders two PDFs using the installed WeasyPrint, and extracts their unique synthetic markers.
- Initial [CI run 42199304937](https://github.com/daboolgame123-creator/Saqa/actions/runs/42199304937) **failed** on an invalid Unicode surrogate test fixture during its *test serializer*, before reaching the worker; renderer defect was **not** established. Corrected the fixture to JSON-escape the invalid surrogate (`e67b1bb3c7385477017b813a54e3234ffaad4dd8`) and obtained a succeeding run.
- Independent audit found two strictness gaps in Python JSON parser: duplicate object keys and boolean `true` matching integer version `1`. Closed these without weakening any limits in `b8e633e077a508d863ba8a67616545f2700d7cd4`, adding negative tests `1a53d02f6b01c5fc9e98581ec7769afea16f09db`.

**Final verified CI:** [GitHub Actions run 42199831830](https://github.com/daboolgame123-creator/Saqa/actions/runs/42199831830), implementation head `1a53d02f6b01c5fc9e98581ec7769afea16f09db`, job `127832088447`, **completed SUCCESS**, all workflow steps succeeded including TypeScript, build, DB authorization security, the existing isolated WeasyPrint Docker experiment and export tests. Exact relevant logs:
- `P1K_ALT08_JSON_FIXTURE_PASS kind=details bytes=677`
- `P1K_ALT08_JSON_FIXTURE_PASS kind=ack bytes=1077`
- `Ran 5 tests ... OK` for fixed-template Python regressions.
- `P1K_ALT08_JSON_PDF_PASS kind=details rows=3 acknowledgements=0 bytes=16047`
- `P1K_ALT08_JSON_PDF_PASS kind=ack rows=1 acknowledgements=2 bytes=16654`
- `P1K_ALT08_PDF_CONTENT_PASS kind=details markers=3`
- `P1K_ALT08_PDF_CONTENT_PASS kind=ack markers=3`
- `P1K_WEASY_ISOLATED_ALL_PASS synthetic=1 documents=2 network=none` (existing ALT-06 **HTML-based** container runner).

**Disposition:** **ALT-08 test-only JSON-to-fixed-template conversion and PDF rendering PASS.** The ISO timestamps, Arabic labels and hostile-looking literal strings are converted under a fixed escaped template; PDF extraction confirms named synthetic markers. This is not full employee authorization verification, not comprehensive visual print approval, and **not yet a JSON-to-PDF render inside Docker**. The ALT-06 Docker runner continues to consume synthetic HTML fixtures; crossing that last structured-input sandbox boundary requires a **separate plan-first** task and new CI proof. Neither current report exporter, session/access logic, nor HTTP route gate changed: `503 REPORTS_UNAVAILABLE` remains.

## ALT-09 plan — close synthetic JSON handoff inside restricted Docker (2026-11-06)

**User priority:** Finish Phase 23 reliably and securely, not pursue cosmetic/perfection experiments. Do not re-run old experiments without a concrete regression. The already verified ALT-08 run `42199831830` proved JSON-to-PDF with an offline fetcher **outside** Docker, and ALT-06 proved a real renderer inside Docker using **HTML input**. The one remaining proof is JSON all the way into the same constrained container.

1. Reuse existing CI-only Docker image, strict ALT-08 JSON decoder/template and ALT-06 kernel boundary checks. Make the read-only input check accept the exact expected JSON filename, rather than weakening it.
2. Add a separate test-only in-container JSON worker reading **only** two allowlisted JSON files from a read-only synthetic input bind, regenerating HTML internally via the fixed escaped template, running WeasyPrint with denied external fetches, and publishing exactly three members: proof, details PDF, acknowledgements PDF. Require success to emit TAR; no raw HTML file, user path or URL input.
3. Add a standalone CI-only Docker runner: generate JSON using real ALT-07 TypeScript encoder, use no network/read-only root/unprivileged user/no capabilities/default seccomp/cgroup and tmpfs quotas, verify a fixed TAR member allowlist and PDF IDs + ISO timestamps + exact synthetic markers, plus sentinel secrecy. Fail closed.
4. Run new step after ALT-08 / ALT-06 in the existing GitHub workflow. Get exact run and full log markers; fix any failure, then record verified proof. Keep `503 REPORTS_UNAVAILABLE`, no endpoint, no production renderer/service integration.
5. After ALT-09, evaluate Phase 23 closure separately: report/query authorization, export wiring, permission decision, host image supply-chain and reviewed deployment. **Do not mark Phase 23 fully complete** from synthetic CI only.

**Acceptance:** two PDFs emitted from ALT-07 JSON by the fixed ALT-08 template **inside** the bounded ALT-06 Docker security boundary, full synthetic content recovered, no external fetch, and exact matching CI success.
