# Phase 24-FG — Unified preproduction technical candidate

**Date:** 2026-11-10  
**Owner:** CHAT (candidate orchestration); independently reviewed 24-G fixes by OpenCode/Terra.  
**Classification:** HYBRID (technical CI here, institutional acceptance EXTERNAL).  
**State before CI:** `CANDIDATE_CREATED / FULL_COMBINED_CI_PENDING / INSTITUTIONAL_RELEASE_NO_GO`.

## Plan before candidate execution

The agreed workflow is **plan → integrate → test → document** with no automatic merge, no institutional data and no production release. We do not reopen closed findings without evidence of a new blocker.

**Approved development target:** `phase-10-api-data-layer` at `d04ec7521ecbfa5a95bdff76cc94a52f0abb691a`, **not** `main`.

**Reproducible inputs:**

- Phase 24-F integration Draft PR #56 / head `dd080a9bd996f8edd9cd35c0cdb1d845ec9d960f`, including source 24-C/D/E changes and the three-job regression/recovery/Docker PDF workflow.
- Phase 24-G independent Draft PR #57 / accepted reviewed head `1ef66f794f4eb0cc11b5882f4e84bd3c6748b97d`, which already **descends from** 24-F. The GitHub compare `24-F..24-G` confirms `ahead=19`, `behind=0`, and merge base exactly the 24-F head. The development-base-to-24-G compare confirms `ahead=41`, `behind=0`, 24 changed files and merge base exactly the development base.
- The two Terra 24-G blocker rounds have been fixed and their final limited-scope re-review was reported `ACCEPTABLE`, **not** institutional acceptance.

## Candidate creation and checks

1. Create `integration/phase24-fg-unified-rc-20261110` **from the exact reviewed 24-G head**. This captures all 24-F plus 24-G commit ancestry; do not merge/rebase or edit the original #56 or #57 branches.
2. Add this provenance/decision document. Open a **Draft PR against `phase-10-api-data-layer`** so CI tests the **whole F+G candidate** and not only the stacked 24-G delta.
3. Require final-head full Phase 24-F jobs: regressions (server/PG/API, RBAC/owner/gate, browser), recovery (synthetic PostgreSQL + attachments), Docker/Arabic PDF worker & container lifecycle. Require final-head Phase 24-G job: 21 legacy backup cases, 15 local-guard cases, 4 separate audit/view evidence tests, restored PostgreSQL readback through authenticated Express API. Relevant workflows are triggered by the combined PR's changes to `docs/PHASE_24_F_INTEGRATION.md` and `docs/PHASE_24_G_RESTORED_API_READBACK.md` (their respective `pull_request.paths` filters).
4. Independently verify actual GitHub run conclusions and **checked-out SHA** in raw logs, distinguish CI head from GitHub's synthetic PR merge ref; capture only the correct final-SHA evidence. Record results in the **PR description or comments**, avoiding self-referential docs commits that change SHA.
5. If a job fails, diagnose and correct only the actual blocker **on this unified branch**, then retest the new final SHA. Do not claim it passed before evidence.
6. After all relevant jobs pass, verdict may be `FG_TECHNICALLY_VERIFIED / REVIEW_FOR_INTEGRATION`, **not a merge or deployment authorization**.

## Non-negotiable safeguards

- Do **not** change `OFFICIAL_REPORTS_RELEASE_APPROVED=false` or official `HTTP 503 REPORTS_UNAVAILABLE`, RBAC, API mount tree, schema, audit immutability or employee scope.
- Candidate-only 24-C own acknowledgments router remains **unmounted** by the production app. No rollout switches or environment overrides.
- No institutional data, production DB restore, external network credentials, or real attachment folders in any CI fixture.
- PostgreSQL URI loopback/exact-name matching is **not proof of physical server identity**; this CI does not certify actual institution network segmentation.
- No merge into `phase-10-api-data-layer` or `main`, no release, no deployment, no automatic closing of other PRs; those actions need distinct user authorization.

## Remaining EXTERNAL institutional gates, regardless of CI outcome

Human verification of Arabic PDF shaping/RTL/clipping, licensed font/image-digest approval on target host, backup encryption/off-host immutable copies and key custody, maintenance/write quiescence, operational restore procedure and time objectives, physical host/network/user acceptance, and a separately approved production migration/deployment runbook.

**Technical candidate completion is not institutional preproduction signoff or go-live.**
