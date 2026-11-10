# Phase 24-H — Operational acceptance planning (PREPARATORY ONLY)

**Date:** 2026-11-10  
**Classification:** `HYBRID / WAITING_EXTERNAL`  
**Authoring owner:** CHAT (documentation); institutional operators/administration (live host acceptance).  
**Exact inherited development SHA:** `07ed019fe022ea0f5d45c066adf0b6ba431f1aaf` — PR #58 merged into `phase-10-api-data-layer`. No code changes or production release.

## Plan recorded before acceptance package editing

1. Read current `ALSQAYA_PLAN.md` and `EXECUTION_ENVIRONMENT_POLICY.md` as controlling requirements. Gather explicit 24-D offline backup assumptions, 24-E CI-only Docker/font provenance and Arabic PDF limitations, plus F/G unified CI evidence.
2. Create one **operational acceptance matrix** describing the precise environment, authority, evidence, pass/fail and stop criteria for host/network/service containment, backup/restore, renderer and access control. Mark every unobserved institution result `UNVERIFIED`, never `PASS`.
3. Create a compact **human visual Arabic PDF UAT worksheet** for synthetic documents only, including original page/text comparison, RTL ordering, numerals, mixed Latin/Arabic and pagination. Required reviewers and evidence fields must not be prefilled with invented results.
4. Update only the live execution backlog with the actual **merged development SHA**, status and remaining EXTERNAL tasks; ensure stale Phase 24-F Draft status is visibly superseded rather than silently erased.
5. Open a **Draft / NO MERGE** documentation-only PR, verify its diff is only intended docs/backlog, and leave host deployment and all release gates untouched. Do not claim CI approval on documents or institutional host readiness.

## Non-negotiable boundaries

- No institutional server access, no IP scanning, credential collection, migration, app deployment, live PostgreSQL restore, real attachment copying, or production file modifications.
- The `ops/phase24_backup.py restore-test` CLI is **synthetic-only** and guarded to dedicated loopback PostgreSQL, not a production restore tool. Do not try to bypass its guard to conduct a live drill. Any future approved production recovery must use a separately reviewed runbook/tool.
- No release, merging to `main`, route mounting, permission changes or disabling `OFFICIAL_REPORTS_RELEASE_APPROVED=false` / `HTTP 503 REPORTS_UNAVAILABLE`.
- Operational decisions about exact server inventory, network reachability, owners, maintenance window, backup retention, encryption and `RPO/RTO` are institution-specific and remain **TBD** until explicitly approved. Do not make them up.
- Synthetic GitHub Actions evidence may support `TECHNICALLY_VERIFIED`, not `INSTITUTIONAL_ACCEPTED`. Human Arabic PDF rendering and physical host/credential controls cannot be tested solely from GitHub.

**Completion for this preparation only:** two reviewable documents and backlog, bounded Draft PR with doc-only diff. **Phase 24 operational closure:** `NO_GO` until real authorized signoffs and evidence are supplied.
