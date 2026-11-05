# ALSQAYA Phase 23/P1h — Excel and PDF export (internal only)

**Date:** 2026-11-05. **Branch:** `development/phase-23-wip-20261105`.

## Architecture and permissions

- New `server/src/api/services/reportExport.ts`: renderer accepts a precomputed `ReportResponse` and report type. The data source is the exact authorized report returned to `ReportApiService.run(filter, sessionDerivedAccess)`. Export service calls `run` **once**, so export and on-screen report derive from the same dataset and same permissions/filters, not a second SQL query.
- `ReportApiService.export(filter, access, format, options)` only operates after `assertReportAccess` inside `run`. Employee report reads remain denied; archivists have no access. HTTP router still returns 503 for **every** report/export path.
- No client-supplied rows/identities/aggregates are accepted. Exporters do not include internal record IDs, employee UUIDs, user IDs, session references, view-log raw rows, scope internal JSON, or unapproved hidden fields.
- Workbook sheets: `الملخص` (summary KPIs and applied filters), `التفاصيل` (the same permitted detail rows); and `الإقرارات` only for the combined circulars/ViewLog report. Historical acknowledgements outside the circular registration-date selection remain represented in the separate acknowledgement sheet with a non-identifying “outside registration period” title placeholder.
- Uncertain ViewLog totals are exported as `غير محسوم`, never as fake zero. Problem row counts and verified-only subtotals are clearly labeled.
- PDF renders identical summary and detail values with `pdfkit` and **requires an explicitly provided Arabic-capable font Buffer**; absence fails closed. The font has NOT been placed in GitHub or exposed publicly. Arabic glyph/page-layout quality must be visually reviewed before enabling the feature on production. No default institution font was chosen.
- Excel workbook is built with `exceljs` with frozen headers, right-aligned wrapped values, readable widths, and text cells. Potential formula strings beginning with `=`, `+`, `-`, `@` (including leading whitespace/control characters) are escaped as Excel literal text; canonical values and PDF remain unmodified.
- Security limits: maximum 2,000 detail rows and 2,000 acknowledgements, maximum 4,000 characters per cell. Violations **reject the entire export**; the exporter never silently truncates detail rows.
- Summary/detail parity: verifies `summary.totalCount === rows.length`; book summary direction/status totals must balance; separate ViewLog counts must reconcile with the verified entries.
- Researcher/professor reports explicitly refuse export because their authoritative source is unimplemented.

## Verification

New isolated in-process tests in `server/tests/reportExport.test.ts` verify Excel by round-tripping the generated binary with ExcelJS, summary/detail parity, formula injection, ViewLog redaction and uncertain totals, generated PDF header and embedded font requirement, invalid/oversized data rejection, and security guards before DB access. Tests are added to `.github/workflows/phase23-p1c.yml` alongside existing TypeScript/Vite, migrated PostgreSQL and real HTTP 503 tests.

**CI evidence pending:** This implementation is not verified until the actual workflow completes. Do not mark this work complete or publish HTTP export access prior to successful tests and explicit release review.

## Remains blocked

Production server timezone, approved Arabic PDF font and visual review, maximum-data policy, UI and HTTP endpoint wiring, full guarded N1 suite, additional Phase 23 source/filter and permissions review. Global reports 503 remains active.
