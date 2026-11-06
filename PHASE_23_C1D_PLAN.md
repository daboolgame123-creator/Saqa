# Phase 23 — C1d independent preparatory audit: circulars and formal acknowledgements

**Date:** 2026-11-06
**Status:** PREPARATORY_ONLY / PLANNED, not implemented and not closed.
**Classification:** HYBRID; independent static preparation is CHAT, source-specific PostgreSQL/CI proof is EXTERNAL when not accessible in-session.
**Dependency boundary:** 23-C1c-S1 is WAITING_EXTERNAL; no production release, HTTP gate change, or C1d permission rollout is authorized by this preparatory analysis.

## Verified current-code observations

- Existing `readCircularAcknowledgements` uses `transactions.created_at` to count registered circulars whether or not acknowledgement rows exist. It separately uses `view_logs.acknowledged_at` for formal acknowledgement measures; `viewed_at` is not a formal acknowledgement.
- Circular criteria are `direction='وارد'`, `sub_type='تعميم'`, `visibility='PublicToEmployees'`, `deleted_at IS NULL` and `is_daily_situation=false`. The current implementation excludes nonpublic circulars from this report rather than treating linked/granted private books as circulars.
- Employee role currently fails shared `assertReportAccess` before SQL; admin/director have all-scope report context.
- For the privileged read, two indicator queries share `REPEATABLE READ READ ONLY` for Pool-backed execution; there are existing migrated PostgreSQL tests for a concurrent acknowledgement, two time clocks, duplicate accounts, missing identities, contradictions, and status filtering.
- Historical duplicate acknowledgements are grouped by `(transactionId, employeeId)`; ambiguous timestamps and contradictory account-employee identity are reported, without choosing a fabricated result. Raw session references and account IDs are not exposed by the report DTO.
- `ReportApiService.run` maps this specialized result to summary plus acknowledgement metadata; `ReportApiService.export` reuses the same authorized payload. The HTTP report boundary remains unconditional `503 REPORTS_UNAVAILABLE`.
- Existing test fixtures are privileged admin/director checks, plus employee denial. They **do not demonstrate** employee own-only ViewLog read through the service/export, which is the pending security requirement.

## Approved role semantics

- `admin`: circular and acknowledgement statistics, names and permitted details within existing scope.
- `director`: equivalent within existing supervisory scope, without inventing administrative permissions.
- `employee`: only that session employee's personal acknowledgement records. **No coworker names, acknowledgement rows, coworker aggregate totals or error counts referring to other employees.** Visibility of a circular alone does not grant access to others' acknowledgements.
- `archivist`: no new report access.
- For historical rows with missing or contradictory employee identity, do not infer identity from a name, current user link, or session reference.

## Execution gate and acceptance test plan (no implementation yet)

1. Revalidate the complete source authorization policy and decide on a separate explicit employee output shape/summary projection before changing the shared `circularsAndAcknowledgements` guard. Avoid accidentally returning privileged totals while filtering only detail rows.
2. Require a consistent authenticated `employeeId`, `personnelScope`, `requestScope`, `transactionScope` at the service/repository boundary; no owner identity from `filter.employee`. Evaluate whether employee acknowledgement visibility should be limited additionally to currently visible eligible circulars and enforce SQL-level predicates before fetching any foreign records.
3. Apply a trusted employee-ID predicate directly to the ViewLog SQL for employees. Never read all employees' acknowledgements and merely filter them afterward. The registered-circular count and problematic-record counters in privileged output must not be reused for employee if they expose coworker activity. If full report semantics conflict with the own-only contract, provide an explicit role-specific response with no misleading aggregate.
4. Create synthetic migrated PostgreSQL fixtures: employee A, B, a second account of A, unlinked account, public circular, private administrative circular, revoked and non-granted book, deleted and daily book, duplicate acknowledgements, conflicting timestamps, preperiod acknowledgement for an old book, and missing employee ID.
5. Exercise `ReportApiService.run`, specialized repository call, and `export('excel')` on multiple identities. Assert A obtains only A's approved records; B's names, employee IDs, book IDs, notes, counts and anomaly markers never appear, including workbook summary/metadata. Include forged crosswired scopes and malicious filters; unauthorized paths must reject **before SQL**.
6. Confirm privileged admin/director parity on previously supported sources, date and status filters, read-only consistent snapshot and canonical dedup semantics. Reject unsupported filters before DB operations.
7. Test `HTTP 503 REPORTS_UNAVAILABLE` remains effective. Run focused + full tests and CI at exact SHA; independent security and test review; explicit report before C1d closure.
8. Preserve original ViewLog and audit data, independent `view_audit_logs` permission, existing user-facing `اطلعت` behavior. Never invent a new researcher/professor schema.

## Caveat / security design decision to settle within code review

The privileged circular report intentionally returns two different sets: books registered in the selected period, and acknowledgements recorded in that period for eligible circulars registered at *any* time. A future employee own-only endpoint must not conflate these clocks, nor leak privileged all-employee indicators by reusing the same summary. Do not assume that read access to a book grants access to colleagues' acknowledgements.

## Status / handoff

This commit records a **plan and static audit only**, no tests run. No report authorization or HTTP routes changed. The next step for C1d is a specific owner-only response and SQL authorization design reviewed independently, followed by source-specific implementation and actual PostgreSQL evidence, sequenced according to Phase 23 gates.

## C1d-S1 independent implementation plan (before code, 2026-11-06)

**Goal:** Implement a private, unconnected employee-only ViewLog reader and synthetic unit tests, while C1c-S1 runs externally. Do NOT modify `assertReportAccess`, current `ReportApiService.run/export`, existing privileged circular report, or HTTP 503. This is internal groundwork, not feature activation.

**SQL security contract:**
- Session-derived employee identity is required; cross-check `personnelScope`, `requestScope`, `transactionScope`, and `excludeDailySituations`. The employee ID and status/date filtering use bound parameters; never take ownership identity from filters.
- Fetch **only** ViewLog rows `vl.employee_id = $1` for eligible public circulars, excluding deleted/daily books. A viewing permission alone never yields coworkers' read events.
- Keep all historical acknowledgements of the same employee/book in the owner-scoped result set, so duplicate account rows, contradictory account links or timestamps are detected without picking a convenient timestamp. Apply `acknowledged_at` reporting interval only **after** grouping the full history.
- Output only the employee's own `transactionId`, eligible circular `title` and formal `acknowledgedAt`, with no raw `userId`, `sessionRef`, coworker name/count, anomaly count or privileges. For ambiguous owner historical groups: omit from verified output, never claim a complete total.
- No user-supplied document date, source, section, employee or type filters; reject unsupported fields before SQL.
- No new routes, access guard changes, role expansion or production integration. Add targeted synthetic tests for SQL predicate/no-query denial, dedup, anomalies, date clocks and no secret projection. Migrated PostgreSQL and service/export integration remain external follow-on gates after CI/review.

**Classification:** HYBRID. Source implementation and test writing are CHAT; actual TypeScript, PostgreSQL and CI execution remain EXTERNAL unless demonstrated in this session.

## C1d-S1 source checkpoint — 2026-11-06

**Implemented in GitHub, not yet connected or externally tested:**
- New `server/src/repositories/reportOwnCircularAcknowledgements.ts`: isolated internal read-only own-acknowledgements reader; validates complete employee-derived report context before any DB operation, binds trusted `employeeId` as the first SQL parameter (`vl.employee_id = $1`), restricts to eligible undeleted public incoming circulars (no daily books), and uses only formal `acknowledged_at`. Unsupported cross-owner/section/source/type/document-date filters fail before SQL. Current report routes and privileged reader are untouched.
- It reads **only the current employee's** full acknowledgment history for eligible books and evaluates requested acknowledgement-date bounds per row after loading each owner-only group. Repeated same employee/circular accounts with consistent timestamps count once. Conflicting timestamps or account-employee mismatches yield **no verified output** for the affected own group; the function returns no all-user or anomaly statistics. Own output contains only transaction ID, circular title and formal acknowledgement timestamp—no names, users, sessionRefs or coworker counts. The function does not assert a complete history when anomalies exist.
- New `server/tests/reportC1dOwnAcknowledgements.test.ts`: five synthetic tests for SQL owner predicate and projection, forged contexts/no SQL, duplicate-account grouping, cross-period and account conflicts, and bound hostile status strings. The fake DB tests establish source SQL construction **only**, not actual PostgreSQL permission safety.

**Explicitly not done:** No `ReportApiService.run/export` employee branch, no new endpoint, no change to shared `assertReportAccess` (still denies employees for circular report), no production permission activation, no PDF/XLSX owner summary, no target host or real migrated database execution. These depend on independent SQL/service/role/export negative tests and review. HTTP `503 REPORTS_UNAVAILABLE` unchanged.

**Execution evidence:** Source created and remotely fetched for static inspection. TypeScript/lint/Node full suite, migrated synthetic PostgreSQL, XLSX and exact-SHA CI remain **NOT VERIFIED**. Mark this subtask `CODE WRITTEN / WAITING_EXTERNAL`, NOT CLOSED. Continue independently only if no pending shared guard is altered.

## C1d-S2 plan — migrated PostgreSQL adversarial acceptance (2026-11-06)

**Prerequisite:** isolated owner-only reader `reportOwnCircularAcknowledgements.ts` written but unverified; existing `testDb.ts` can start a migrated synthetic PostgreSQL instance. New test is safe to author as an independent unexecuted regression; do not make it a release or dependency closure.

Implement `server/tests/db/reportOwnCircularAcknowledgements.test.ts` using current migrations and synthetic employees/users/transactions/view_logs. Include (a) two employees, one public circular each, cross-account injections and another employee's secrets; (b) valid duplicate accounts of one employee/book, cross-period conflicting timestamps and contradictory user mapping; (c) withdrawn/nonpublic/deleted/daily/noncircular and viewed-only rows; (d) unauthorized forged identity/filter rejection **before** SQL, with direct output negative assertions. SQL must contain owner predicate, not retrieve all then filter. Confirm two independent date clocks and complete lack of all-user statistics.

This test file is a *proposed executable verification*, not proof until exact current branch SHA has successful TypeScript, migrated PostgreSQL and CI evidence. Preserve `503 REPORTS_UNAVAILABLE`; do not connect the reader to the employee service/export until security review.
