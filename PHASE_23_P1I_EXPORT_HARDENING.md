# ALSQAYA Phase 23/P1i — Export resource hardening and large-file review

**Date:** 2026-11-05. **Branch:** `development/phase-23-wip-20261105`.

## Audit finding

P1h permitted at most 2,000 rows and 4,000 characters per cell but did not bound **aggregate total text**. For PDFs, 2,000 records with long titles/notes could expand to a very large number of pages; the PDFKit in-memory buffer could consume excessive resources. This is a **pre-release performance/security risk**, especially for large reports.

## P1i correction

- All formats: reject before starting workbook/document construction if the validated export model exceeds **2,000,000 characters in total**, while retaining existing 2,000 detail / 2,000 acknowledgement row and 4,000-character per-field limits.
- PDF only: cap **250 detail rows** and **250 acknowledgement rows**, **1,200 characters per assembled row**, and **180,000 aggregate characters**. If a report exceeds the PDF budget, throw `ReportExportUnavailableError` rather than silently dropping rows, truncating text, or generating an unusably long file.
- XLSX retains the existing **2,000-row** resource bound; new round-trip stress test generates the maximum 2,000 synthetic rows, reloads the resulting binary workbook, and asserts its first and last rows both survive.
- PDF stress test uses 250 synthetic Arabic-labelled records and an external CI test font. It verifies PDF page-count > 3 and < 100, the generated binary header/size, and rejection of a 251st record.
- Explicit total-text exhaustion test for XLSX and oversize assembled-row test for PDF. A longer single text cell may remain valid in XLSX while rejected in PDF; this is intentional and tested.
- No dataset is truncated or changed. Every export still derives from one access-checked `ReportApiService.run` call, with the same applied filters and source rows.
- No PDF font was committed. A valid PDF byte stream and page count do **not** certify all Arabic glyph shaping, bidi ordering, or full visual legibility. Visual inspection against rendered sample pages remains a separate pre-release check.

## Security and activation

No HTTP routes, role grants, migrations, production data, fonts, timezone policy or deployment changes. `/api/reports` and descendants continue to return 503. The independent employee-report read-deny guard remains in force.

## Verification

**Verified:** [GitHub Actions run 42084789105](https://github.com/daboolgame123-creator/Saqa/actions/runs/42084789105) for commit `169f650a91f96f72c2076475d157f2a9732107de`, completed **SUCCESS** on 2026-11-05.

- Dependency install, TypeScript lint and Vite build: **PASS**.
- In-process P0/P1b/P1c report tests: **13 PASS, 1 SKIPPED** (opt-in preflight).
- N1 personnel owner-denial unit tests: **7 PASS**.
- Real migrated PostgreSQL book reports: **10 PASS**.
- Real migrated PostgreSQL personnel reports: **8 PASS**.
- Real migrated PostgreSQL ViewLog/circular reports: **11 PASS**.
- Excel/PDF export regressions including the three new stress/budget cases: **8 PASS**.
- Authenticated HTTP 503/report security checks: **3 PASS**.
- **60 PASS, 0 FAIL, 1 SKIPPED**, plus successful TypeScript/Vite.

Evidence limits: PDF tests establish structural pagination and byte output, not human-reviewed Arabic bidi shaping or every page's visual appearance; the 250-row limit is a provisional conservative safety cap, not approved operational policy.

## Further review before deployment

- Render a representative multi-page Arabic PDF to images and inspect right-to-left text shaping/long-field wrapping across PDF readers; select and license an appropriate institutional font.
- Load test realistic workloads and adopt operational export caps under documented institution policy; current numbers are conservative development safeguards, not approved service levels.
- Configure institution-approved registration timezone, finish remaining Phase 23 security/permission/filtered-export tests, and obtain explicit approval before enabling any HTTP export route.
