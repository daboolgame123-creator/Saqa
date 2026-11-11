# ALSQAYA — Phase 24-H human Arabic PDF acceptance worksheet

**Classification:** `EXTERNAL / HUMAN_SIGNOFF_PENDING / INSTITUTIONAL_RELEASE_NO_GO`.  
**Reference technical branch:** development merge SHA `07ed019fe022ea0f5d45c066adf0b6ba431f1aaf`; **do not** use actual personnel or institutional books for initial PDF UAT.

## Procedure (on administrator-approved isolated test host only)

1. Record the exact application commit, immutable renderer image digest, actual installed Arabic font/license evidence, OS/browser/PDF viewer versions, date/time, reviewer role and synthetic fixture ID. Do not publish real documents or institutional identity data.
2. Generate the synthetic reports on the approved host **without activating official report endpoints**. Use only the existing isolated candidate/testing path, under the authorized test environment. A working, signed-off production rendering path has not yet been established.
3. Compare source fixture, expected rows, XLSX projection and final PDF. Examine actual page images—not just text extraction—to check glyph shaping, RTL order, punctuation, line wrapping and clipping. Open first, middle and last pages for multi-page reports.
4. Collect redacted screenshots or rendered synthetic page images in controlled storage, link the evidence ID, and sign `PASS / FAIL / NOT_TESTED` for every required scenario. Report exact visible defect + page number if failed.
5. If a row fails, keep `P03=NO_GO`. Fix only the demonstrated renderer/template issue in an independently reviewed code change and re-run affected tests before any institutional approval.

## Human visual test matrix — ALL mandatory

| Case | Synthetic sample/expected output | Visual acceptance | Actual state |
|---|---|---|---|
| A01 | Arabic paragraph + long multi-line official subject | Initial/medial/final Arabic glyph shaping, no detached letters or cropped margins | NOT_TESTED |
| A02 | Mixed Arabic and English names/terms, ASCII numerals, Arabic-Indic digits and date | Bidirectional order and right-to-left layout match the source; no reversed numbers | NOT_TESTED |
| A03 | Long tables, right-aligned headers, changing page length | Headers and columns stay legible, no overlapping rows or blank/cut pages; page breaks are coherent | NOT_TESTED |
| A04 | Circulars with five synthetic books and 38 synthetic acknowledgment events | Unique row/count parity with the source and XLSX where applicable; reader-independent visual RTL ordering | NOT_TESTED |
| A05 | Multi-page employee/admin reports | Open first, intermediate and last page; font embeds, margins, page numbers and no blank or hidden content | NOT_TESTED |
| A06 | Exactly 250 synthetic rows | All expected 250 markers present once, first/middle/last page visually intact; XLSX/preview totals reconcile | NOT_TESTED |
| A07 | Exactly 251 synthetic rows | PDF must reject **without partial output**; XLSX remains complete under the existing policy | NOT_TESTED |
| A08 | Special characters, punctuation and long mixed-direction identifiers | Safe escaping, no swallowed text, no misleading field reorder | NOT_TESTED |
| A09 | Worker cancellation/timeout and restart on target host | Managed renderer ends without leftover container or leaked unfinished output; actual logs retained | NOT_TESTED |

**Do not conflate:** CI [24-E run 42827888697](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888697) and [24-F run 42827888837](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888837) verified synthetic PDF/Excel behavior and 250/251 assertion with Docker, but did not supply human target-host sign-off. The 250-row PDF was **not retained as a separate human-review artifact** in earlier CI; generate a fresh synthetic sample within authorized test tooling. Do not claim it was inspected already.

## Reviewer result sheet

| Attribute | Actual result to enter |
|---|---|
| Approved change/test ticket | TBD |
| Test host/inventory ID | TBD |
| Application SHA + immutable Docker image digest | TBD |
| Font checksum and institution license approval evidence | TBD |
| PDF viewer / OS and locale | TBD |
| Date, timezone and generated fixture reference | TBD |
| Arabic-language reviewer role and independent technical reviewer role | TBD |
| Evidence location and per-case page references | TBD |
| Any FAIL: defect ID, page and correction path | TBD |
| Overall verdict and authorized signature | **PENDING / NO_GO** |

**Final rule:** only a human visual reviewer can approve PDF Arabic appearance, and only with actual controlled-host evidence; an empty worksheet, test-output text extraction, or successful synthetic CI cannot change `P03=NOT_TESTED` to PASS.
