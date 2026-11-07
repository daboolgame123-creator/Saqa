# ALSQAYA — Phase 23 pilot UI permissions: browser UAT

**Status:** Prepared, **not executed**. Test only in a non-production environment with synthetic accounts/data. Branch: `development/phase23-pilot-ui-rbac-20261107`, stacked on PR #10. Never infer backend authorization from a hidden UI button.

## Setup / gate
- Deploy the **single integrated, pinned SHA** with the real Express API and migrated synthetic PostgreSQL. Do not test this draft branch as a release.
- Use HTTPS with the planned reverse proxy, then sign in through the real UI with three separate accounts: `admin`, `director`, `employee`. Each account must have an actual server-issued session; no mock role switching, no role in URL.
- Capture browser Console/Network (without retaining passwords, tokens, phone numbers, or private employee information). Refresh browser after each role and sign in again. Verify `/api/auth/me` matches the account.

## Scripted acceptance matrix

| Scenario | admin | director | employee |
| --- | --- | --- | --- |
| Login and load authorized data | Load with no 401/403 | Load with no 401/403 | Load only own/visible scope; **no** GET /api/daily-situations |
| New transaction action | Visible; create using synthetic data and confirm server persistence | Absent | Absent |
| Transaction edit | Visible, verify PATCH and read-after-reload | Absent | Absent |
| Transaction delete / status / read-toggle / attachment quick-edit | Hidden or disabled in **all** official roles until server-backed workflow is integrated | Hidden/disabled | Hidden/disabled |
| Personnel create/edit/change to former | Admin only; verify actual API response and reload | Absent | Absent |
| Daily-situation navigation | Visible; form creation available | Visible but **no create** | Absent; direct navigation does not load register |
| Legacy archivist studio | Absent | Absent | Absent |
| Legacy demo role-switch controls | Absent | Absent | Absent |
| Reports | Not to be considered official; backend report endpoints remain `503 REPORTS_UNAVAILABLE` | Same | Same |

## Negative and session tests

1. Via direct HTTP/API call with valid **director** and **employee** sessions, attempt POST/PATCH/DELETE on ordinary transaction/employee resources. Expect `403 PERMISSION_DENIED` (except documented view-only POST actions like `acknowledge`). UI visibility is not the security control.
2. With **employee** session, attempt direct `GET /api/daily-situations`: expect `403`. The normal app load must still succeed without calling this endpoint.
3. Attempt reading a book outside the employee's Access Scope; expect a server-side denial/filtered result. Confirm no local fallback or stale data from an earlier account.
4. Logout; confirm the in-memory token is cleared and the app returns to login. Refresh: still logged out. Use a revoked/expired session; expect 401 and cleared UI.
5. Make a fake/failed create or edit attempt: the UI must not claim persistence; on reload only server state is authoritative. **If the legacy UI displays a premature success message, record as a blocking UX/persistence finding.**
6. Verify all report APIs remain `503 REPORTS_UNAVAILABLE` and no PDF/Excel endpoint was activated by this PR.

## Record findings
Log **integrated SHA**, browser version, test-account role, scenario, pass/fail, API status (no secret-bearing logs), evidence link, issue owner. Any unauthorized mutation, scope leak, hidden local fallback, login-blocking 403, or fake success blocks UAT sign-off. This document prepares manual tests only; it does **not** claim they were run.
