# Phase 23 — bounded transaction-list checkpoint

Base: `043f6bb8a2003ba4530547d342491c97dfb5815d`. Isolated branch: `integration/phase23-paging-bound-20261107`.

## Analysis and design
The main pilot's `loadTransactions()` expects all visible records; the archived UI already pages 25 records at a time. Applying a server default limit alone would make the main UI silently lose older records. Both HTTP list endpoints now reject explicit `limit>100`, default to 100 when omitted, and permit clients to access older pages. The current API adapter collects every page of 100, detects duplicate IDs, malformed/oversized pages, session changes and errors, and only then exposes a complete list. The archival panel remains unchanged; read scopes, role guards and report HTTP 503 remain in force.

## Evidence required
New real HTTP PostgreSQL regression seeds 101 books, verifies default 100 plus the next record for active and archived, and rejects oversized query limits. Adapter synthetic tests cover complete 102-book pagination and malformed pages. GitHub Actions must pass on exact branch SHA before accepting this checkpoint; no manual local test claimed.

## Known remaining scalability limit
While each database/HTTP list response is bounded, pilot startup still assembles all books in client memory and loads link details for each book. Offset pagination is vulnerable to concurrent insert/delete shifts across requests. For large institutional production archives, move the official list to cursor/on-demand paging with server-side search, consistent UI counts and no partial-preview statistics. Do not conflate this risk reduction with full LAN/PDF/Phase23 approval.
