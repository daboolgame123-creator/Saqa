# Phase 23 pilot login vertical slice — design before implementation

**Owner:** CHAT; **base:** pilot fail-closed PR #9; **external OpenCode:** integrating PR #4 with previous six PRs, branch untouched.

## Observed precondition
Phase11 Express implements POST /api/auth/login -> {account, sessionToken, mustChangeSecret}, GET /api/auth/me -> {userId,employeeId,username,displayName,role}, POST /api/auth/logout (204), POST /api/auth/secret (change secret invalidates session). All official /api data routes enforce Bearer identity and resource permission. Existing React App loads data before login, offers mock role-switching, has no Authorization header and gets 401. Vite runs on 3000 while API on 4000; no proxy currently, so cross-origin browser calls would fail. Server supports admin/director/employee; legacy archivist is explicitly outside permission matrix.

## Implementation boundaries
1. Auth client uses **session-memory-only** Bearer token (no localStorage, sessionStorage, cookie scripts, query strings or logs). All client requests read token at call time; 401 from authenticated calls clears token and informs App. No credential echo. Authentication endpoint doesn't require token.
2. Login form accepts identifier/secret and validates backend response; confirm GET /auth/me before unlocking UI. Unknown/inactive role or inconsistent identity fails closed. Client reload requires login anew; no attempt at persistent resume without approved secure browser session design.
3. Change-secret-required (temporary secret) handled before any API data call; /auth/secret success requires new login. Logout calls backend and clears local account even on network failure.
4. Only in API mode, gate data effect by authenticated account, hide role switcher, derive currentUser from actual authenticated id/employeeId/role, no mock identity. Server-scoped transaction list is authoritative (do not locally reject granted books by stale mock list logic). Keep explicit local development demo behavior unchanged.
5. Use same-origin `/api` and Vite dev proxy to localhost:4000. Production needs configured same-origin reverse proxy or secure explicit base address (not configured by this slice).
6. Tests: client token header / login-me / logout / secret-change / 401 invalidation / no-storage contract / hostile login responses, React markup and route binding, full lint/server/DB/API/build. CI exact SHA, draft PR only.

## Limits / acceptance
No new permission, no production session cookie, no persistence of secrets, no interface for account registration/OTP yet. Client role permission labels can still be stale compared to server; **server remains enforcement point**; UI visual UAT remains pending. Reports HTTP 503 remains. Do not merge to base or OpenCode branch. UI login shall be usable after provisioning test accounts and API on same-origin proxy; actual Windows/browser UAT still required.
