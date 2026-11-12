# Local staging administrator — review candidate

## Plan and protected boundaries

- Owner: CHAT; branch `review/local-staging-admin-20261112`.
- Base: `07ed019fe022ea0f5d45c066adf0b6ba431f1aaf` (`phase-10-api-data-layer`).
- Classification: HYBRID. Files and local guard checks here; isolated PostgreSQL/HTTP and Windows DPAPI operational acceptance must have actual evidence before acceptance.
- Add an independent attended test-only command, fixed synthetic identity, strict destination validation, native encryption, forced secret change and atomic native audits.
- Require `NODE_ENV=test`, exactly `127.0.0.1:5433/alsqaya_staging`, a persistent key and explicit confirmation. Refuse any existing user, synthetic identity collision or migration mismatch.
- Do not call/change institutional `firstAdminBootstrap`, auth/RBAC or official report routes. No migrations, reset, recovery or automatic retry in the provisioning command. Never access `alsqaya_dev`.
- Keep a Windows DPAPI CurrentUser key outside Git; load it before a fresh Node process. Provide a loopback-only Express launcher using the existing application.
- Checks: strict pre-connect rejection; disposable PostgreSQL atomicity/audit failure/concurrency; real HTTP login, forced change, bad credentials, unauthorized access and report 503; TypeScript/build; independent security review.
- Acceptance distinguishes written, locally tested, container-tested, CI-verified, merged and usable. No deployment/merge is authorized. Review files/commands before local key creation or provisioning.

## Execution evidence

2026-11-12, verification performed in the review worktree on the base SHA above. The user subsequently authorized committing and publishing only this review branch, without merging or running provisioning. The candidate commit is identified by this file's Git history; no PR or merge is part of publication.

| Check | Actual result |
|---|---|
| `node --import tsx --test server/tests/localStagingAdmin.test.ts` | PASS: 6 tests, 0 failures; destination/key/env/TTY/argument rejection, actual redirected CLI, socket-tripwire confirmation/cached-key refusal |
| `npm run lint` | PASS |
| `npm run build` | PASS; existing bundle-size advisory |
| PowerShell parser on `scripts/local-staging.ps1` | PASS; this is syntax validation, not DPAPI provisioning |
| `git diff --check` | PASS |
| Baseline comparison of auth, report route/release gate and migrations | No changes against approved `07ed019...` |
| Container PostgreSQL 17 / real Express HTTP suite | WRITTEN, NOT RUN: Docker absent on this host |
| DPAPI key creation/reload under operator Windows profile | NOT RUN; no persistent key created |
| Independent security review | Static review completed by `security-sentinel`; no blocking security finding. Operational PostgreSQL/DPAPI gates remain open |
| CI / merge / production acceptance | Not performed / not merged / not approved |

Only locked dependencies were installed in the review worktree (`npm ci --ignore-scripts --no-audit --no-fund`). No PostgreSQL connection, migration, user-device configuration, persistent secret, service or institutional account was created. Remote branch HEAD was checked with `git ls-remote` and matched the approved SHA at implementation time; no CI result is claimed for this candidate.

Independent reviewer sessions: security `ses_e30ceaa48ffe1X4EcL2vQwQE5Q`; test design `ses_e30ceaa30ffePAvrD5IhD2wJ2w`. The tester identified weak assertions for race serialization, injected audit failure and blocked-account response, plus signal-exit cleanup. These were corrected; migration-denial, wrong-key restart, child-crash cleanup and connection-tripwire tests were added. Static follow-up marked all four original findings addressed; its remaining request to protect the actual redirected CLI subprocess with a socket tripwire was also implemented. The CLI tripwire blocks all TCP attempts, allowing only tsx's local named-pipe loader IPC; the core negative subprocess blocks all socket attempts. The initial strict CLI tripwire caught that loader IPC (test-only false failure); after narrowing the IPC allowance the final suite passed 6/6. Static review is not container execution. TypeScript was rerun successfully after the integration-test corrections; frontend build was not repeated because application/build inputs did not change.

## Files

- `scripts/localStagingEnvironment.ts`: exact destination/key/env/console guard; rejects all URL query options and `PG*` overrides.
- `scripts/localStagingAdmin.ts`: independent command; native `generateSecret`, `encryptSecret`, `recordAuditEvent`; fixed synthetic badge/name, no telephone; no existing staff adoption or password reset.
- `scripts/localStagingServer.ts`: existing Express application on **127.0.0.1 only**, with the same loaded key. This smoke-test launcher does not run scheduled jobs.
- `scripts/local-staging.ps1`: explicit DPAPI key initialization or loading, hidden DB-password prompt, process-only environment restored afterward.
- `server/tests/localStagingAdmin.test.ts`: safe pre-connect checks.
- `server/tests/integration/localStagingAdmin.ts`, `ops/local-staging-test.Dockerfile` and its `.dockerignore`: disposable migrated database and real HTTP acceptance.
- This document, execution backlog and inventory addendum: scope/evidence/open gates.

## Review first: disposable acceptance (no user database)

Run only after reviewing the Dockerfile/test runner. Building requires image/package downloads. The runtime has **no external network, published port, host mount or host database credentials**. It creates a fresh PostgreSQL cluster inside the container, binds its private loopback port 5433, creates `alsqaya_staging` and applies 15 migrations there. The test refuses to run as an ordinary host script.

```powershell
docker build -f ops/local-staging-test.Dockerfile -t alsqaya-staging-admin-test .
docker run --rm --network none alsqaya-staging-admin-test
```

The disposable test intentionally creates/drops test constraints and truncates synthetic tables **inside its own new cluster**. Do not run it against any existing PostgreSQL installation. No privileged mode is needed. The container/image is a test harness, not a deployment image.

Expected final marker: `LOCAL_STAGING_DISPOSABLE_HTTP_PASS`, with exit code 0. Preserve the full result and `git rev-parse HEAD`/review diff with it. Assertions cover:

1. Confirmation and migration-ledger refusal; either identified employee/account audit constraint failure rolls back all writes.
2. Synthetic identity collision and any existing user rejected; simultaneous creation yields one account and two creation audits, and an ordinary concurrent writer blocks provisioning until its committed user causes refusal.
3. Native encryption/decryption, required secret change, no plaintext key/code in user/audit rows.
4. Real HTTP bad credentials and missing/forged sessions rejected; initial login succeeds but resources reject until secret change; old secret/session invalidated.
5. Fresh Express process reuses the key successfully; a wrong key gives `503 SECRET_UNAVAILABLE` without modifying ciphertext; restoring the key restores login. Authorized employee listing works; official report paths remain `503 REPORTS_UNAVAILABLE`. Already-crashed child cleanup is exercised.
6. Blocked admin cannot log in or be replaced by rerunning the tool; secrets absent from server output.

## After review/acceptance: operator commands on Windows 10

Use **Windows PowerShell 5.1** as the same ordinary Windows user for all commands (the ACL creation API is .NET Framework). Use a private attended terminal without transcript, screen recording or output redirection. Do not type credentials into source files, command arguments, shell history, `.env`, tickets or Git. Close any running staging Express process before provisioning.

The database must already be migrated by a separately authorized procedure. Provisioning only verifies every migration version/checksum against this checkout; it never migrates or creates a database. The DB role needs access to the staging schema, table locks, employee/user creation and audit inserts. Do not grant it access to `alsqaya_dev`.

```powershell
# From the reviewed checkout; dependencies must already be installed.
$env:NODE_ENV = 'test'

# Once only, AFTER review. Creates a key, not an account/database.
.\scripts\local-staging.ps1 -Mode InitializeKey

# Separate explicit action. Prompts for DB username/password, then confirmation.
.\scripts\local-staging.ps1 -Mode Bootstrap

# Reuses the same DPAPI key before Node imports config/vault.
$env:PORT = '4000'
.\scripts\local-staging.ps1 -Mode Server
```

Key-creation confirmation: `CREATE LOCAL STAGING KEY`.

Database-write confirmation: `CREATE SYNTHETIC ADMIN IN alsqaya_staging`.

The destination is fixed to `127.0.0.1:5433/alsqaya_staging`; both client configuration and the connected server identity are checked. `NODE_ENV=production`, `alsqaya_dev`, `localhost`, alternate ports, URL parameters, `PG*` environment variables, missing keys, pipes and CI CLI use are rejected. Clear conflicting variables in the shell yourself only after inspecting them; the tool never silently clears operator settings.

The persistent key is `%LOCALAPPDATA%\ALSQAYA-Staging\auth-key.dpapi.xml`, **outside Git**, encrypted with Windows DPAPI CurrentUser, with a current-user-only directory ACL. Initialization refuses an existing directory/key. Bootstrap/Server never generate replacement keys. Both launchers receive its decrypted value in the child process environment; it is not printed or stored in PostgreSQL. Do not launch ordinary Express without loading the same key: the existing non-production fallback is ephemeral and cannot decrypt persisted accounts after restart.

## Manual verification after explicit operator execution

- Login identifier: `SYNTHETIC-STAGING-ADMIN`; use the randomly generated code shown privately once after commit.
- `POST /api/auth/login` with `{identifier, secret}` must return a session and `mustChangeSecret: true`.
- An authenticated data request before changing the code must be 403. `POST /api/auth/secret` with `{currentSecret, newSecret}` and the session must succeed. The old session is revoked; log in again with the new code.
- Stop/restart with `-Mode Server`; the new code must still work. Wrong code, missing session and forged session must be rejected. Authorized `GET /api/employees` should succeed.
- Authenticated `GET /api/reports` must remain HTTP 503 with `REPORTS_UNAVAILABLE`. The container also checks catalog/run/export paths.
- Verify one linked synthetic employee/admin and two provisioning audit entries tagged `synthetic_local_staging_admin`; subsequent auth actions produce their own native audit records. Do not dump secret columns into review logs.

## Remaining risks / stopping conditions

- This is **PARTIAL / REVIEW CANDIDATE**, not runtime-accepted until disposable HTTP and operator DPAPI checks pass and independent review is complete. A URL/name gate cannot prove all existing employee data is synthetic; the operator must designate the staging DB correctly.
- DPAPI protects the file at rest for this Windows profile/machine; local administrators/processes under that identity can access process memory/environment. Losing the profile/key loses decryption capability. Preserve an operator-approved protected backup; no key rotation/recovery is added here.
- The temporary code appears only after commit. If the terminal closes or output is lost, treat the outcome as unknown and inspect audit/account state. Reruns refuse existing users; no automatic reset or rollback is supplied.
- No phone is attached, so this synthetic admin has no phone-based OTP recovery. Never replace it with real personnel data for convenience.
- The account has the existing full `admin` role inside staging. This does not authorize institutional provisioning or report release. Test HTTP is loopback-only, without production HTTPS/deployment certification.
- Rollback before use: do not run the candidate files. After use: stop staging and follow a separately reviewed disposal/restore procedure for **staging only**; do not delete audit history or regenerate the key to recover access.
