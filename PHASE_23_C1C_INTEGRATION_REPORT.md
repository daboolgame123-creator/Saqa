# Phase 23 — C1c-S2 combined temporary integration report

**Date:** 2026-11-07
**Branch:** `integration/phase-23-c1c-combined-20261107`
**Status:** READY FOR REVIEW (temporary integration only; no production/base merge)
**Classification:** HYBRID — code and CI verified here; Windows host-only checks remain environment-limited.

## References

- Six-part integration snapshot: `4f59aafbfe0ba896c0d30ea460166fa917b9ecb3`.
- PR #4 / C1c: `a24b48f02543a317bfcd231daeb4647d47c59b98`.
- Base branch (untouched): `development/phase-23-wip-20261105` at `9bcfe175ac0b245cb757a7b7baee9de234eca01b`.
- Integration merge commit: `c44ebebcc1b4259512025bbc0a4e06360031d6db`.
- Code/test SHA verified by CI: `3642099075203d958d7e4f15c5a7d2bbca4c8613`.

## Merge result

- PR #4 merged into the six-part snapshot with no textual conflict (`ort` auto-merged `server/tests/reportP0.test.ts`).
- C1c and C3 tests are both retained and pass: C1c incoming SQL/forgery tests, C1c migrated-PostgreSQL rows/count/XLSX tests, and the C3 filter/summary/export consistency tests.
- Only manual source edit: corrected a literal `\n` inside a comment in `server/src/authorization/reportAccess.ts`; no behavior change.
- Added one synthetic DB regression after independent review: active availability grants on `Administrative` and `DirectorOnly` incoming books must not make them visible to the employee, in rows, summary, or XLSX.

## Verification evidence

### Local Windows (Node 24)

| Group | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run test:server` | 276 tests: 264 pass, 11 environment failures, 1 skip |
| `npm run test:db` | 203/203 pass |
| `npm run test:api` | 245/245 pass |
| `npm run build` | PASS |
| Employee permission/scope files | 44/44 pass |
| Excel-focused export tests | 2/2 pass |
| Incoming DB + XLSX parity | 3/3 pass |
| C2 PDF worker/handoff | 13/13 pass |
| P0 preflight + isolated test | PASS (1/1) |
| C4 synthetic Docker-inspect policy | 5/5 pass |

The 11 `test:server` failures are **not counted as passes**: 8 in
`reportChromiumInternal.test.ts` reject the synthetic shell paths on Windows
(`Trusted absolute browser path required`), and 3 in `reportExport.test.ts`
cannot read `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`. Both files are
byte-identical to the six-part snapshot; these are host-environment failures.

### GitHub Actions (Ubuntu, Node 22)

Run `42355904984` on SHA `3642099075203d958d7e4f15c5a7d2bbca4c8613` completed
**SUCCESS**; all steps passed, including full server, migrated PostgreSQL, API,
build, employee scope, incoming XLSX parity, C2 PDF isolation, P0, synthetic
Docker policy, and the 503 gate check. The final documentation/test SHA is
re-gated by the same branch workflow.

## Security review

Independent read-only audit found **no BLOCKER and no HIGH**.

- Employee incoming visibility is bound to exact identity-derived scope:
  `PublicToEmployees` plus `SpecificEmployees` with a non-revoked grant for that
  employee; daily, deleted, outgoing, internal, `Administrative`, and
  `DirectorOnly` books are excluded.
- `filter.employee` only intersects with the authorized set; `section`/`source`
  fail closed; date/type/status values are parameterized. Forged contexts are
  rejected before SQL/connection.
- Summary and XLSX are derived from the same authorized `run()` rows; mismatched
  totals are rejected before rendering.
- `503 REPORTS_UNAVAILABLE` remains registered before the report controller.
  C1d owner-export and the official PDF worker are not imported by any route or
  startup path.

Residual items (not blockers): the access context is structural rather than
session-branded (LOW); production report repository timezone is unconfigured
(INFO, fail-closed); future-dated availability semantics are undefined (INFO);
the 503 CI grep is redundant because behavioral 503 tests already run.

## Preserved boundaries

- No merge into `main` or `development/phase-23-wip-20261105`.
- PR #4 branch and the six isolated branches were not modified.
- Reports HTTP remains 503; C1d and official PDF services remain unwired.
- All new fixtures use synthetic names only.

## Verdict

**READY FOR REVIEW.** The combined temporary branch is internally consistent,
security-reviewed, and CI-verified on the recorded SHA. It is not a production
release and must not be merged without the owner's explicit decision.
