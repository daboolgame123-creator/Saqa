# Phase 24-G — Test-only application/API readback of a restored database

**2026-11-10 / Owner: CHAT / Classification: HYBRID** — code + synthetic CI here; institutional host acceptance remains EXTERNAL. This is an independent *preproduction validation slice*, not an extension of the owner-approved production deployment scope.

## Plan (documented before source changes)

**Input candidate:** 24-F integration commit `dd080a9bd996f8edd9cd35c0cdb1d845ec9d960f` (Draft PR #56). Create a new branch and a Draft stacked PR, **do not** alter the 24-F branch, original PRs #53-55, application routes, schemas, authorization or the official report release gate.

The 24-D isolated exercise `ops/test_phase24_pg_integration.py` already creates an entirely synthetic migrated PostgreSQL source, inserts one book, one file, one ViewLog and one AuditLog, creates and verifies a backup, restores to an EMPTY database named `alsqaya_restore_test_ci`, then corrupts a backup file to verify rejection. Missing proof: querying the restored metadata and real restored file through **the actual Express application and authorization stack**, rather than by direct SQL/file checks alone.

### Intended bounded changes

1. Add a strictly opt-in test-only readback hook **after successful isolated restore and before intentional bundle corruption** in the existing synthetic recovery exercise. No change to the backup/restore utility or production code.
2. Add a Node/TypeScript integration probe using `createPool`, `startApiTestContext`, `FileStorage` and actual login/session/authorization. Point it *only* at `RESTORE_TEST_DATABASE_URL` and the newly restored attachment directory, using temporary test-only accounts. Verify an unauthenticated request returns 401, admin can read the restored book, attachment metadata and original PDF bytes with integrity verified, unauthorized employee cannot read an administrative record or its attachment, original ViewLog/AuditLog records survive, and reports remain HTTP 503.
3. Add a dedicated GitHub Actions job with disposable PostgreSQL 16 service, authorized synthetic migrations 1–15, empty restore DB, `NODE_ENV=test`, test-only guard, and an artifact containing evidence with no secrets or real data. Prefer a single focused execution over repeating the full Phase 24-F suite.
4. Report SHA/CI results and limits. If a test fails, fix the exact cause, re-run on the new SHA and retain no claim until verified.

### Protected boundaries / no-go

- No institutional DB or data, no direct access to institutional attachments, no production restore, no new API routes or privilege changes.
- Explicit fail-closed guards: `NODE_ENV=test`, source and restore DBs distinct, restore DB name prefixed `alsqaya_restore_test_`, isolated localhost CI only.
- Preserve `OFFICIAL_REPORTS_RELEASE_APPROVED=false` and official HTTP `503 REPORTS_UNAVAILABLE`.
- App/API readback of a disposable restored fixture is *not* a comprehensive production disaster-recovery drill or acceptance of the target institutional host (backups, encrypted off-host storage, image digest, licensed fonts and human Arabic PDF signoff remain unverified).

**Status before implementation: PLANNED / NOT YET TESTED**.
