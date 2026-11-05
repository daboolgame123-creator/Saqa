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
