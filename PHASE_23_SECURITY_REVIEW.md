# Phase 23 — P1c/P1d security hardening & independent verification track

**Checkpoint:** 2026-11-05. **Branch:** `development/phase-23-wip-20261105`.

## Scope and threat model

Review the reporting boundary without enabling its HTTP endpoint:
- Session identity may not be replaced with `filter.employee` or untrusted role/scope data.
- Distinct book visibility, personal-record ownership, and request ownership must be enforced in SQL, not in post-query JS or UI.
- A client-controlled filter cannot widen data access or inject SQL.
- All disabled report paths must remain HTTP 503 for authenticated authorized actors; unauthorized sessions must fail at authentication.
- DTO responses must not silently expose internal, uncontracted identifiers.

## Findings and preventive corrections

1. **P1d builder accepted internally inconsistent employee access contexts.** Previously a direct caller could supply `role=employee` but a forged `kind=all` request/personnel scope, causing the *exported SQL builder* to construct unrestricted SQL. This did not provide an HTTP exploit because the production repository rejects all employee report reads and the router is 503. The builder now validates both independent owner scopes against the session identity; privileged accesses are checked through the existing guard.
2. **P1d projected `employeeId` beyond the declared `ReportRow` DTO.** The service currently forwards raw rows, so this internal property could appear in a future HTTP response. Removed this uncontracted projection from all four P1d report sources. IDs used for filtering remain bound server-side.
3. **Mismatched report type between SQL selector and filter.** Direct repository/builder calls now reject contradictory `reportType` values instead of silently applying the wrong report filter set. HTTP already validates this but repository-level consistency prevents future internal misuse.
4. **Potential SQL injection via filter values:** all supported source predicates are passed as PostgreSQL bound parameters. Added real SQL attempts with quote/comment/operator payloads against all four sources to prove they do not alter WHERE or owner scope.

## Tests added

- Extended `server/tests/db/reportPersonnel.test.ts`: forged and crossed owner scopes, invalid privileged scopes, parameterized injection probes, no internal identity field in output, and mismatch denial.
- Added `server/tests/db/reportSecurityHttp.test.ts`: real Express app with test-only migrated PostgreSQL, real registered accounts/sessions, every report type and misleading query rejected by 503, HTTP method/subpath gate, missing/invalid session rejected with 401, and a spy proving the report service is never reached.
- Workflow extended with HTTP security step. **Initial checkpoint: pending actual CI results; green status must be confirmed from logs.**

## Remaining boundaries / no release approval

- **`/api/reports` 503 remains mandatory.** All employee report reads through `ReportApiService` and `PgReportRepository` remain denied even though the internal query builder is tested.
- No production database, schema, auth role, permission or client UI changed. HTTP test uses synthetic accounts only.
- Institutional timezone has not been approved/configured; date filters without it fail closed.
- Full N1 dedicated guarded real HTTP/SQL suite is a separate test and is not replaced by the above.
- Full report implementation is still incomplete (unresolved researchers/professors/situation, ViewLog, summary/export, approved source mapping). This is a focused security review, not Phase 23 completion or production authorization.

## Executed verification — GitHub Actions run 42070659393

- **Commit verified:** `e8997e15458c50b9213c96f7a3e128b89cfe005e`.
- **Result:** [GitHub Actions run 42070659393](https://github.com/daboolgame123-creator/Saqa/actions/runs/42070659393) completed **SUCCESS**, all workflow steps passed.
- `npm ci`, `tsc --noEmit`, and Vite production build passed.
- Report P0/P1b/P1c in-process regression: **11 passed, 0 failed, 1 skipped** (special opt-in network preflight).
- N1 personnel fail-closed unit regression: **7 passed, 0 failed**.
- P1c migrated PostgreSQL book tests: **5 passed, 0 failed**.
- P1d migrated PostgreSQL personnel tests: **8 passed, 0 failed**. This includes forged access contexts, cross-wired owner IDs, SQL injection values, and absence of extra `employeeId` from results.
- New real HTTP route security test against fresh test-only PostgreSQL and actual login sessions: **3 passed, 0 failed**, including 503 for authorized roles, service non-reachability, 401 for no/invalid token.
- **Total: 34 passing cases, zero failures, one skipped**, plus TypeScript and Vite success. This is a **focused, assistant-performed security review** backed by tests, **not** a third-party security certification.
- The 503/employee-denial boundary remains intact. No production-report access may be enabled based only on these results.

## Follow-up recommendations

1. Before releasing reports: decide the institution's timezone, explicitly configure it on the server, and test day boundary handling.
2. Finish unresolved report sources, ViewLog/acknowledgment semantics and export authorization; preserve soft-delete and scope rules before aggregates.
3. Run a separate, guarded N1 end-to-end HTTP/SQL security suite in its required disposable Windows sandbox; current run executes N1 **unit** regressions, not its full guarded integration suite.
4. Require an explicit review/approval checkpoint before removing the global 503 guard or the employee report access guard. This document does not grant that approval.
