# Phase 23/P1j — Synthetic Arabic PDF visual review pipeline

**Date:** 2026-11-05. **Branch:** `development/phase-23-wip-20261105`.

## Scope

P1i passed structural PDF and stress tests but **did not render and inspect actual page images**. P1j adds a reproducible synthetic-only preview/audit pipeline without any production data, login secrets, permissions or HTTP route activation.

- `server/tests/reportPdfPreview.ts` generates a fixed 85-book sample with Arabic labels, long titles, notes, mixed numerals and date filters, and writes a PDF and XLSX from the **same** `ReportResponse`. It accepts the font path and output directory through explicitly provided CI environment variables. It does not access the database, server or external networks.
- The GitHub Actions workflow validates document metadata with `pdfinfo`, extracts text using `pdftotext -layout -enc UTF-8`, and renders the first two and the last PDF pages as 1200-pixel PNG previews with `pdftoppm`.
- The preview PDF/XLSX, page images, metadata, and extracted text are uploaded to a short-lived artifact with **7-day retention**. Inspect rendered pages for Arabic joining, paragraph direction, dates, long-line wrapping, page breaks and readability. A merely nonempty extracted text file is not proof that RTL appears correctly.
- Workflow failures if PDF is malformed, text extraction yields an empty file, or page count is unreasonable for the fixed fixture.
- PDF font used for tests is Ubuntu's DejaVuSans; this does **not** approve the final institution font. No font files are added to the GitHub repository or shared to the user.
- The global `/api/reports` 503 guard and employee report denial remain unchanged. Full institution-based visual approval and production timezone remain separate decisions.

## Verification

**Focused CI verified:** [GitHub Actions 42086305657](https://github.com/daboolgame123-creator/Saqa/actions/runs/42086305657) for source commit `43ed111832717735935a4733eb4c16c0ae5fa145` completed **SUCCESS**, 2026-11-05. The first preview attempt on `2f3e1bd4f9c4635094bf7425c8709a4a06ee60d7` failed only because the Ubuntu worker did not have the `poppler-utils` commands in PATH; an on-demand installation was added and CI rerun successfully.

- TypeScript and Vite build: PASS.
- P0/P1b/P1c focused tests: 13 pass, 1 intentional skip.
- N1 ownership: 7 pass.
- PostgreSQL book/report: 10 pass.
- PostgreSQL personnel: 8 pass.
- PostgreSQL ViewLog: 11 pass.
- Export binary/security/stress tests: 8 pass.
- Authenticated HTTP 503 security test: 3 pass.
- **60 passing, 0 failing, 1 skipped**, plus successful checks and generation/rasterization of the preview fixture.
- Synthetic preview size: 85 rows, 6 PDF pages, PDF 22,330 bytes, XLSX 11,476 bytes.
- `pdfinfo`, `pdftotext`, and `pdftoppm` completed. First two and last pages were rasterized as PNG files. A 7-day retention artifact [phase23-p1j-arabic-pdf-visual-preview](https://github.com/daboolgame123-creator/Saqa/actions/runs/42086305657/artifacts/13443241444) contains the synthetic PDF/XLSX, raster PNGs, extracted text and metadata.
- **IMPORTANT:** Rendering PNGs and validating nonempty extracted text are NOT the same as human visual examination. Arabic joining and bidi placement are still pending independent inspection of those images. Do not declare PDF typography or print readiness approved.

Production reporting HTTP 503 and employee report deny remain unchanged.
