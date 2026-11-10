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
- [x] Verify TypeScript/build, own acknowledgement SQL/HTTP/XLSX isolation, synthetic empty-database restore and attachment/audit integrity, Docker PDF 250/251 parity, failure/corruption/cancellation and cleanup.
- [x] Independently review integrated security boundaries; fix the demonstrated CI cleanup assertion defect.
- [x] Update C/D/E evidence, backlog and inventory; open Draft integration PR #56 and verify code-checkpoint Actions.
- [x] Decide READY_FOR_PREPROD_REVIEW for the verified technical candidate; institutional release remains NO_GO.
- Final delivery gate: revalidate the documentation-only final head and record its exact SHA/run/job evidence in PR #56, without another self-referential documentation commit. No merge/deployment is authorized.

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

The corrected Bash assertion passed three executed mock outcomes: failed inspection rejects, successful empty output accepts, successful nonempty output rejects. Reviewer follow-up independently confirmed static closure at workflow lines 197–198.

## Verified integrated code checkpoint

**SHA:** `2f9f9c26b302cfdc739b846406c0b07cdb75e5f9`.
**Draft PR:** [#56](https://github.com/daboolgame123-creator/Saqa/pull/56), based on `phase-10-api-data-layer`; source PRs #53/#54/#55 remain unmerged.
**Primary exact-head CI:** [42808640462](https://github.com/daboolgame123-creator/Saqa/actions/runs/42808640462), all three jobs SUCCESS. Raw authenticated job logs and artifacts were downloaded and examined, not merely the overall conclusion.

| Executed suite | Pass | Fail | Skip | Evidence |
|---|---:|---:|---:|---|
| Full server, including real Chromium executable | 376 | 0 | 1 | job `129804141273`, `server.log` |
| Dedicated guarded P0 plus preflight | 1 | 0 | 0 | same job, `p0.log`, `p0-preflight.log` |
| Full migrated PostgreSQL | 226 | 0 | 0 | same job, `db.log` |
| Full authenticated API / attachment tests | 269 | 0 | 0 | same job, `api.log` |
| Dedicated 24-C owner SQL / HTTP / XLSX | 8 | 0 | 0 | same job, `24c.log` (also in full DB) |
| Existing owner/export/release-gate regressions | 15 | 0 | 0 | same job, `owner-gate.log` (overlaps full server) |
| 24-D corruption / refusal unit tests | 21 | 0 | 0 | job `129804140824`, `24d-unit.log` |
| 24-D migrated PostgreSQL + attachments restore | 1 scenario | 0 | 0 | same job, `24d-roundtrip.log`; not a unit-test count |
| 24-E image/font manifest validation | 6 | 0 | 0 | job `129804141330`, `24e-manifest.log` |
| Fixed RTL template | 6 | 0 | 0 | same job, `template.log` |
| Synthetic container-inspect policy | 5 | 0 | 0 | same job, `container-policy.log` |
| Real Docker/PostgreSQL/XLSX/PDF, 250/251, cancellation/timeout | 7 | 0 | 0 | same job, `24e-real-docker.log` |
| Actual SIGKILL orphan and independent reaper | 1 | 0 | 0 | same job, `crash-recovery.log`; final managed-container check passed |
| Pilot real-browser acceptance | 5 scenarios | 0 | 0 | regression job, `browser-pilot.log`; not node:test totals |
| C13 real-browser/session/PostgreSQL/XLSX | 6 checks | 0 | 0 | regression job, `summary.json`; not node:test totals |

TypeScript and React build PASS on Linux and local Windows. The sole server skip is `isolated preload rejects network and real DB calls before connecting`; the dedicated guarded run passed it. No required C/D/E test skipped. Do not sum overlapping focused/full tests as distinct cases. Existing Vite chunk-size and concurrent cache-save messages are not test failures.

The restored database was not exercised through the application/API; browser/API suites use separate fixtures and do not establish restored-application readiness. The D scenario proves the documented synthetic database/file roundtrip and integrity checks only.

Independent tester session `ses_e3aba7379ffeqiAh7J2D6Qy5fq` reconciled the raw three-job logs and manifests against this table, source SHA and artifact upload records. It confirmed actual `/usr/bin/google-chrome` render, precise P0 skip handling, C/D/E/cancellation/crash results and bounded READY_FOR_PREPROD_REVIEW, conditional on final documentation-SHA CI. It did not execute tests or recompute archive hashes. Initial external-directory access was denied; unchanged logs/manifests were copied into ignored `.continue/phase24-f-evidence-42808640462` for successful in-workspace review.

Same-checkpoint additional CI also succeeded: F PR run `42808748951`, C `42808748538`, D `42808748295`, E `42808748340`. The primary F push run above is the detailed evidence source; C/D/E PR workflows may check out GitHub's merge ref, so their metadata alone is not substituted for F's explicit exact-head checkout.

### Evidence artifacts (14-day retention, synthetic only)

- Regression artifact `13761931718`, SHA256 `1ab02f086d9acf89150cb866c8a4759b3395b453f149ee91633ed0ef2543b4cb`.
- Docker/PDF artifact `13761581173`, SHA256 `d9efe6f1b795783dfd4c54e70ae806f14a900b0a6a521b823a5a5243e75478b0`.
- Recovery artifact `13760532201`, SHA256 `f58cb566706173ffe8c18c61b255afbb31d949448bb101c179d9ec5ce534fb3e`.
- Downloaded evidence root: `C:\Users\dell\AppData\Local\Temp\opencode\phase24-f-42808640462` (local convenience, not a portable acceptance URL).
- Inspected provenance manifest matches source SHA above and retains `CI_SYNTHETIC_ONLY_HOST_NO_GO`; registry digest is null and font-license/host/visual/release approvals are false. This run's local image ID is `sha256:91b80cd609fef171f64121f79e25ac1a1eb4e33434250d5a7a61dc60ea19174c`.
- Actual font: DejaVu Sans package `2.37-6`, SHA256 `abdc775b21b1bc470d50c97e790d276f2054b7504e56e5bd3e64f48d68582322`. License-evidence hash is inventory, not licensing approval.
- C13 manifest explicitly records actual migrated PostgreSQL, real sessions, six browser checks, `HTTP_503_UNCHANGED` and `candidateMountedInProduction=false`.
- PDF/raster artifacts are synthetic first/middle/last samples for the existing employee/admin/acknowledgement fixtures. The 250/251 proof is the executed integration assertion; its PDF is not separately retained as a visual-review artifact.

## Decision and remaining handoff

**READY_FOR_PREPROD_REVIEW** for this bounded, independently reviewed technical integration candidate, subject to final documentation-head CI recorded in PR #56. This is readiness to conduct preproduction review, not approval to expose reports, merge or deploy. **Institutional release remains NO_GO; Phase 23/24 operational acceptance remains OPEN.**

No new application defect was demonstrated. The only repair was CI cleanup failure propagation; its three Bash negative/positive outcomes passed and the independent reviewer confirmed closure. Source application files are exact imported C/D/E changes.

External acceptance remains: supervised institution-host isolation and restore/readiness drill; enforced offline writer quiescence; backup scheduling/retention/operation records, encryption, authenticated immutable off-host copies and key/configuration custody; reviewed production registry digest/dependencies/font license; target-host Docker crash watchdog; human Arabic shaping/bidi/punctuation/clipping review. Never claim these are proven by CI. Original gate, authentication and visibility policies remain unchanged.
