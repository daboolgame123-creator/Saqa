# Phase 23 — immutable active-book cursor paging

Base: `66615d9ecd201b3c70e6fd357149d18fea595dd1` (PR #26). Branch: `integration/phase23-cursor-read-20261107`.

## Analysis before implementation
The previous active list used `offset` on a mutable set sorted by editable document date. Archiving a row on an earlier page could silently shift an unread book behind the next offset. The main pilot currently expects all visible books for its menus and link records. A separate **SQL-scoped keyset** route `GET /api/transactions/cursor` now reads by immutable `created_at DESC, id DESC` and returns a PostgreSQL-issued six-digit UTC timestamp to avoid JS millisecond truncation at page boundaries. A partial cursor returns HTTP 400, never an unbounded fallback.

## Compatibility and permissions
The original offset endpoint, administrative archived list/restore, read and edit scope, old filters and 503 formal reporting stay in force. The active pilot adapter only switches its reads to the cursor endpoint. Cursor queries still require the authenticated view role and are scoped within the SQL predicate, before LIMIT. One SQL partial index on active creation order supports larger histories. No change to OpenCode's branches, report/PDF worker or baseline.

## Regression and release evidence
New migrated PG + HTTP tests check (1) 101 synthetic books and archive/insert after the first 100, (2) 105 books with identical microsecond creation timestamp and unique UUID tie-breakers, (3) employee role cannot see admin-only books and malicious/partial cursor parameters return 400. API client tests check 102 records are collected with a preserved six-digit cursor and duplicates/oversized pages abort. Verify TypeScript, build, browser, server, PostgreSQL, HTTP API and formal report 503 via this branch's exact-SHA GitHub Actions; no run presumed successful before it completes.

## Remaining limits
Cursor paging avoids positional shifts caused by normal API operations; it does **not** provide an immutable snapshot across HTTP requests. Books archived before being read can disappear legitimately; direct administrator manipulation of `created_at` breaks the assumption. The pilot still accumulates all books and link rows in memory: server-rendered search and on-demand list virtualization must be designed separately for very large deployments. Institutional LAN and secure PDF host approval still block Phase 23 production closure.
