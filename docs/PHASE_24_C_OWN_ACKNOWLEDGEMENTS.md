# Phase 24-C — detached employee-own acknowledgement candidate

## Plan (before implementation)
- Owner: CHAT; external OpenCode assignment unknown. Base: `d04ec7521ecbfa5a95bdff76cc94a52f0abb691a`.
- Branch: `development/phase-24-c-own-acknowledgements-20261109`.
- Reuse the existing owner SQL reader and dedicated JSON/XLSX services unchanged.
- Add a self-authenticating employee-only router factory with explicit DB/timezone injection. Mount only in a loopback test app, never production or UI. Accept only acknowledgement dates and status; reject all identity/scope/format inputs.
- Preserve public-circular-only verified-subset semantics, raw-history budget, general report denial, release constant false and official HTTP 503. No migrations, real data, PDF or automatic merge.
- Verify real sessions A/B, XLSX projection, spoofing and invalid input before report reads, missing employee link, denied roles, revoked/temporary sessions, dates/status, excluded records and oversized raw history/text. Reuse existing deeper reader regression tests.
- Run TypeScript, focused tests, DB/API regressions and build; obtain exact-SHA CI and independent security review of the new diff before acceptance.
- Classification: CHAT where tooling supplies evidence; unavailable remote/runtime evidence remains explicitly unverified. Not institutional release or backup/restore acceptance.

## Evidence
Pending implementation, actual test results, exact SHA, CI and independent review. No completion claim.
