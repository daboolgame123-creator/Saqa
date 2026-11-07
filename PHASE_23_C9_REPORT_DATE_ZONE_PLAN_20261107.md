# Phase 23 C9 — report calendar zone: analysis before implementation

Date: 2026-11-07
Base: PR #39, SHA `9f0590b33855c15ed7851d2495c7780adc07b417`.
Release posture: DRAFT / NO-GO / HTTP 503 stays intact.

## Confirmed integration defect
`createApiRepositories()` currently constructs `new PgReportRepository(db)`. Its default `dateTimeZone` is `null`, whereas date-filtered book/personnel/ViewLog reports correctly require an explicit institution-owned zone via `ReportDateZoneRequiredError`. Real production service creation has no way to supply the zone today, even though direct DB acceptance tests may supply one explicitly. Thus date filters are not deployable as-is. This is an availability/correctness integration issue, not a proven data leak; public reports remain blocked by HTTP 503.

## Minimal repair plan
1. Introduce an explicit, server-only `ALSQAYA_REPORT_TIME_ZONE` environment setting. Validate it using the runtime's IANA timezone support. Never read a query/browser-provided zone.
2. Wire this setting as the repository constructor default without changing existing explicit constructor overrides. Missing configuration remains `null` and fails closed whenever date filters are supplied; invalid configuration fails immediately without a DB query.
3. Test missing, valid and invalid configurations and SQL parameter binding through the normal repository construction path. Do not infer the institution's timezone from user location or the host machine.
4. Run TypeScript/build + exact-head tests and, if possible, the existing full workflow. Keep this PR stacked and unmerged; do not mount official report routes or remove HTTP 503.

## Separate C9/release gates
Full cumulative 204-commit review, independent security approval, release target selection, production immutable Docker image and Arabic font approval, host watchdog, backup/restore/rollback and explicit owner signoff remain open in Issue #36.
