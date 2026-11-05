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
