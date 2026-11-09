# Phase 23 — C5 final role/filter/export acceptance checkpoint

**Date:** 2026-11-07. **Base:** PR #34 exact \`c960b47f869fc415b6d67e55074687e4c9b2aa74\`.  
**Branch:** \`integration/phase23-c5-format-scope-acceptance-20261107\`.  
**State:** INTERNAL/SYNTHETIC CI; **DRAFT**, **UNMERGED**, **REPORTS HTTP 503**, **RELEASE NO-GO**.

## Analysis first: real closure gaps

Source re-read on the exact parent commit:
- \`server/src/authorization/accessScope.ts\` §10.2/Phase 13 intentionally authorizes the director to **read all classified transaction scopes**. \`requestScope.ts\` intentionally grants the director request workflow read scope. \`permissions.ts\` limits director to \`view\` + \`approve_request\`; it explicitly denies create/update/delete/archive/account/availability administration. \`reportAccess.ts\` follows this *existing, broad institution-level supervisor policy*. Do **not** incorrectly classify that existing rule as an unexpected role escalation. If the institution later approves department-specific director visibility, that is a **separate business/security change**: nothing in the current data model supplies an approved director-to-department scope predicate.
- The Phase 23 employee report guard allows only owner personnel/requests/leaves/time permissions and separately verified incoming books. General employee \`circularsAndAcknowledgements\` remains denied; separate C1d owner ViewLog/XLSX projection is **internal/unwired**. Do not silently activate.
- \`reportValidators.ts\` and repository deliberately reject book \`section/source\`, reject unsupported document-date fields on nonbook sources, and refuse researchers/professors without independent authoritative schemas. These refusals must not be described as fully supported filters.
- \`ReportsView.tsx\` is an inert catalog/preview notice, not the accepted official report UI. \`reportRoutes.ts\` unconditionally returns HTTP 503. Do not confuse CI-only service and Docker success with functional go-live.

## C5 test: role/preview/XLSX/PDF equivalence

Reuses the *actual migrated disposable PostgreSQL* and 42 synthetic incoming books from existing C2 real-Docker integration. An additional test runs before the existing 5-circular fixture, so the expected book population remains exactly 42.

For admin and director: verify **42 authorized SQL preview rows**, exactly **42 XLSX detail rows** with matching titles and ordering, and the correct Excel summary count. For the director additionally render through **real isolated Docker WeasyPrint**, parse the real PDF with Poppler and prove all 42 synthetic first/middle/last identifiers appear exactly once. For employee: verify **one** publicly visible book in SQL preview/XLSX, with private books absent from export and counts. For every role: reject exporting raw internal transaction UUIDs. Explicitly check the director has read but not create/update/delete/archive/availability/account-management permission.

This is one additional focused integration test, not a new production pathway. Existing C2 Docker tests, ViewLog 38/8 tests, C4 SIGKILL cleanup, Chromium UI UAT, server/DB/API, build and HTTP 503 gate remain in the same branch workflow.

**Proof required:** exact final C5 SHA, completed **SUCCESS** of the full C2/C4/C5 workflow (including the C5 step) and no failing guard tests. Until that CI completes, code written != tested.

## Release blocker matrix / smallest realistic close path

| Area | Current evidence/decision | Remaining gate |
| --- | --- | --- |
| Authorized preview/excel/real Docker PDF | C5 synthetic actual-migrated-DB test introduced | Exact-SHA CI + independent review; verify additional supported report filter types |
| Director scope | Current approved §10.2 all-readable scope, no write controls | No unapproved scope change; confirm institution's deployment policy at sign-off |
| Employee incoming | C1c owner SQL and real XLSX/PDF tests | Independent source security review and final UAT |
| ViewLog | Privileged 5 circulars/38 acknowledgements/8 unique real PDF; C1d separate own-only XLSX | Independent approval of own-only ViewLog before service/HTTP wiring |
| Missing sources | Researchers/professors explicitly unresolved | Source/domain approval, or accept as **unavailable** without false success |
| Filters | Registration/document date, fixed directions, status; intentional source/section denials | Final checklist for each supported report; reject invalid before SQL |
| Frontend | Safe nonofficial preview/catalog | Official role-aware filters, UI and final browser acceptance before release |
| Docker/image/font | C2 cleanup + C4 synthetic crash/reaper verified | Host-owned watchdog, immutable registry digest, dependency/font license/hashes, host sandbox inspect |
| Migrations/backups | Synthetic integration/regression checks | Destination host migration/rollback and backup/restore review |
| Reports HTTP | Explicit 503 \`REPORTS_UNAVAILABLE\` | Keep until all release gates approved |
| PR chain | Stacked draft PRs #23–#35 (no merge authorized) | Independent review and approved ordered integration onto chosen target |

**Scope rule:** Do not spend more time polishing WeasyPrint aesthetics. Merge nothing, change no public routing, and do not claim Phase 23 closed without production host/role/filter acceptance and explicit owner authorization.
