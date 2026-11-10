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


## Pilot official book create/edit confirmation UAT (PR #16)

**NOT EXECUTED —** run on a single integrated synthetic PostgreSQL environment with
the real Express backend after PR #16 has been integrated. This section supersedes
prior assumptions that the legacy create/edit modal already confirmed persistence.

1. Login as `admin`. Create an ordinary synthetic book without attachments.
   Ensure the form shows no pre-populated placeholder file. Check Network:
   `POST /api/transactions` contains only allowed DTO fields, and specifically
   **no** client `id`, `month`, `version`, `employeeIds`, `createdAt`,
   `isRead` or `readAt`; employee references are `employeeLinks`.
   Under artificial latency, submit once, then double-click: expect exactly one
   POST and a disabled submit while waiting. The form closes only after
   HTTP 201 and the active list contains the real server ID/version.
2. Simulate HTTP 400/403/503, timeout and offline before create confirmation:
   the modal **stays open** and explains the failure without claiming the book
   was stored. The list must not display a synthetic new transaction. After a
   timeout, check server records before retrying to avoid duplicate POSTs.
3. Use admin editor to change only transaction metadata. Network must show
   `PATCH /api/transactions/{id}` with the exact `expectedVersion`, and **no**
   `attachments`, `employeeIds`, `isRead` or `readAt`. Under latency the
   editor stays open and prevents double save; after success the updated version
   persists on refresh.
4. Simulate `409 VERSION_CONFLICT`, 400, 403, 503, timeout and offline during
   edit. The editor must stay open, show safe feedback and not display a
   fabricated success toast or alter the active row.
5. In official mode, no pre-populated fake "scanned book" appears; upload,
   replacement and metadata-only edit controls are disabled until a real
   byte-upload workflow is integrated. Linking employees from the legacy
   editor is read-only; the official create form can specify exact existing
   employee IDs. Direct SQL or HTTP admin mutation with invalid employee
   link must be rejected by the server.
6. The legacy daily-situation combined creation form is not used for official
   writes because the backend stores daily records separately and its old
   client-only `transactionId` cannot be accepted as the new server UUID.
   The official daily-situation view remains read-only in this pilot; the
   independent backend's admin-only API endpoints remain unchanged. Do not
   claim the legacy daily form was persisted.
7. Director/employee have no create/edit actions. Forged POST/PATCH requests
   with their valid sessions return 403 on the server. After logout while
   create/edit is pending, the old response cannot populate a new user's UI.

No actual browser UAT is claimed here. Preserve the existing `503
REPORTS_UNAVAILABLE` on all official report routes; do not merge into main.


## Official personnel save and former-status UAT (PR #17)

**Prepared only, NOT executed.** On one pinned integrated synthetic SHA, sign
in as actual admin/director/employee using the backend-issued Bearer token.

1. As admin, create one synthetic employee or researcher. Network must show
   `POST /api/employees` without client `id`, `status`, `userId`,
   `createdAt` or `updatedAt`. The add dialog stays open while pending;
   after HTTP 201, the official server ID appears. Two rapid submissions
   must result in a single POST.
2. Test creating more than one name in the same official form. It must
   fail visibly **before** posting, to avoid a partially committed bulk
   operation without a server transaction.
3. Edit title/department/name. Network must show `PATCH /api/employees/{id}`
   with only permitted employee data, never the path ID in the body or an
   account-link override. On HTTP 400/403/503/offline, keep edit dialog
   open with an error and do not show the unsaved change as persisted.
4. Move a synthetic employee to `former` with approved
   `serviceEndReason`. Observe `POST /api/employees/{id}/status`; only
   after backend confirmation does the UI show "موظف سابق — السجل محفوظ".
   The existing books and transaction-employee links **must remain**
   visible and linked to this person, including after reload. No DELETE
   and no local unlink. A missing/unapproved reason must fail.
5. In director and employee sessions, creation, editing and status-changing
   controls are absent. Forged API calls must get 403. While switching
   sessions, an old successful response must not populate the next account.
6. Confirm official reports are still `503 REPORTS_UNAVAILABLE`; this
   personnel UI change is not approval to enable any report route.

Record the exact integrated SHA, synthetic account roles, network status and
pass/fail evidence. Do not record real employee PII or tokens.


## Delayed-response and session-boundary UAT (PR #18)

**Not executed.** Use real synthetic API accounts on a single pinned integrated
SHA. Do not record passwords or Bearer tokens in browser evidence.

1. With an authenticated employee, throttle GET /api/transactions and
   /api/transaction-employees, then log out before the response returns.
   Neither a late successful GET nor a late failed GET may render old data,
   restart startup, or show a prior session's error in a new session.
2. Start login; delay GET /api/auth/me. Logout/revoke the session before /me
   returns. The late /me reply cannot authorize the UI.
3. As account A, begin a list or detail read and trigger a 401 after account B
   logs in (synthetic timing control). A delayed 401 from A must not clear
   B's session; A's returned data must not populate B's views.
4. Delay POST /api/auth/logout and POST /api/auth/secret, where the test
   environment permits controlled responses. Their late replies must not
   revoke a different active session.
5. While the initial 8 scoped relationship fetches are pending, revoke the
   token. Startup must fail closed and must not start further link requests.
   Verify no partial staff/transaction data is displayed.
6. Verify local demo (explicit opt-in only) still boots without an API token,
   and that all official reporting paths stay 503 REPORTS_UNAVAILABLE.

Record test role, integrated SHA and outcome, not private credentials. CI
unit and API tests are **not** substitutes for browser UAT.


## Official director-directive annotation UAT (PR #19)

**NOT EXECUTED.** Use a single pinned integrated SHA with synthetic admin,
director and employee accounts.

1. Admin opens both card and table view and sees the "هامش المدير" action.
   Director and employee should not see it; direct forged PATCH for those roles
   must receive 403 from the server. The label describes the annotation type,
   **not** a grant to a director account.
2. Open the annotation editor for an ordinary synthetic book, type text and
   select action-required. Close/cancel: no HTTP request was sent.
3. Reopen, save: exactly one PATCH /api/transactions/{id} containing only
   the directorDirective object (text,date,actionRequired) and expectedVersion.
   The actor is taken from the Bearer session; no caller-selected actor ID or
   false official acknowledgment.
4. Simulate HTTP 409, 403, 404, 503, delay and offline. The annotation dialog
   stays open with the entered text and a safe error; no green success or
   locally invented updated directive appears in the book. Double-submit
   must be blocked while pending.
5. On HTTP 200 with matching ID, updated directive and incremented version,
   the dialog closes; reopen/read after page refresh to confirm the server
   preserved the text. Changing status from a stale version then returns 409.
6. Switch account or log out during a pending PATCH. An old response must not
   update another account's UI. All official reporting routes remain
   HTTP 503 REPORTS_UNAVAILABLE.

Record browser pass/fail per role and the integrated SHA, not actual staff names.


## Concurrent login and immediate logout UAT (PR #20)

**NOT EXECUTED** — use only synthetic accounts with one pinned integrated SHA.

1. Throttle POST /api/auth/login, submit one login, then attempt another before
   the first returns. Confirm only one login POST is sent and a second attempt
   cannot overwrite or silently replace the first verified account.
2. Start an incomplete login, explicitly sign out while the HTTP request
   remains pending, then release its delayed success response. The old login
   must not create a UI session or send GET /auth/me using that old token.
3. Start a new login after cancelling a prior login. Resolve the new request,
   then resolve the old request. The old completion must not remove or replace
   the new Bearer session.
4. While POST /api/auth/logout is deliberately delayed, sign out. The UI and
   volatile in-memory token must clear immediately; the outgoing revocation
   request still uses the token captured at initiation. An offline/rejected
   revocation is not an excuse to keep displaying private data.
5. A delayed 401 for a request initiated as synthetic user A must not clear
   the active session of synthetic user B. An ordinary 401 for the current
   user's token must clear that user's session.
6. Confirm that none of these tests enable report endpoints: HTTP 503
   REPORTS_UNAVAILABLE stays enforced. No real employee data or login secrets
   should be printed in UAT evidence.

Server/API CI and these deferred-response unit tests are not equivalent to
the manual browser UAT on the final combined SHA.


## Archive server-confirmation UAT (PR #21)

**NOT EXECUTED.** Use a synthetic admin and a fresh integrated commit.

1. Archive a synthetic active book with expectedVersion N. The request must
   use DELETE /api/transactions/{id}?expectedVersion=N, no body, no actor or
   caller-supplied deletedAt.
2. The server must return the exact book ID, version N+1 and a valid nonempty
   deletion timestamp. Only after that confirmation may the active UI row
   disappear. Refresh the admin archive page to verify the same ID/version.
3. In a synthetic HTTP proxy fixture, replace the successful HTTP response
   with empty 204, malformed JSON, missing deletedAt, wrong ID, or stale/
   unrelated version. The UI must not remove the book as confirmed active;
   it should report an unverified result and advise checking archive status
   before retrying (because the server may already have committed the write).
4. Test 400/403/404/409/503/offline. None may claim archive success. The
   server must still enforce the admin-only delete_archive permission.
5. Restore the real archived book through the versioned POST path and ensure
   the original ID and links survive. All report routes stay 503.

The manual result must cite a pinned combined SHA; CI cannot stand in for
browser acceptance testing. Do not record institutional data.
