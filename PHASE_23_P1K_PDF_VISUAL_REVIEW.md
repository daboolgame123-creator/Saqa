# Phase 23 — P1k: Arabic PDF visual review

**Date:** 2026-11-05  
**Status:** NOT APPROVED FOR PRODUCTION / PRINTING — visual defects remain  
**Branch:** `development/phase-23-wip-20261105`  
**Source baseline:** `e7a9c8d7abac567da34f6c28a28c916953b56b87`  
**Original evidence:** [P1j CI 42086305657](https://github.com/daboolgame123-creator/Saqa/actions/runs/42086305657) and [artifact 13443241444](https://github.com/daboolgame123-creator/Saqa/actions/runs/42086305657/artifacts/13443241444).

## Evidence actually inspected

Downloaded the original, unexpired P1j Actions artifact, verified the six-page A4 synthetic PDF, and visually inspected rasterized pages 1, 2 and 6. Also rasterized and examined page 3, and inspected `pdftotext -layout` output. This is direct image inspection, not merely a successful rasterization assertion. The original file has 85 synthetic detail records; no institutional records were accessed.

## Observations

| ID | Finding | Severity | Evidence / disposition |
| --- | --- | --- | --- |
| V1 | Arabic letters generally connect, but some words appear joined without appropriate visual whitespace (e.g. document title). | Major | Page 1 and page 2; **not fixed/approved** |
| V2 | Mixed-direction Arabic, ISO date/time, Latin tokens, numbering and punctuation have confusing ordering/spacing. | Major | Pages 1–3; **not fixed/approved** |
| V3 | Details are a long `|`-separated paragraph per record; field scanning and printing are difficult. | Major | Page 2; **not fixed/approved** |
| V4 | A long record spans a page boundary without repeating its record index: page 3 starts with a tail of record 19, and page 6 starts with a tail of record 79. | Major | Pages 3 and 6; **targeted code fix committed; requires regenerated visual proof** |
| V5 | Summary consumes a full page with substantial whitespace. | Minor | Page 1; improvement pending |
| V6 | The preview does not include an acknowledgements page, even though the renderer supports it. | Coverage gap | **Separate targeted visual fixture required** |

The three supplied PNGs do not cover all middle pages, so the other pages are not presumed free of defects. Page 3 was separately rasterized from the original PDF.

## Targeted remediation

Source file `server/src/api/services/reportExport.ts`: for each detail and formal-acknowledgement record, estimate its rendered height via PDFKit `heightOfString` before writing, reject a record taller than a usable page rather than silently truncating, and insert a page break with a section continuation title when the whole record does not fit. Existing preflight data caps and explicit Arabic font requirement remain unchanged. This change addresses **V4 only**; it does not certify bidirectional layout or solve V1–V3.

## Security invariants

Keep all reporting HTTP routes behind HTTP 503 / `REPORTS_UNAVAILABLE`; retain `ReportScopeNotReadyError`, archivist limitations, DB-level scoping, existing authorized-response-only exports, and isolated test database. No organization font or nonlicensed font has been committed. Never turn a formatting test into production authorization.

## Follow-up / acceptance gates

1. Re-run TypeScript, build, existing export, DB, ownership and HTTP 503 checks on the amended branch.
2. Download the **new** CI artifact; inspect pages around every pagination boundary, not just first and last. Confirm each detail/acknowledgement appears exactly once and starts on its own page if moved.
3. Test mixed text with Arabic/Latin/ISO timestamps and punctuation and confirm word spacing, glyph shaping, bidi ordering. Adopt a validated RTL layout strategy before print approval.
4. Make a separate synthetic ViewLog acknowledgements preview; include long titles, names and edge-of-page rows.
5. Obtain explicit approval of the final licensed font, report timezone and print layout. Keep production reporting disabled until complete Phase 23 security sign-off.

**P1k conclusion:** A real visual review was performed and reproducible defects found. This is a **failed visual acceptance**, not a declaration of certified PDF quality. Remaining deficiencies must be handled before release.
