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
- [ ] Merge exact C/D/E heads into this new branch only; preserve source history and record conflicts.
- [ ] Add candidate-only Linux CI using existing acceptance commands; record full server/DB/API totals separately from focused tests.
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
