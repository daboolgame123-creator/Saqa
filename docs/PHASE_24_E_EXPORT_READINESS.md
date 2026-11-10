# Phase 24-E — Preproduction PDF/XLSX evidence and container provenance

**Owner:** CHAT. **Classification:** HYBRID (automated CI can verify synthetic content, not institutional host controls or human Arabic appearance).  
**Base:** `phase-10-api-data-layer` @ `d04ec7521ecbfa5a95bdff76cc94a52f0abb691a`.  
**Branch:** `feature/phase24-e-export-readiness-20261110`.

## Analysis and plan — recorded before source changes

Existing code already has a detached, unexposed, data-only WeasyPrint PDF worker under a bounded Docker supervisor; C2 integration covers 42 incoming rows and 38 ViewLog acknowledgements, with a role-scoped PostgreSQL service, XLSX and human-reviewable PDF samples. Reuse it. Do not install a second renderer, change official report routing, alter authentication, touch 24-C/24-D or claim production acceptance.

1. Add a synthetic migrated-PostgreSQL regression to the existing isolated C2 real-PDF integration: **exactly 250** SQL/preview/XLSX/PDF detail rows, all markers exactly once, no blank extracted PDF pages, no hidden identifiers and no daemon container left; then **251** rows must still export fully as XLSX while PDF rejects before renderer launch, never truncating to 250.
2. Add a minimal CI-only Docker provenance manifest generator recording the *actual* built local image ID, Dockerfile SHA256, installed DejaVu Sans font SHA256, license-evidence SHA256, runtime identities and outstanding host fields. Do not synthesize a registry digest, font licensing approval or host attestation.
3. Add a branch/PR-specific Linux workflow with exact-SHA lint/build, focused export/gate tests, real Docker + migrated PostgreSQL integration, negative verification and synthetic artifacts (PDF manifests/raster samples + image manifest).
4. Document the results by exact SHA and CI job, and distinguish automated text-extraction from human visual sign-off. Final acceptance needs an approved immutable registry digest, licensed fonts, effective seccomp/cgroup/network controls, watchdog, crash cleanup, target-host Arabic pages and institutional authorisation.

### Acceptance

Automated suite passes on the exact branch SHA. The official release constant remains false; HTTP /api/reports returns 503. No real data, no production image approval, no automatic merging, no activation. This branch is a candidate even if CI is green.

### Result — initial code SHA verified, institutional host pending

**Technical code checkpoint:** `e310ca8b61a26b9d8ec4f233a76dcb8d6df0d823`. [CI run 42793204420](https://github.com/daboolgame123-creator/Saqa/actions/runs/42793204420) **SUCCESS** on exact code SHA:

- Manifest negative tests: **6/6 PASS**.
- Focused export/security/503 tests: **25/25 PASS**.
- Real isolated Docker + migrated PostgreSQL/WeasyPrint: **7/7 PASS**, including the new **250/251** case.
- Full server: **376 pass / 0 fail / 1 skip** (377 total). PostgreSQL: **218/218 PASS**. API: **269/269 PASS**.
- TypeScript and React build: PASS; official 503 and `OFFICIAL_REPORTS_RELEASE_APPROVED=false` verified.
- Uploaded CI-only image/font provenance and synthetic PDF + raster samples as separate 7-day workflow artifacts; human visual approval remains **PENDING**.
- Two material limitations remain: CI image ID is *not* a production registry digest, and extracted PDF markers do *not* prove visually correct Arabic shapes, punctuation or page clipping. 11 separately reported Windows Chromium/PDF local failures in 24-C are **not** magically green by this Linux job.

**Documentation-only follow-up:** confirm the PR's final exact HEAD and subsequent CI after updating this file. Keep this PR **DRAFT / UNMERGED**, no host deployment or report activation. Phase 24-E remains **TECHNICALLY_VERIFIED / HOST_UAT_PENDING**; institution-ready acceptance is **NO_GO**.
