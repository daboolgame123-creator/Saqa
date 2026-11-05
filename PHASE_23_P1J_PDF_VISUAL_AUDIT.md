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

Pending CI and visual review. Until source artifacts are inspected, do not classify Arabic layout itself as certified.
