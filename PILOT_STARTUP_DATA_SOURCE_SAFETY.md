# ALSQAYA — pilot startup data-source safety (CHAT only)

## Analysis — 2026-11-07
The UI's `src/api/index.ts::primeDataSource` falls back automatically from API to `LocalDataAdapter` for **any** failure of `GET /api/employees`, including HTTP 401 (login not connected yet), 403, 500, and offline. This silently changes the data source to localStorage/placeholder data; a user can mistake it for official archive data and save information into the wrong store. The existing `src/App.tsx` additionally swallows startup errors and renders empty views as if they were loaded. These are concrete blockers for a safe pilot, even when backend authorization is correct.

## Plan before code
- API mode is fail-closed on **all** bootstrap failures. **Only** explicit `VITE_DATA_SOURCE=local` selects `LocalDataAdapter`. Keep injection via `setDataAdapter` for tests, but never auto-switch it.
- In `App.tsx`, display a dedicated full-screen startup error with a retry that reloads the page. For 401/403 distinguish unavailable access, not 'no records'; do not render the application with empty datasets, or expose role switching.
- Add regression tests with a fake `IDataAdapter` that returns 401 and network errors; verify adapter stays API, no local fallback, no fake records. SSR/static guard of App startup error if needed.
- Run exact-SHA CI lint/server/PostgreSQL/API/build in isolated branch. Do not modify report routes/permissions, use real employee data, touch OpenCode's temporary integration branch or merge to base.

## Scope/acceptance
One independent fail-closed startup fix, not a full login feature or production-ready pilot. Frontend login/session/role prototype is a **separate unresolved issue**. Official reports retain `503 REPORTS_UNAVAILABLE`, all PRs unchanged. Stop after CI-verifiable result; no endless hardening.
