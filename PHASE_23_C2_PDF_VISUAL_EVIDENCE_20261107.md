# Phase 23 C2/C4 — Real Arabic PDF visual evidence handoff

**Branch:** `integration/phase23-c2-pdf-visual-evidence-20261107`. **Stacked parent:** PR #30 commit `f7e1ffaabceb7a082a23458320e65f1eddb98e78`.

**State:** CI-only synthetic PDF visual evidence, **never official host approval**. Reports HTTP 503 and Draft-only integration remain unchanged.

## Analyze before implementation

PR #30 proves *machine-checkable* real PDF semantics from PostgreSQL, role-scoped report service and WeasyPrint in an isolated Docker candidate. Its live PDF bytes are not retained in a safe artifact for a human visual acceptance review. Poppler text extraction and a matching font name cannot detect every RTL word-spacing, line-wrap, clipped text or bidirectional punctuation defect. Historical PDFKit visual evidence includes known major Arabic layout failures; successful WeasyPrint CI does not automatically close them.

## Implemented evidence lane

- Reuse only the migrated **synthetic** 42-book fixture, role-scoped admin and employee PDFs already created by C2 integration, with strict data-only stdin and a fixed escaped WeasyPrint RTL template.
- Strengthen tests to require **all 42 administrator-visible book markers exactly once**, no foreign/internal IDs, and no blank/missing text pages. Employee output must show its one authorized book exactly once.
- Retain *actual* PDF files `admin.pdf` and `employee.pdf` in a dedicated synthetic-only CI artifact and rasterize first/middle/last admin pages and first employee page at 130 DPI using `pdftoppm`. If the PDF has only 2 pages, deduplicate repeated page samples rather than falsely claiming 3 distinct pages.
- Save per-role JSON manifests with PDF/image SHA-256, page numbers, sizes, `syntheticOnly=true`, and the explicit `visualApproval=PENDING_HUMAN_REVIEW` label.
- A new exact-SHA workflow includes real PDF rendering/parsing, visual-evidence output validation, full TypeScript/build, C2 worker/PG tests, C4 offline policy, Chromium RBAC/restore/503 UAT, and server/DB/API regression.

## Acceptance boundary

An artifact containing PDF/PNG files **enables**, but cannot substitute for, actual visual inspection by a reviewer. C4 final production acceptance requires visual evidence from the approved immutable image and fonts on the target institutional host or documented equivalent, with first/middle/last Arabic text, RTL labels, punctuation, mixed LTR dates and acknowledgement records. No CI-only synthetic image can certify the host's seccomp/LSM, orphan-container cleanup, font license or pinned image provenance. Do not remove `REPORTS_UNAVAILABLE`, merge the baseline or mark Phase 23 closed based on this lane.

**Evidence:** The workflow is the source of truth; don't mark it successful until it completes on exact PR HEAD.
