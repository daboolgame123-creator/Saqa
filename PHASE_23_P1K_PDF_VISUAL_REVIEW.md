# Phase 23 — P1k: Arabic PDF visual review

**Date:** 2026-11-05  
**Status:** NOT APPROVED FOR PRODUCTION / PRINTING — visual defects remain  
**Branch:** `development/phase-23-wip-20261105`  
**Source baseline:** `e7a9c8d7abac567da34f6c28a28c916953b56b87`  
**Original evidence:** [P1j CI 42086305657](https://github.com/daboolgame123-creator/Saqa/actions/runs/42086305657) and [artifact 13443241444](https://github.com/daboolgame123-creator/Saqa/actions/runs/42086305657/artifacts/13443241444).

## Evidence actually inspected

Downloaded the original, unexpired P1j Actions artifact, verified the six-page A4 synthetic PDF, and visually inspected pages 1, 2, 3 and 6. Examined `pdftotext -layout` output. After the targeted fix, downloaded the new CI artifact, visually inspected page 3, page 6, then separately rasterized and visually inspected pages 4 and 5. Pages 1 and 2 were retained in the new artifact for comparison; the targeted code change does not alter their text formatting. The original file has 85 synthetic detail records; no institutional records were accessed.

## Observations

| ID | Finding | Severity | Evidence / disposition |
| --- | --- | --- | --- |
| V1 | Arabic letters generally connect, but some words appear joined without appropriate visual whitespace (e.g. document title). | Major | Page 1 and page 2; **not fixed/approved** |
| V2 | Mixed-direction Arabic, ISO date/time, Latin tokens, numbering and punctuation have confusing ordering/spacing. | Major | Pages 1–3; **not fixed/approved** |
| V3 | Details are a long `|`-separated paragraph per record; field scanning and printing are difficult. | Major | Page 2; **not fixed/approved** |
| V4 | Original file split records 19 and 79 across pages. | Major (fixed in synthetic preview) | **New preview visually checked**: page 3 starts with intact record 19, pages 4/5 begin with intact records 37/56, page 6 with intact record 75 and ends at 85; continuation headers visible. Keep regression coverage before release. |
| V5 | Summary consumes a full page with substantial whitespace. | Minor | Page 1; improvement pending |
| V6 | The preview does not include an acknowledgements page, even though the renderer supports it. | Coverage gap | **Separate targeted visual fixture required** |

The three supplied PNGs do not cover all middle pages, so the other pages are not presumed free of defects. Page 3 was separately rasterized from the original PDF.

## Targeted remediation

Source file `server/src/api/services/reportExport.ts`: for each detail and formal-acknowledgement record, estimate its rendered height via PDFKit `heightOfString` before writing, reject a record taller than a usable page rather than silently truncating, and insert a page break with a section continuation title when the whole record does not fit. Existing preflight data caps and explicit Arabic font requirement remain unchanged. This change addresses **V4 only**; it does not certify bidirectional layout or solve V1–V3.

## Security invariants

Keep all reporting HTTP routes behind HTTP 503 / `REPORTS_UNAVAILABLE`; retain `ReportScopeNotReadyError`, archivist limitations, DB-level scoping, existing authorized-response-only exports, and isolated test database. No organization font or nonlicensed font has been committed. Never turn a formatting test into production authorization.

## Post-fix verification

- Fix commit: [`ca52f1cf`](https://github.com/daboolgame123-creator/Saqa/commit/ca52f1cf015035b9b0fd69a2c0e93bb6d494c156).
- [GitHub Actions run 42088670520](https://github.com/daboolgame123-creator/Saqa/actions/runs/42088670520): **completed SUCCESS**; all recorded workflow steps succeeded, including TypeScript, build, isolated DB, export and HTTP 503 protection.
- New artifact ID: `13443049288` (P1j-named artifact generated in updated workflow run); downloaded and inspected. PDF still has six A4 pages and 85 synthetic rows.
- The pagination defect V4 was corrected in the inspected case. Problems V1–V3, V5 and coverage gap V6 remain open. Passing CI does **not** certify Arabic print layout.

## Follow-up / acceptance gates

1. Add automated page-boundary regression and acknowledgement fixture; ensure no repeated/omitted records or split acknowledgement blocks. The synthetic detail fixture now has visual evidence on pages 3–6, but acknowledgements are not yet sampled.
2. Test mixed text with Arabic/Latin/ISO timestamps and punctuation and confirm word spacing, glyph shaping, bidi ordering. Adopt a validated RTL layout strategy before print approval.
3. Make a separate synthetic ViewLog acknowledgements preview; include long titles, names and edge-of-page rows.
4. Obtain explicit approval of the final licensed font, report timezone and print layout. Keep production reporting disabled until complete Phase 23 security sign-off.

**P1k conclusion:** A real visual review was performed and reproducible defects found. This is a **failed visual acceptance**, not a declaration of certified PDF quality. Remaining deficiencies must be handled before release.

## P1k follow-up — 2026-11-05: labeled RTL preview and formal acknowledgement fixture

Source commits:
- `32d7a4d7`: replace visually difficult pipe-joined detail and acknowledgement records with independent labeled fields. Retains the complete authorized values (empty fields are omitted from PDF rendering).
- `cb2c5293`: generate a second synthetic PDF covering five circulars and 38 verified acknowledgements with synthetic, non-institutional identities.
- `36e2f0b4`: render and archive first/last acknowledgement page images, extracted text and PDF metadata in CI.
- `c5e8c111`: isolate ISO timestamps on separate physical lines to reduce Arabic/Latin BiDi collisions, remove the obsolete pipe-joined detail column header.

**Verified CI:** [run 42089475306](https://github.com/daboolgame123-creator/Saqa/actions/runs/42089475306), **SUCCESS**, 0 failing steps, run head `36e2f0b4`. The newer `c5e8c111` change requires its own CI and regenerated visual review; do not extrapolate the preceding success.

**Artifact:** [13445400041](https://github.com/daboolgame123-creator/Saqa/actions/runs/42089475306/artifacts/13445400041); downloaded and directly inspected. The 85-detail fixture now occupies 14 PDF pages; the 38-acknowledgement fixture occupies 6 PDF pages. Visually checked detail page 2 and 14; acknowledgment pages 2 through 6 using actual rendered raster images. The last detail page contains records 84–85, the last acknowledgment page contains 31–38. Continuation headers exist. No visually obvious row fragmentation in the inspected pages.

**Remaining major issue:** Visual inspection still shows concatenated Arabic words and mixed-direction label/timestamp punctuation. Distinct lines improve segmentation, but this is **not** a validated Unicode BiDi/shaping solution. Date/time layout and exact extraction correctness must be reassessed after `c5e8c111`. Full page-by-page visual review (including page 1, all detail pages and acknowledgment first page), automated content continuity regression, and final typography/font approval remain outstanding. **Arabic PDF quality is NOT APPROVED.** Current HTTP 503 and employee-scope deny must remain in place.

## Final independent CI and visual checkpoint for timestamp isolation

[Actions run 42089866433](https://github.com/daboolgame123-creator/Saqa/actions/runs/42089866433), source `c5e8c111`: **completed SUCCESS**, including isolated PostgreSQL and HTTP protection checks. New [artifact 13444582694](https://github.com/daboolgame123-creator/Saqa/actions/runs/42089866433/artifacts/13444582694) downloaded and inspected. The report PDF now has 16 pages; the circular acknowledgement PDF has 7 pages. Direct examination of the updated detail page 2 confirms ISO timestamps print separately on their own line instead of directly adjoining Arabic labels. This **improves date readability** but does not correct the remaining Arabic word-spacing / bidi defects. No final typography authorization has been granted. Note that the final page count grows after the new line breaks, increasing the urgency of a more compact validated layout. Continue to block production reporting endpoints.

## P1k follow-up: font-feature/spacing experiment and rollback

On 2026-11-05, compared the original `pdftotext -layout` evidence with the rendered page. The literal heading `جدول التفاصيل` appeared as visually joined/reordered words; the extracted text also exhibited inappropriate ordering and missing separation. This proves that right alignment alone does not establish Arabic BiDi correctness.

A **synthetic-only experiment** in source commit `3bc25d2d` applied PDFKit `features:['rtla']` and `wordSpacing:2`. The CI job reached preview generation, then took materially longer than the previous baseline and did not provide a timely artifact while monitored. As this change had neither proven visual benefit nor acceptable verified resource behavior, the change was **rolled back** in commit `115ac196`. This is not an accepted typography fix. **No production report access was enabled.**

A 120-second limit for the synthetic preview Node command was added to the CI workflow in commit `a4264756`, ensuring that future rendering hangs fail instead of consuming the full overall CI timeout. The 120-second limit is a CI safeguard, **not** an approved production request timeout.

### Unresolved blocking work

- Use a well-tested Arabic Unicode BiDi + shaping renderer or an approved engine with appropriate typeface, validate the entire mixed-direction fixture, and compare raster output and extracted text. Do not use unsafe character/word reversal shortcuts.
- Add automated coverage for Arabic word separation, Arabic/Latin/date and punctuation presentation, zero content loss over page breaks, 250-row safety cap, and acknowledgements.
- Assess pagination density separately after reliable shaping. The current PDFs remain marked **NOT PRINT-APPROVED**.


## Restored-baseline CI evidence (final P1k checkpoint)

- [GitHub Actions 42090907651](https://github.com/daboolgame123-creator/Saqa/actions/runs/42090907651), workflow source `a4264756`: **SUCCESS** (TypeScript, build, report security, DB, export and preview generation).
- [Restored preview artifact 13443719204](https://github.com/daboolgame123-creator/Saqa/actions/runs/42090907651/artifacts/13443719204): downloaded and examined programmatically.
- Comparison against pre-experiment stable artifact `13444582694`: UTF-8 `extracted-text.txt` SHA-256 is identical (`b8dad8a903431f603d399bd4132575318fa059f6032c9f1e8b21ee0c113c5974`); `ack-extracted-text.txt` SHA-256 is also identical (`547ee649c0a73b2dbcf9b0b893daea87a05f128e3bafa48183a40ff767f2b8a7`). Both PDF page counts unchanged: detail 16 and acknowledgements 7. This verifies restoration of text output after rolling back the unsafe experiment, **not** corrected Arabic typography.
- Follow-up acceptance remains blocked pending validated Arabic BiDi/shaping/spacing renderer and visual review; no export HTTP activation or font approval.

## P1k offline Chromium comparison — 2026-11-05

**Scope:** a **separate experimental renderer** only; no production PDF service changes or new HTTP routes. The current PDFKit export implementation, 503 gate, personnel denial, database scoping and roles remain unchanged.

### Implementation
- `server/tests/reportHtmlPrintProbe.ts`: generates **synthetic-only**, self-contained HTML fixtures with `lang="ar"`, `dir="rtl"`, escaped text, isolated LTR ISO timestamps in `<bdi>`, CSS print A4 and `break-inside:avoid` per record. No JavaScript in output HTML, external resources, network calls or institution font.
- `.github/workflows/phase23-p1c.yml`: print to PDF using installed headless Chromium within a 90-second timeout per fixture, extract text and rasterize first/last pages; archive the output.
- `server/tests/checkHtmlPrintProbe.ts`: strip Unicode bidi control marks from PDF extracted text and assert that **all** 85 detail record numbers and **all** 38 acknowledgement numbers occur **exactly once, in order**; verify presence of an ISO timestamp.

### Verified evidence

- [First successful Chromium comparison CI run 42096334000](https://github.com/daboolgame123-creator/Saqa/actions/runs/42096334000): **SUCCESS**, [artifact 13447646645](https://github.com/daboolgame123-creator/Saqa/actions/runs/42096334000/artifacts/13447646645) downloaded and inspected from actual raster images (detail first and last; acknowledgements first).
- Visual observations on the synthetic output: Arabic word separation and heading direction substantially improved vs the current PDFKit baseline. Mixed Arabic/Latin ISO date values sit in isolated columns, and the printed detail cards are legible. This is **sample evidence**, not an exhaustive visual audit of every page, font or runtime.
- Chromium: 85 detail records over **15 A4 pages**, 38 acknowledgements over **5 A4 pages**; original PDFKit synthetic comparison: **16** and **7** pages respectively. No claim is made that these are identical templates, so page-count differences are contextual, not a like-for-like performance benchmark.
- [Independent continuity-check CI run 42096859590](https://github.com/daboolgame123-creator/Saqa/actions/runs/42096859590): **SUCCESS**; includes TypeScript, Vite build, isolated PostgreSQL, export, authenticated HTTP 503 security and **P1k assert Chromium PDF preserves every synthetic record**. No failing steps.

### Remaining approval blockers

1. Do not wire Chromium printing into the export service until the service's authorized-response-only contract, PDF resource limits, isolation of local file access and Chromium process lifetime, reproducible deployment, and failure behavior are designed, reviewed and tested. The sample is not a production-secure renderer.
2. The sample lacks real authorization-specific report types, summary sections, and complex content cases; extend **synthetic** cases for long single fields, mixed scripts, punctuation and large permitted row counts, and inspect all page boundaries.
3. Final font family, licensing and institutional print design still need explicit approval. Run on the actual chosen operational host, not just GitHub-hosted Ubuntu.
4. The `P1k` typography defect appears substantially improved in Chromium samples, but **P1k remains open / PDF print not approved** pending these acceptance checks. Preserve all reporting HTTP 503 blocks.


## P1k isolated renderer checkpoint (2026-11-05)

- Added `server/src/api/services/reportChromiumInternal.ts`, a separate prototype only. It accepts a prevalidated report model and does not add HTTP routes or replace PDFKit.
- HTML text is escaped, with RTL presentation and LTR date isolation. Preflight enforces 250 rows per section, 1200 characters per detail row, 180000 total characters, and PDF output limit 12 MB.
- Browser subprocess uses a configured absolute executable, no shell, private temporary directory, deadline and cleanup. Tests exercise malicious HTML, malformed input, excessive rows, failed subprocess, timeout and actual Chromium PDF.
- [CI run 42097829179](https://github.com/daboolgame123-creator/Saqa/actions/runs/42097829179) completed SUCCESS, including the new security and failure tests, TypeScript, build, PostgreSQL, export and HTTP 503 protections.
- Important: CI browser configuration is not a production-grade operating-system sandbox. Network egress, browser privileges, file-system access, concurrency, disk/memory/CPU ceilings and final font selection must be reviewed before any deployment. Production rendering remains unapproved.
- Reporting HTTP paths remain blocked (503). Employee report access and archivist permissions remain unchanged. P1k stays open.

## P1k process-local resource checkpoint — 2026-11-05

**Scope:** experimental internal Chromium component only, with no change to `ReportApiService`, HTTP export routes or the original PDFKit export.

- Commit `c23568b9` adds fail-fast backpressure: **one active browser job per Node.js process**. The slot is released through `finally`, including timeouts, invalid output and cleanup failure. This is a process-local guard, **not** a global/distributed export quota.
- The browser-produced PDF is now read through a **bounded 12 MiB + 1 byte read**, rejecting oversize output before materializing an unbounded file in memory. Temporary workspace cleanup remains mandatory. Browser disk usage *during* generation is not limited by this change.
- Commit `b5059777` adds tests for simultaneous requests, slot release after process timeout and launch failure, and a fake browser that outputs a PDF larger than the allowed budget.
- [GitHub Actions run 42099238321](https://github.com/daboolgame123-creator/Saqa/actions/runs/42099238321), source `b5059777`: **completed SUCCESS**. New internal Chromium security/failure tests passed together with TypeScript, build, isolated PostgreSQL, report export, synthetic visual/continuity probe and authenticated HTTP 503 protection. No failed steps.
- **Still NOT production-approved**: no OS-level browser/process-tree sandbox proof, network egress denial, CPU/memory/disk quotas, distributed concurrency, operational browser installation policy or approved Arabic font. Printing from authorized data remains off for HTTP users; final visual review and operational security approval are pending.

**Deferred Phase 22 OCR note:** OCR is a separate **image/PDF-to-text** pipeline (not Chromium HTML-to-PDF printing). Reuse synthetic Arabic mixed-direction verification principles and strict confidentiality/scoping, but do not conflate the renderer with an OCR recognizer. Resume OCR under a separately reviewed Phase 22 task.

## P1k process-tree termination verification (2026-11-05)

**Code:** `server/src/api/services/reportChromiumInternal.ts` commit `5e88342e` now uses a separate Linux process group for the experimental Chromium launcher and sends `SIGKILL` to the group on timeout, rather than killing only the parent. Unsupported non-Linux hosts fail closed for this prototype. This mitigates a specific orphaned-child failure case; it does not implement OS sandboxing or prevent processes from escaping the group.

**Regression:** `server/tests/reportChromiumInternal.test.ts` commit `e69361d2` launches a synthetic shell process with a descendant that would write an output marker after its parent times out. The test asserts the timeout and verifies that the descendant never writes the marker, in addition to the existing malformed input, concurrent job, oversized output and real Chromium checks.

**Verified CI:** [GitHub Actions run 42101107864](https://github.com/daboolgame123-creator/Saqa/actions/runs/42101107864), source `e69361d2`, completed **SUCCESS**; no failed workflow steps. TypeScript, build, isolated database and report 503 security checks also passed.

### Network and host isolation — explicitly NOT verified

- `--disable-background-networking` is a browser preference, **not** an egress firewall. HTML escaping and CSP prevent several injection vectors, but do **not** demonstrate network namespace isolation.
- Current CI invokes a headless browser and does not prove that it cannot reach LAN, loopback, metadata endpoints or arbitrary host files. Never describe this run as passing an OS-level network-isolation or file-isolation penetration test.
- Production approval requires a separately managed sandbox with default-deny outbound networking, only approved font/input/output mounts, an unprivileged OS user, CPU/memory/process/disk quotas, process-tree supervision, and tests from **inside** that sandbox demonstrating denied outbound connections and denied sensitive-file reads. Review the actual deployment OS and Chromium packaging before selecting a mechanism.
- No export endpoint was opened; roles, DB scoping, authenticated HTTP 503 and PDFKit remain unchanged. The Chromium module is internal-only and **P1k is open**.


## P1k Linux container boundary test (2026-11-05)

A separate **synthetic-only** Docker isolation experiment was implemented and verified. This is an isolated test of potential OS containment settings, **not a test that Chromium already operates within them**.

- `server/tests/p1kContainerBoundaryProbe.sh` (commit `eac40e54`) runs a throwaway Ubuntu 24.04 container with `--network none`, `--read-only`, unprivileged UID/GID 10001, all capabilities dropped, `no-new-privileges`, `--pids-limit 64`, `--memory 256m`, `--cpus 1`, bounded non-executable tmpfs, read-only input bind and one explicitly writable output bind.
- The probe uses synthetic sentinels only. It asserts that unmounted host-secret paths are unavailable, input and system files cannot be changed, and attempted public/LAN/loopback TCP connections on the selected probe port fail. It also verifies the permitted output write. A failed assertion fails CI. This checks representative connectivity, **not every protocol, IP, port or conceivable escape path**.
- `.github/workflows/phase23-p1c.yml` (commit `0195729d`) executes the new probe before the existing internal Chromium regressions. Docker being missing, the image failing to start or any failed containment assertion are hard failures; no silent skip.
- [GitHub Actions run 42101979249](https://github.com/daboolgame123-creator/Saqa/actions/runs/42101979249), source `0195729d`: **completed SUCCESS** with all steps successful, including the newly added Docker boundary probe, TypeScript/build, isolated PostgreSQL, existing browser/export/RTL tests, and final report HTTP 503 checks.

**What is NOT proved:** Chromium was **not launched inside this Docker container**; the container image is a test-only Ubuntu tag, not a digest-pinned production browser image. A no-network namespace still has its own loopback interface. The probe does not demonstrate container escape resistance, denied every network destination, full host filesystem isolation under adversarial exploitation, memory/CPU consumption under pressure, disk quotas beyond the specific tmpfs, a deployment-ready Chromium sandbox, or compatibility with the future institution server. Production approval requires a vetted digest-pinned runtime/browser image, explicit output isolation and robust browser sandbox policy, tests with Chromium running inside the proposed container, security review, and host-specific sign-off. Do not enable HTTP reports or alter authorization rules.

## P1k containerized Chromium print execution and reviewed artifact — 2026-11-05

- `server/tests/p1kContainerChromiumPrint.sh` (commit `2d70ff54`) now **runs real Chromium** inside an experimental, unprivileged Docker container while printing the two pre-generated, wholly synthetic Arabic HTML fixtures. `--network none`, read-only root and input mount, a single explicitly writable output mount, dropped Linux capabilities, no-new-privileges, bounded memory (1 GiB), CPU (1 core), PIDs (128), tmpfs and deadlines are applied. It checks representative blocked public/LAN TCP attempts and forbidden writes before printing.
- The runner-only browser image is **tagged, not digest-pinned**, and Chromium uses `--no-sandbox` inside the outer Docker boundary; **this is NOT a production Chromium sandbox recommendation**. Network namespace and filesystem restrictions are not verified against all possible escape conditions. Actual operational OS, digest, user namespace/seccomp, host policy, controlled font and approved deployment remain essential.
- `.github/workflows/phase23-p1c.yml` commit `558020e0` added the container-print step. [GitHub Actions run 42102954250](https://github.com/daboolgame123-creator/Saqa/actions/runs/42102954250) **completed SUCCESS**; the container printed PDF files with no failing steps, and all existing security/DB/report HTTP 503 tests continued to pass.
- [Artifact 13450751322](https://github.com/daboolgame123-creator/Saqa/actions/runs/42102954250/artifacts/13450751322) was downloaded and independently inspected with `pdfinfo`, extracted UTF-8 text and rendered images. Containerized details: **15 pages / 85 synthetic record IDs, exactly once, in order**. Containerized acknowledgements: **5 pages / 38 acknowledgement IDs, exactly once, in order**. Visually examined details page 1 and acknowledgements page 5; Arabic layout and ISO timestamps were legible on those sampled pages. This does not certify every page or a final institutional print layout.
- `server/tests/checkHtmlPrintProbe.ts` commit `5f3596bc` now asserts the same numbering/continuity and timestamp-presence properties for **both** non-container and container-generated extracts, so future CI executions fail on missing/duplicated IDs. Its own CI re-run must be separately verified before marking this additional regression green.

**Release gate remains closed:** the isolated Chromium execution and synthetic fixture checks establish feasibility, not production suitability. The PDF renderer is still internal-only; reporting HTTP routes remain HTTP 503. Separate security sign-off for the actual deployment host, complete Arabic print visual audit, licensed font and operational fault tests remain required. Deferred Phase 22 OCR is a separate image-to-text component, not part of the Chromium print pipeline.
