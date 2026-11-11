# Phase 24-H — deeper synthetic PDF evidence audit (NOT institutional acceptance)

**Review date:** 2026-11-12 (Iraq local calendar). **Status:** `CI_SAMPLE_AUDIT_PASS / TARGET_HOST_NOT_TESTED / INSTITUTIONAL_RELEASE_NO_GO`.  
**Scope:** Authentic previously published **synthetic** PDF CI artifacts, inspected without using any institutional service, credential, personnel record, document or production restore.

## Evidence identity and provenance

- Downloaded [Phase 24-E synthetic PDF run #42827888697](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888697) artifact ID `13768934439`. All source-file and sample-raster byte SHA-256 hashes matched its embedded manifests.
- Also downloaded its CI-only image/font provenance artifact ID `13769314124`. Its `sourceCommit` is `dc4306a1ecf2dd1ec75fee79eb841afafa8efd69` (GitHub synthetic PR **merge ref**, NOT the exact 24-FG PR head `aba74143...` or merged development SHA `07ed019f...`). The published CI `24-F` and `24-G` suites independently checked out `aba74143...` and succeeded.
- Manifest font: `fonts-dejavu-core 2.37-6`, installed DejaVuSans SHA-256 `abdc775b21b1bc470d50c97e790d276f2054b7504e56e5bd3e64f48d68582322`. Local Docker image ID exists, but **`registryImageDigest=null`**, image approval **false**, font-license review **false**, human visual approval **false**, target host isolation **false**.
- At first retrieval, GitHub listed both 24-E artifacts as available until **2026-11-17T13:51:45Z**. This is a retention deadline, not an institution asset-retention approval.

## Verification method and actual results

The three PDFs were read using PDF structural/text inspection, rendered **all 14 pages** at a readable contact-sheet scale, and inspected page-by-page; `pdffonts` checked font embedding. Bounding tests used PDF word coordinates against every page rectangle, with actual extracted-text/ID counts; no OCR was needed. This is stronger than looking only at the first/middle/last pages, but it is **still a developer's review of synthetic CI**, not a signed human acceptance on the target host.

| Check | Result |
|---|---|
| `ack.pdf` (circulars + acknowledgments) | 6 A4 pages, 27,979 bytes, original PDF SHA-256 equals manifest |
| `admin.pdf` (incoming, admin scope) | 7 A4 pages, 26,518 bytes, original PDF SHA-256 equals manifest |
| `employee.pdf` (incoming, employee scope) | 1 A4 page, 13,688 bytes, original PDF SHA-256 equals manifest |
| Original PDFs: page counts, byte lengths and SHA-256 | **3/3 for each field** match respective source manifest |
| Original first/middle/last PNGs | **7/7** SHA-256 match respective source manifest |
| Blank or almost-empty pages across 14 | **0** |
| Extracted words whose bounding box falls outside PDF page | **0** |
| PDF external links/annotations/images embedded | **0** links and **0** images found in each sample; PDF body is text-based |
| Fonts in each PDF | Embedded, subset, Unicode-mapped `DejaVu Sans` and `DejaVu Sans Bold` (verified by `pdffonts`) |
| Circular and acknowledgments content | **5 distinct `C2_CIRC_01`…`05`** document titles, **38** `C2_ACK_EMP_` event occurrences, and acknowledgment sequence **1–38 exactly once** |
| Admin incoming content | **42** sequential record-number labels and **42** unique expected synthetic row markers, each exactly once |
| Employee incoming content | **1** allowed synthetic first row; no marker from the later admin rows |
| Deliberately hostile string in admin fixture | `file:///etc/passwd` appears as **literal escaped text** in the generated PDF rather than a fetched image; no PDF image was embedded |

**Important fixture detail:** admin record **21** is intentionally labeled `C2_MIDDLE_021` (not `C2_ROW_021`). The expected 42 unique identifiers are `C2_FIRST_001`, `C2_ROW_002`…`020`, `C2_MIDDLE_021`, `C2_ROW_022`…`041`, and `C2_LAST_042`. A naive search solely for `C2_ROW_021` would produce a **false missing-row finding**.

On visually rendered samples there is no obvious page-edge clipping, line overlap or detached Arabic character shaping on the synthetic pages. **Limit:** raster review and PDF word-coordinate checks do not establish semantic correctness of every mixed Arabic/Latin expression, the real institution's PDF viewer or target renderer environment, actual licensing approval, original row-level dataset completeness, or proper layout of unseen real-world content. PDF's logical text extraction order is not a reliable proxy for visual Arabic/bidi order.

## No-go constraints and next evidence

- This audit does **not** set `P03` or any other institution-host gate to `PASS`. In `docs/PHASE_24_H_HOST_ACCEPTANCE.md` and `docs/PHASE_24_H_ARABIC_PDF_UAT.md`, those mandatory rows remain **`NOT_TESTED`**.
- The **250/251 PDF boundary** was exercised successfully by the full existing CI suite but the **250-row PDF was not preserved as a separate human-visual sample** here; do not claim inspection of those pages.
- On an institution-authorized isolated host, an Arabic-language reviewer must assess fresh synthetic reports with that host's pinned renderer image/font; separately confirm actual container confinement and crash recovery. The administration must independently approve server identity/isolation, secrets, offline backups, encrypted immutable offsite copies, retention and a supervised isolated restore.
- No production PDF/report activation or live host action is authorized. `OFFICIAL_REPORTS_RELEASE_APPROVED=false` and official `503 REPORTS_UNAVAILABLE` remain mandatory.

**Decision:** `SYNTHETIC_PDF_DEEP_REVIEW_COMPLETE / 24H_HOST_UAT_PENDING / RELEASE_NO_GO`. No new application defect is established by this limited artifact review, and no new fix is requested without a demonstrated failure.
