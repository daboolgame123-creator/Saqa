# Phase 23 C9b — Owner-only historical ViewLog bounded SQL

**Analysis before implementation — 2026-11-07**
Parent PR #40 at `b1d97bfdc8006ba9d401269956c7ca04804af574`, CI #42412776883 SUCCESS (36/36).
Official reports remain HTTP 503; this is an internal-only path.

## Confirmed review finding
`readOwnCircularAcknowledgements` currently reads all matching rows of one employee's historic ViewLog with an unbounded SQL query before deduplicating by circular. Its `runOwnAcknowledgementReport` caller checks only the final deduplicated entry count, so 2001+ raw rows for one circular can be read and collapsed into a single result without triggering the cap. This is a realistic workload/memory admission issue, *not* a demonstrated live HTTP exposure. The privileged circular reader was bounded in C8, but the separately gated own-only reader was not.

## Minimal repair plan
1. Reuse C8's `boundReportSql` to append a server-owned `LIMIT $N` sentinel value 2001 after existing owner predicate and stable ORDER BY. No client limit.
2. `requireCompleteReportRows` on raw 0–2001 rows BEFORE grouping/deduplication, ensuring a full history or explicit refusal; never silently truncate conflicts across date periods.
3. Preserve the legacy own-only service/export failure contract: translate the shared oversized result into `OwnAcknowledgementExportError` at the dedicated service boundary; retain the independent post-dedup row/text caps.
4. Test accepted 2000 identical rows, rejected 2001 rows in repository and own service, parameterized sentinel and owner scope, plus existing owner-only regression.
5. Run exact SHA CI including full server + database + HTTP and synthetic Chrome/Docker tests. Keep Draft/NO-GO and do not merge.

## Still open
Independent cumulative 200+ commit security review, release target and merge authorization, operational Docker image/watchdog/fonts, host backup/restore/rollback, human RTL approval and explicit owner enablement (Issue #36).
