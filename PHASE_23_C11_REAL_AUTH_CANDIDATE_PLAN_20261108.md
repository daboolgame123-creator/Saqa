# Phase 23 C11 — real-session candidate report acceptance (analysis before execution)

Date: 2026-11-08. Parent PR #43 exact green SHA `98826c156b5a04fc2aee1da4251253bfa1522de7`. Branch `integration/phase23-c11-auth-candidate-real-pg-20261108`.

## Finding and test gap
The detached candidate report transport is tested with a **mock identity adapter** in `reportC7GatedRoutes.test.ts`. Other suites confirm the production `/api/reports` HTTP 503 and the PostgreSQL report service's owner predicates, but those checks do not all execute together in one HTTP request with **real session middleware and actual migrated PostgreSQL**. A future release integration could wire the service but misconfigure identity propagation or scopes.

## Minimal scoped test
- Create **test-only** Express app at `/__test_candidate` on ephemeral 127.0.0.1, using the exact production `requireSession`, `requireChangedSecret`, `requireResourcePermission`, `attachAccessScope`, `attachRequestScope`, `createReportCandidateRouter`, `useApiServices`, `useAuthService`. Mounting happens only inside the test runner, **never** inside `server/src` routes.
- Use existing real registration/OTP/login test helpers for admin/director and two separate employees, all in an embedded migrated disposable PostgreSQL cluster; seed a public circular/ordinary book, two specific-grant books and an administrative book. Never use institutional data.
- Assert the exact accessible records for employees A/B, privileged counts, same-role cross-user denials, failed authorization/role injection, date/document/status filtering when possible, export XLSX parity and no privileged IDs/data.
- Continue testing the **official** `/api/reports*` path on the actual app to prove 503 with zero report SQL calls, and PDF candidate export 503 when no target-host approved immutable worker exists.
- Run exact-SHA existing CI including the new focused test plus complete DB/API/browser/Docker pipeline.

## Release limits
Passing this test is one more true-stack verification, not an independent security review or institutional host approval. No app route/React mounting, no 503 removal, no PR merge. C9 frozen snapshot remains untouched. Evaluate results only after exact final SHA CI finishes.
