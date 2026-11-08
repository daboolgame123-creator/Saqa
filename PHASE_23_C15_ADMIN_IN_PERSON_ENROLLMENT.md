# Phase 23 C15 — administrator-assisted in-person activation (decision #46)

**Scope:** only the approved release blocker: account activation and recovery
without a third-party SMS provider. This is an implementation candidate, not
institutional sign-off or a report release.

- Set `NODE_ENV=production` and `AUTH_OTP_PROVIDER=admin` on the approved
  host. Production `AUTH_OTP_PROVIDER=log` or omitted fails closed. No text
  messages are sent and OTPs are never logged.
- The existing *active* admin role (with `manage_accounts`) verifies the
  employee in person and checks badge + registered phone against HR records.
  Then it calls `POST /api/auth/registration/admin-issue`, with JSON
  `{"badgeNumber":"<verified>","phone":"<registered>"}`, carrying its
  Bearer token over organization-approved HTTPS.
- Response contains the six-digit code **once**, valid for five minutes.
  Admin hands it privately to the same verified employee. The user performs
  `POST /api/auth/registration/verify` with registered `phone`, `code`
  and a private `secret`. Code is atomically consumed; role is always
  `employee`. Missing/changed phone, former employee, existing user, old
  codes and replay fail closed. Only a tagged SHA-256 hash is retained.
- In admin mode, unauthenticated phone-initiated `registration/otp`,
  `recovery/otp` and `recovery/verify` are **rejected**. Recovery instead
  uses the existing authenticated `admin` / `manage_accounts` route
  `POST /api/auth/accounts/:id/reset` after physical identity verification.
  All old sessions are revoked; a temporary secret is shown once and must
  be changed before the employee can use resources. Do not leave copies
  of temporary secrets on shared workstations.
- Every approval and reset is audited without raw codes. The five-minute
  limit, five OTP attempts and request quota are inherited from Phase 11.
- **Operational blockers not automatically solved by this code:** a secure
  owner-approved **first-administrator / break-glass bootstrap**; strict
  HTTPS and LAN firewall; actual admin UI (API procedure alone is not an
  operator-facing screen); institutional identity-check procedure;
  PostgreSQL+attachment restore and PDF host approvals.
- **No report activation:** official `/api/reports*` remains HTTP 503;
  the C14 gate is hardcoded closed.

No real personnel records, SMS service, company provider, or public admin
provisioning mechanism is used in the tests. Owner must review exact SHA
and independently authorize any merge or institutional deployment.
