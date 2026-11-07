# Phase 23 C7c — real Chromium acceptance of the UNMOUNTED report candidate

Date: 2026-11-07. Starting parent: PR #37 `5373d280155d43c421037f5bf7462fc8a71b9fa2` (**exact-head 31/31 CI successful**).

## Analysis before writing code

- Existing `server/tests/browser/pilotBrowserUat.mjs` proves a real authenticated React/Vite+Express+PostgreSQL flow including formal reports **HTTP 503**, but it never exercises the intentionally **unmounted** `ReportsCandidateView.tsx`.
- C7b already has synthetic SSR/allowlist/unit tests; they cannot verify a browser really applies filters, clears old results, blocks forbidden role tabs, handles a binary Excel download or responds correctly to an async account switch.
- The public report controller is still behind `router.use(...503...)`. Mounting the candidate in the official app for this test would violate the release hold. Use a **test-only Vite HTML entry under `server/tests/browser/c7c`** that imports the real React component; it must never be included in the application route/bundle.
- The synthetic test-only browser harness sets a disposable in-memory session, derives fake fixture roles and account IDs to exercise UI presentation, and **Playwright intercepts /api/reports exclusively in the isolated browser context**. It cannot attest server-side authorization. SQL/role isolation and production HTTP 503 remain independently covered by the unchanged full DB/API/old Chromium acceptance.
- Excel mocks must be genuine XLSX bytes produced by ExcelJS from synthetic filtered rows, not text with a file extension. Downloaded Excel must be reloaded and checked.
- Network limited to loopback, no institution data, no checked-in credentials or token traces, no screenshots containing real staff.

## Implementation/acceptance tasks

1. Add isolated fixture HTML and TSX mounting `ReportsCandidateView` with controlled account/role switch and logout. Set only synthetic token literals, no real auth or production route changes.
2. Start a localhost-only ephemeral Vite server with React plugin from a Node+Playwright browser test; intercept report preview/export by role-specific disposable token *not* query-forged role. Script scope: employees see only their own/public synthetic records, admin/director see both. One intercepted request may be delayed to prove stale results cannot reappear after switching accounts.
3. In a real Chromium page verify initial zero data; employee vs admin/director available report types; document-date fields, type/status/section switching clears hidden stale filters; successful preview and number of visible rows; Excel download bytes and forbidden markers; invalid dates and 503 do not generate approved results; PDF UI disabled by default; same-role account switch and logout hide old data, and in-flight responses cannot restore them.
4. Assert all actual official `/api/reports` requests still return HTTP 503 through the existing independent real API/browser suite; no candidate was exposed to the live API.
5. Add a **dedicated CI step** in the already proven full C2/C4/C5/C7 branch workflow. It must fail on browser errors/missing PASS manifest; record artifacts as **synthetic only**.
6. Exact final SHA `npm run lint`/build, new browser test, and full server/DB/API/C2/C4/C5/Chromium must complete SUCCESS. Keep draft/unmerged; document residual host review and full integration security sign-off in Issue #36.

## Boundaries / stop rule

A fake browser server role is *not* proof of production security. Production account and SQL scopes are verified by separate real API/PostgreSQL tests. No report route activation, no production UI mount, no Docker/font approval, no merging. If any browser test fails, diagnose and fix before claiming pass. Avoid unrelated design work.
