# Phase 23 — C2/C4 circular ViewLog acknowledgement real-PDF acceptance

**Date:** 2026-11-07
**Parent:** PR #31, `3701f28f13448c973b3df334132b5ca394273d5f`.
**Branch:** `integration/phase23-c2-ack-real-pdf-20261107`.
**Status:** `DRAFT / CI_ONLY_SYNTHETIC / HTTP_503 / UNMERGED`.

## Analysis before execution
Earlier C2 real WeasyPrint tests covered only incoming book lists. A separate P1k synthetic exercise covered acknowledgements without the end-to-end authorization → migrated real PostgreSQL → report service → strict-JSON → isolated Docker → PDF path. That left a genuine coverage gap for the formally requested two ViewLog indicators, 3-column acknowledgement rows, and page rendering. The registered circular count and acknowledgement timestamp are independent clocks; the export must not infer or duplicate operations.

## Implementation and acceptance
In the same disposable migrated PostgreSQL integration test, create exactly five synthetic registered public circulars and eight synthetic employee/user identities. Insert exactly 38 different employee/circular formal acknowledgement pairs with real, distinct UTC timestamps. No institution records, credentials, real staff names or archival files are ever read.

- **Admin**: authorized service statistics must count `circularCount=5`, `acknowledgementOperations=38`, `uniqueEmployees=8`, `problemRecords=0`, and complete verification with `38` detail acknowledgements.
- **Employee**: request for `circularsAndAcknowledgements` must fail at authorization before trying to execute any PDF worker.
- **PDF**: render the **same authorized response** through the existing strict JSON, CI-only WeasyPrint image and fixed escaped Arabic template. Parse a genuine multipage PDF with Poppler. Each of the eight synthetic staff markers must occur exactly 4 or 5 times (total 38). All five circular markers must be present; report must include the two separate indicator labels and the formal acknowledgement heading. No internal UUID or private session marker is allowed in extracted text. Reject blank pages.
- **Visual**: retain only real PDFs generated from synthetic data and rasterized first/middle/last acknowledgement pages with SHA-256 manifests labeled `PENDING_HUMAN_REVIEW`. Existing incoming samples and 42-book continuity remain covered.
- **Regression**: same SHA must pass TypeScript, build, real Docker/Poppler, C2 test, C4 synthetic inspect policy, browser admin/director/employee RBAC and archive restore, server, DB, API and `REPORTS_UNAVAILABLE` HTTP 503 guard.

## Nonrelease conditions
This is CI only. Real Arabic font license/hash, immutable Docker image digest/provenance, configured institutional runtime, kernel/cgroups/seccomp/LSM, Docker kill/orphan cleanup, complete visual sample inspection and independent operations review remain **external**. Historical anomaly behaviour is checked in existing migrated DB tests and must continue to fail closed; no conflict resolution is silently invented. These tests do **not** activate official HTTP reports or authorize merging into the institutional baseline.

**Do not mark this checkpoint verified until the exact-commit CI run finishes and its evidence is reviewed.**
