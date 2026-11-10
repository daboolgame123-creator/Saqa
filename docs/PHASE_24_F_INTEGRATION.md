# Phase 24-F — final integration candidate

## Plan recorded before integration (2026-11-10)

- Owner: OpenCode Build, explicitly assigned by the user; parallel CHAT work unknown.
- Classification: HYBRID; technical verification via local tools/Linux Actions, institutional acceptance EXTERNAL.
- Branch: `integration/phase24-f-preproduction-candidate-20261110`.
- Approved base: `d04ec7521ecbfa5a95bdff76cc94a52f0abb691a`.
- Inputs verified against live GitHub PR heads before editing:
  - #53 / 24-C: `68308777c672a028a5d96f726733ab6d9cc2127a`; CI `42786670290` success.
  - #54 / 24-D: `265c2d23ba3e0d519749bd851db9354b74cd4c69`; CI `42788324145` success.
  - #55 / 24-E: `f9b035f7ffaa0e86d320d030a5db95bd1095ec21`; CI `42793809796` success.
- Source PRs remain draft/unmerged. Their CI does not verify the combined candidate.

### Checklist / completion criteria

- [x] Inspect policy, official plan, clean checkout, approved base and live PR/CI heads.
- [x] Merge exact C/D/E heads into this new branch only; all three merges conflict-free, no application-code edits.
- [x] Add candidate-only Linux CI using existing acceptance commands; full server/DB/API totals retained separately from focused tests.
- [ ] Verify TypeScript/build, own acknowledgement SQL/HTTP/XLSX isolation, synthetic empty-database restore and attachment/audit integrity, Docker PDF 250/251 parity, failure/corruption/cancellation and cleanup.
- [ ] Independently review integrated security boundaries and test evidence; fix only demonstrated defects.
- [ ] Update C/D/E evidence, backlog and inventory; open Draft integration PR and verify Actions on final SHA.
- [ ] Decide READY_FOR_PREPROD_REVIEW or NO_GO with exact evidence; stop without merge/deployment.

### Scope and protected boundaries

Integrate only the supplied changes plus this plan, evidence documentation and consolidated CI. No schema, permission, authentication or user visibility change. `OFFICIAL_REPORTS_RELEASE_APPROVED = false` and official `503 REPORTS_UNAVAILABLE` remain mandatory. C's router stays test-only/unmounted. Synthetic fixtures only; never restore institutional databases. No writes to source branches, `main` or `phase-10-api-data-layer`.

### Verification / operational limitations

Windows host has Node/npm but no Docker or GitHub CLI on PATH (observed command discovery); Linux Actions is the intended Docker/PDF verification environment. GitHub API and Git fetch are reachable. Exact test invocations and results will be recorded after integration. No unrun result is claimed.

Institutional server sign-off, human Arabic bidi/clipping review, published immutable Docker provenance/font approval, backup key custody/encrypted off-host copies/retention/scheduling and production restore procedures remain external. CI cannot close those gates or Phase 23/24 operational acceptance.

Rollback: discard the candidate via a separately authorized action; protected/source branches are untouched. Each integration merge is a separate checkpoint.

## Executable verification map

Workflow `.github/workflows/phase24-f-integration.yml` checks out the exact head on push/PR, uses read-only repository permissions, and retains separate logs for 14 days. Three isolated Ubuntu jobs: full regressions plus C/browser; PostgreSQL 16 D recovery; E real Docker/PDF and C4 process-crash recovery. The user explicitly authorized migrations 1–15 in disposable synthetic CI databases for this task and necessary failure reruns.

- Full suites: `npm run lint`, `npm run build`, `npm run test:server`, `npm run test:db`, `npm run test:api`.
- C: `node --import tsx --test server/tests/db/report24COwnCandidate.test.ts`; existing owner/export/gate tests also run separately (overlapping counts are not summed as unique tests).
- D: `python3 -m unittest discover -s ops -p test_phase24_backup.py -v`; `python3 ops/test_phase24_pg_integration.py` after disposable migrations and creation of an empty `alsqaya_restore_test_ci` database.
- E: manifest unit tests and `node --import tsx --test server/tests/integration/reportC2RealWeasyDocker.integration.ts`; actual-start cancellation and timeout cleanup included. Real SIGKILL orphan/reaper test runs separately with `C4_DOCKER_BIN`.
- P0's conditional normal-suite skip gets its dedicated guarded preload/preflight invocation. Actual Chromium executable is required before the full server suite (avoids silent absence of real-render coverage).
- Existing real pilot and C13 PostgreSQL/browser UAT run with pinned CI-only Playwright; C13 acceptance manifest is required.
- Historical experimental alternative-renderer/comparison probes and intercepted-browser-only C7c UAT are not claimed run by this workflow. Actual Docker worker, actual Chromium render, and real PostgreSQL browser paths are explicitly exercised.
- Architect planning session `ses_e3b09c12affe8uNHUPWhsd5ehi` provided a read-only checklist; it could not see fetched C/D/E files in its checkout. Build inspected the actual merged files and mapped commands above. This planning is not independent runtime verification.

## Pre-CI checkpoint

Integration merges: C `60e9b7eaad9516124dcb5dcf54aff1d139fc06ec`, D `216980d998355b77462827f4490d87fa394d73a0`, E `87a7fe65ab01ad95213c321950b849344ff89845`. Each source merge-base is exactly the approved base.

Local Windows Node v24.21.0: TypeScript/build PASS (existing Vite chunk-size warning); owner/gate tests 15 pass, 0 fail/skip; guarded P0 preflight PASS and dedicated P0 1 pass, 0 fail/skip. Linux CI remains required for comprehensive evidence.

Independent static review: reviewer `ses_e3ad037e0ffexf6cGxa1g9D20D` and security-sentinel `ses_e3ad03801ffeY64IRmlglYrrVi`. Security review found no introduced reachable application-security blocker; confirmed detached routing, owner-bound SQL/XLSX, backup protections and unchanged false/503. Both identified the same CI-only false-green cleanup assertion: Docker command substitution hid a failed inspection. Fixed by assigning output separately before testing emptiness. Build reproduced the old assertion incorrectly exiting 0 on a failing mock Docker command and the replacement exiting 1. No application-code repair was necessary. Reviews were static, not independent runtime tests.
