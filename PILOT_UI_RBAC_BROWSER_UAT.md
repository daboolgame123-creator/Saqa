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


## Official «اطلعت» verification (PR #12, synthetic data only)

These are **manual UAT steps not yet executed**. Use a synthetic employee with an actual Bearer session, plus one visible transaction and one transaction hidden by its Access Scope.

1. Open a visible transaction. The official detail window must say that preview does **not** register «اطلعت» and must show `btn-official-acknowledge`. There should be **no** success stamp simply from opening. In the transaction list (both card and table modes) do not treat client `isRead` as official acknowledgement.
2. Click «اطلعت» exactly once. In Network expect `POST /api/transactions/{id}/acknowledge` with Bearer authorization and **no userId/employeeId/body**. Expect HTTP 200, matching transaction and authenticated user ID, nonempty `acknowledgedAt`. Only then show the green official-success message.
3. Under request latency, the button remains disabled while pending; on success it remains disabled for this open modal. Closing/reopening may show it again because the pilot has no GET acknowledgement status. A repeated POST must be idempotent on the server (exactly one ViewLog row).
4. Simulate offline/503/403/404. The UI must show an error, **not** a green success stamp. With a rejected 401 the global session logic must return to login; no local fallback is allowed.
5. With a book outside Access Scope, a direct request to acknowledge must return a non-success response and insert **no** ViewLog. A malicious body claiming another user must never change the actor, which the server derives only from its session.
6. Log browser/version, unified integrated SHA, expected/actual outcome and network status. Do not include tokens, account secrets or employee PII in screenshots or logs.

No automatic acknowledgement is permitted on list click, document preview, opening the modal or switching attachments.


## Updated pilot admin transactions and archive UAT (PR #13–#15)

**Status: NOT EXECUTED.** This section supersedes the initial matrix's
"delete / status hidden in all roles" row *only after* the integrated build
includes PR #14 and PR #15. Do not test individual draft PRs as a deployment.

1. Login as **admin** to a synthetic migrated PostgreSQL environment. Opening
   the transaction list should show "عرض الكتب المؤرشفة واستعادتها". Neither
   **director** nor **employee** should receive this button or be able to access
   `GET /api/transactions/archived` (expect HTTP 403).
2. With a new synthetic active book, use its versioned status selector. Expect
   `POST /api/transactions/{id}/status` with only `{status,expectedVersion}`;
   new status and incremented version must persist after refetch.
   **director/employee** must have no status selector that can mutate and any
   direct POST must return HTTP 403.
3. As admin, archive that book. The confirmation must say **أرشفة**, not
   irreversible deletion. Expect `DELETE /api/transactions/{id}?expectedVersion=N`
   **without a request body**, and no client-selected actor or timestamp. The
   active row disappears only after server success. A fresh archive-list GET
   must include the unchanged record ID, server deletion timestamp, and version.
4. Open the admin archive panel. Check exactly 25 archived records per page
   (where enough exist) and controlled pagination via
   `GET /api/transactions/archived?limit=25&offset=N`. No local mock
   books or non-archived rows must be displayed. Offline/403/503 should show
   a visible error, not an empty archive presented as confirmed.
5. Select **استعادة**, cancel once, then confirm. The first selection alone must
   perform **no** HTTP mutation. Confirmation sends
   `POST /api/transactions/{id}/restore?expectedVersion=N` **without a body**.
   After HTTP success, the restored book must retain the same ID, version must
   increase, it must leave the archive, and the active books/links must be
   loaded again from the official scoped API. No new synthetic book is created.
6. Force stale `expectedVersion` before status change, archive and restore:
   expect HTTP **409**, no local success and no replacement of the server row.
   Force HTTP 403/404, timeouts and offline errors: errors shown, archive
   and restore must **not** claim server success.
7. Logout, switch roles or revoke the token while archive-list pagination or a
   restore request is in flight: no response from the previous session may
   populate the new session. Verify `401` causes logout.
8. As the synthetic **employee**, log in with several unrelated records. The
   app must not call the restricted daily situation endpoint and should avoid
   duplicate startup employee requests; related-book requests must be
   throttled, not sent all at once. Confirm reports stay
   `503 REPORTS_UNAVAILABLE` in all roles.

Archive/restore is **not** formal report release, and tests on GitHub Actions
do not count as executed manual browser UAT. Record the exact integrated SHA,
test time, browser, and synthetic request IDs without secrets or personal data.
