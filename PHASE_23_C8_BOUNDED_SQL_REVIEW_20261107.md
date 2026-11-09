# Phase 23 C8 — security review: bounded PostgreSQL report results, NO truncation

**Analysis before implementation — 2026-11-07**
Parent: PR #38, SHA `81aafe9b6e8a9ce0b9832defd55a6ba91d924d38`, exact-head GitHub Actions #42407625320 COMPLETE SUCCESS (34/34 steps).

## Confirmed issue

The real PostgreSQL report repository currently executes unbounded ordered `SELECT` queries; its circular/ViewLog implementation loads full circular and acknowledgement history into process memory. The XLSX export *later* enforces `MAX_ROWS = 2000`, and the candidate HTTP preview has no SQL row ceiling. A report can therefore overfetch far beyond the safe export budget, consuming server memory and reporting an oversized preview as apparently valid. A `LIMIT 2000` alone would also be **incorrect**: it silently truncates totals and ViewLog anomaly history. This is a substantive correctness and availability problem in dormant report code, not a proven live data breach; all official HTTP reports remain 503.

## Implementation contract

1. One shared authoritative `MAX_REPORT_ROWS = 2000` and `REPORT_RESULT_TOO_LARGE` operational error (HTTP 422, safe text prompting narrower filters). Limits must cover **both ordinary SQL rows and full ViewLog history**.
2. Apply server-owned `LIMIT $N` **after the existing WHERE, scope and ORDER BY** on actual repository SQL, binding `N = MAX_REPORT_ROWS + 1` as a parameter. This detects oversize without ever treating the first 2,000 rows as a complete report. Do not accept a client-provided limit or move scope to browser memory.
3. A result containing 2,001 rows must **throw** before summary, PDF/XLSX, or any second ViewLog query. For circulars, cap BOTH circular rows and the complete history of eligible acknowledgement rows; if either breaches the limit, reject, never claim complete statistics. PostgreSQL repeatable-read transaction must still rollback on error; do not weaken historical anomaly rules or split report snapshots.
4. Apply the same limit to service returns from mock/direct repository implementations (including circulars), so the preview and export share the same rule. Excel model retains its independent safety checks for direct render calls.
5. Add tests: normal authorized 2,000 rows succeed; 2,001 reject; scoped SQL contains a **bound sentinel**, not interpolated user values; the ViewLog circular and log result limits both reject; no fabricated/silent totals. Test operational 422 classification and keep production 503.
6. Run exact-SHA full CI including C7c real Chromium + C5 DB/Docker/PDF + app/API. Draft stacked PR only; do not merge or enable reports.

## Remaining separate blockers

This bounded result is not yet a production-ready streaming or cursor-based full-report export. Reports over the ceiling must instruct users to narrow date/type filters. Independent security/permission review, approved server image and fonts, host-level container watchdog, human Arabic RTL print acceptance, backup/restore, and owner ordered-merge authorization remain tracked in Issue #36. Do not claim full Phase 23 release GO from this fix.
