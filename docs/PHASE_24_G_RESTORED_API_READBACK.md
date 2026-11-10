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

## Verified CI evidence

**Code SHA:** `8bcf30a97986c99213fb7fc17acd16b0a0cba8aa`.  
**[Focused CI run 42817813621 — SUCCESS](https://github.com/daboolgame123-creator/Saqa/actions/runs/42817813621)** — job `129835288285`, exact SHA checked out.

- TypeScript lint **PASS**. Legacy 24-D corruption/refusal suite **21/21 PASS**.
- Disposable PostgreSQL 16 service: migrations 1–15 applied only to `alsqaya_24_source`; target `alsqaya_restore_test_ci` was newly created EMPTY and restored with the existing guard. **No institutional connection**.
- **PHASE24_G_RESTORED_APPLICATION_HTTP_PASS** verified in job logs. Using the *actual restored target*, the same production routing/middleware/services in a loopback Express test app successfully performed authentication/login and read the pre-existing restored employee, book, attachment metadata, original PDF bytes and verified integrity; unauthenticated GET 401, employee book/file access 404, official report HTTP 503. Source snapshot ViewLog and AuditLog rows both present before test-only accounts were added.
- Existing backup/verify/restore + intentional corrupted-bundle rejection also **PASS** after API readback. The test account registrations modify only the disposable restored clone, never the original backup/source.
- No production application, RBAC, schema, HTTP route or release-gate changes. **Draft PR #57 is stacked on PR #56**; PRs #53–#56 remain unmerged.

**Limits:** This proves one synthetic restored snapshot can be read through the authenticated application and attachment service. It does not prove that pre-existing accounts and sessions in an actual institution backup would sign in, production multi-GB restore time, offline write quiescence, encryption/off-host retention, target-host Docker controls, visual Arabic PDF or institutional operational recovery. The original synthetic fixture has no user account; the app creates new test identities *after* restore to prove the real auth and RBAC pipeline. The audit/ViewLog rows are checked through PostgreSQL, not through a separately authorized audit UI.

**Decision:** `24G_TECHNICALLY_VERIFIED / HOST_UAT_PENDING / INSTITUTIONAL_RELEASE_NO_GO`; based on CI evidence at the above **code** SHA. Documentation-only changes require exact final SHA confirmation, without treating a text edit as new production approval.



## Terra independent security review — remediation plan recorded before edits (2026-11-10)

**Reviewer decision:** `CHANGES_REQUIRED` (blocking, no merge). The problems are inherited from the 24-D test harness / restore-test utility; the current CI used only synthetic loopback PostgreSQL, with no evidence of any institutional connection.

1. **Pre-write source validation:** before running *any* SQL or touching the backup utility, validate the disposable source and target URLs, `CI=true` and `NODE_ENV=test`. Source DB must be exact `alsqaya_24_source`; target must be exactly `alsqaya_restore_test_ci`; both on `127.0.0.1:5432`, with a dedicated test user, same nonempty credentials, and **no URI query/fragment/multihost/Unix socket or libpq connection redirection**. Reject invalid configurations before `backup.runner` is invoked. The harness must work with one—and only one—real disposable PostgreSQL service.
2. **Pre-connect restore target validation:** `restore_test` itself must reject remote PostgreSQL URI (even if name has the right prefix) **before first `psql` or `pg_restore`**, independently of the 24-G node probe. Continue to require explicit empty-target confirmation and check the actual connected DB name/emptiness.
3. **Negative, non-network tests:** prove invalid source and target values are rejected with a mocked runner that asserts *no call*, including remote address, wrong DB, wrong host, wrong credentials, URI query redirection, and same source/target. Preserve the 24-D unit cases with safe synthetic local targets.
4. **Acceptance:** focused exact-SHA Linux CI must pass the existing backup/restore and real authenticated readback. The fix remains only on independent Draft PR #57 and needs **fresh Terra review** before merging. Target-host recovery/release stays NO_GO.



## Implementation and first exact-head validation after Terra fixes

**Implemented (code SHA `3b994fe5f789440350bd418ebe0964781d563035`):**

- `ops/phase24_backup.py` now enforces `NODE_ENV=test`, exact IPv4 loopback `127.0.0.1:5432`, a dedicated `alsqaya` identity with nonempty password, a valid local test database name, and no URI query or fragment **before the first restore-test `psql`**. The existing explicit empty-target confirmation and actual connected-database/emptiness tests remain in place.
- `ops/test_phase24_pg_integration.py` now validates **both** source `alsqaya_24_source` and target `alsqaya_restore_test_ci` under `CI=true` and `NODE_ENV=test` with matching test credentials **before any seed SQL**.
- `server/tests/integration/phase24GRestoredApiReadback.ts` uses the same exact database/localhost restrictions and requires the recovered files to be in an OS-temp `alsqaya-24d-ci-*/restored` directory.
- New `ops/test_phase24_ci_guard.py` exercises **15** pure synthetic/no-network cases; negative cases assert the mocked PostgreSQL runner **was never called**. Existing 24-D mock fixtures were changed to use valid test-only loopback URIs.

**Test evidence (GitHub Actions):**

- [24-G focused run 42821754967](https://github.com/daboolgame123-creator/Saqa/actions/runs/42821754967) — **SUCCESS**, job `129848754295`. Raw logs verified exact code checkout; 21/21 24-D Python tests, **15/15 new guard tests**, TypeScript lint, migrated synthetic PostgreSQL backup/restore + recovered authenticated Express API marker `PHASE24_G_RESTORED_APPLICATION_HTTP_PASS`; official 503 gate check.
- [24-D companion run 42821755255](https://github.com/daboolgame123-creator/Saqa/actions/runs/42821755255) — **SUCCESS** with existing 21/21 backup tests and real temporary PostgreSQL recovery test. This PR workflow checked out GitHub's merge ref, so the 24-G push run above is the **exact-head** proof.
- No production DB access, institutional restore, actual permission modifications, or HTTP report activation performed or claimed.

**Decision after first CI:** `REMEDIATION_TESTS_PASS / INDEPENDENT_SECURITY_REREVIEW_REQUIRED / RELEASE_NO_GO`. This remains a stacked Draft on 24-F. The underlying issue also affects the original 24-F test tool unless this guarded follow-up is included; **do not promote or merge PR #56 in isolation**. Institutional host acceptance remains external.

