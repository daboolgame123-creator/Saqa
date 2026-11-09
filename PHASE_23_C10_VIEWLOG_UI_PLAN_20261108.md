# Phase 23 C10 — privileged ViewLog UI completeness (analysis before code)

Date: 2026-11-08. Parent: frozen reviewed candidate SHA `bee3a40eb7f509f3a8ce8920fc93f2b8adee0415` (PR #42, CI success 38/38). Branch `integration/phase23-c10-viewlog-ui-parity-20261108`.

## Confirmed missing behavior
The **unmounted** `ReportsCandidateView` currently renders circular statistics only as two totals. It does not display names and individual formal acknowledgement timestamps, does not label partial verified counts as partial when historical conflicts exist, and does not explain why the full totals are unresolved. Yet the authoritative `ReportResponse.circularAcknowledgements` DTO already contains these details, and `PHASE_23_DECISIONS.md` §2.H/§2.I requires names/details for admin/director, clear anomaly reasons and no guessing.

## Scope of C10
1. Create a narrowly typed, reusable React view for the **already-authorized** `circularAcknowledgements` payload, called only when `role` is admin/director and the report type is `circularsAndAcknowledgements`. Do not fabricate own-only employee history or public aggregates.
2. Show verified formal acknowledgement operations and unique employee counts, with a clear `غير محسوم` full total and anomaly counts/reasons if `complete=false`; avoid presenting verified subset as full total.
3. Show up to 100 authorized entries with employee name, ISO acknowledgement time, matching circular title (if the book's registration is outside range label as such, never infer a book/identity from the name). Do not show `employeeId`, `transactionId`, `sessionRef` or other internal IDs.
4. Show both book status counts on book reports, including `قيد المراجعة` (not only completed).
5. Add JSX server-rendered tests for both complete/conflicted and denied-role cases. Add one real Chromium synthetic fixture for privileged circular UI and role switch, in the existing C7c browser test (only intercepted API, no live endpoints).
6. Preserve official 503 route and unmounted public `ReportsView`; ensure CI tests and report 503 still succeed. This is not a production image/host or independent security approval.

## Non-goals
- No new report API, no approved employee own-only ViewLog HTTP, no database changes or new report permissions.
- No mounting candidate UI in the real application; no official release, no PR merge or HTTP 503 removal.
- No claims of a successful visual test before the exact final SHA completes CI.
