# Phase 24-D — Offline PostgreSQL + attachments backup and restore

**Status: HYBRID / TECHNICALLY_VERIFIED_SYNTHETIC / HOST_UAT_PENDING / RELEASE_NO_GO.**
Base SHA: d04ec7521ecbfa5a95bdff76cc94a52f0abb691a; target branch: phase-10-api-data-layer.
There are no changes to 24-C, schema, authentication, the official-report release gate, HTTP routes or real data.

## Design decisions (analysis and planning before implementation)

PostgreSQL owns metadata, transactions, view_logs and audit_logs. File bytes live separately in ATTACHMENT_STORAGE_DIR under blobs/<stable-ID> partition directories. Metadata stores the attachment stable ID, storage key, optional size and optionally a sha256: hash. Migration 0015 is a PostgreSQL index, not a data recovery mechanism: NEVER use db:rollback to recover institution records.

A logical database snapshot is NOT an atomic filesystem snapshot. This version therefore uses an explicit **offline write-free maintenance interval**. Before backup, a responsible operator must stop all API processes, jobs, imports, direct database writers and attachment uploads, block new writes, and verify quiescence for the full backup duration. The tool cannot stop the institution applications or independently establish the lock; the --confirm-writers-stopped flag records operator acknowledgment, nothing more. For always-online backups, a different coordinated snapshot/WAL strategy is required.

Backup steps:
1. Record database row counts, attachment references and migration version/checksums.
2. Check installed migration 0015 against the checked-in SQL file checksum.
3. Write a custom pg_dump to a new private .partial.<random> directory.
4. Inventory all regular attachment files; deny symlinks, nonregular files, unfinished .partial uploads, missing DB-referenced files, wrong stable-ID keys, mismatched sizes and verifiable hashes.
5. Copy and hash files; recheck source inventory and the selected database state (counts, migrations, attachment metadata). Any observed change aborts.
6. Write a SHA-256 manifest LAST; independently verify every listed file and refuse unlisted extras, corruption and unsafe paths. Atomically rename staging into a new destination on the same volume. Failed staging is removed; existing backup destinations are NEVER overwritten.

Test restore steps:
1. Verify entire bundle first; perform NO target operation if incomplete/corrupted.
2. Require NODE_ENV=test, --confirm-empty-test-db, an actual connected database name starting alsqaya_restore_test_, and an empty public schema.
3. Restore the custom dump with pg_restore --single-transaction directly into this disposable target. Only the non-secret target DB name appears in process arguments; host, username and password are supplied through libpq environment variables, never a connection URI in command arguments.
4. Re-query counts, attachment metadata and migration checksums; they must match the saved state. Restore file bytes into a new directory, compare SHA-256 and references, then promote. On error, the test operator must discard the disposable test DB. This CLI deliberately has NO production restore mode.

## Runbook (only after operational approval)

Requires Python 3.10+, compatible psql/pg_dump/pg_restore and a secure volume outside the source attachment root. Set DATABASE_URL and ATTACHMENT_STORAGE_DIR through the approved secret manager, never directly in source files or shell command arguments. After supervisor authorization and confirmation that ALL writers are stopped, execute from the repository root:

    python3 ops/phase24_backup.py backup --storage-root "$ATTACHMENT_STORAGE_DIR" --output /secure/offhost/alsqaya-2026-11-10 --confirm-writers-stopped
    python3 ops/phase24_backup.py verify --bundle /secure/offhost/alsqaya-2026-11-10

A .partial directory or bundle missing manifest.json is NOT an accepted backup. Resume writers only after verification, protective encryption and secure off-host replication. Record responsible operator, host, versions and maintenance interval.

To rehearse without institution data, provision a new EMPTY database on an isolated test PostgreSQL instance, with a name such as alsqaya_restore_test_ci; create no application tables in advance. Set NODE_ENV=test and RESTORE_TEST_DATABASE_URL to the test database connection, then run:

    python3 ops/phase24_backup.py restore-test --bundle /secure/offhost/alsqaya-2026-11-10 --storage-output /isolated/test/attachments --confirm-empty-test-db

Verify selected preserved view_logs and audit_logs as well as counts, migrate compatibility, application read operations and file SHA-256 in the isolated environment. Discard/recreate the synthetic test instance when needed, NEVER the institutional database.

## Operational protections, exclusions and acceptance

The manifest contains sensitive attachment identifiers. SHA-256 verifies accidental corruption but cannot stop malicious changes to both the data and manifest. Before host acceptance: configure least privilege, encryption at rest, immutable or cryptographically signed backups, retention, secure off-host and offline copies, backup job logs, recoverable credentials, RPO/RTO and supervised restore drill. Explicitly escrow AUTH_SECRET_KEY and other application secrets in an independent approved vault. A logical database dump does not restore system roles, server configuration, file ACLs, TLS keys or encryption-key custody.

Tests:
- Unit/negative: python3 -m unittest discover -s ops -p 'test_phase24_backup.py' -v
- Real migrated synthetic PostgreSQL: .github/workflows/phase24-d-backup-restore.yml. Must be SUCCESS on exact head SHA; collect run and job links.
- Failure tests: manifest missing, blob missing, wrong hash/size, path traversal, symlinks, partial upload, unexpected files, rejected wrong/nonempty target, database metadata mismatch.
- Offline consistency: requires an actual host maintenance procedure and evidence; no unit test or CI can verify cessation of every institutional writer.
- Production approval: requires operator-managed real recovery drill and independent security review. Synthetic CI SUCCESS does not authorize deployment or activation of official reports.

**HOLD:** Keep OFFICIAL_REPORTS_RELEASE_APPROVED=false and official HTTP 503; do not merge PR #1, auto-merge this PR, deploy, or restore real institutional data. Mark Phase 24-D fully CLOSED only with technical CI, security review and institutional recovery acceptance.

## 24-F combined verification (integration branch only, 2026-11-10)

Source PR #54 head `265c2d23ba3e0d519749bd851db9354b74cd4c69` and successful source CI `42788324145` verified before integration. Source files imported unchanged into Draft [PR #56](https://github.com/daboolgame123-creator/Saqa/pull/56).

Combined code SHA `2f9f9c26b302cfdc739b846406c0b07cdb75e5f9`: [CI 42808640462](https://github.com/daboolgame123-creator/Saqa/actions/runs/42808640462), recovery job `129804140824`, **SUCCESS**. Raw logs show **21/21 unit/negative tests, no failures/skips**, migrations 1–15 on disposable PostgreSQL 16, and one real synthetic backup/verify/empty-database restore scenario PASS, including attachment bytes, migration/metadata/count comparison, view/audit log counts and corruption refusal. No institutional database was used. User explicitly approved these disposable test migrations.

Independent integration security review confirmed staging/verification, safe-file checks and test-only restore guards; institutional limitations above remain open. Full API/attachment regressions passed separately on the same combined SHA; they are not represented as an institutional restored-application readiness drill. Final documentation-head CI and exact commit evidence will be recorded in PR #56 before delivery; full ledger: `PHASE_24_F_INTEGRATION.md`.

The restored database was not exercised through the application/API; browser/API suites use separate fixtures and do not establish restored-application readiness.
