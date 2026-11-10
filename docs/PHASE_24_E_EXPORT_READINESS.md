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

### Result

Pending implementation and exact-SHA verification. Update this section after CI.
