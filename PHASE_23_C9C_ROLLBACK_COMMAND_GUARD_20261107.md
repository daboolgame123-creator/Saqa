# Phase 23 C9c — Database rollback command safety gate (analysis first)

Date: 2026-11-07.
Base: PR #41, `46c04d5e75607ed5b682e67631972c46c8f74c0e`, exact-SHA Actions #42413970353 SUCCESS 36/36.
State: internal pilot, reports' official HTTP router remains 503. No real institution host access.

## Confirmed risk
The documented `npm run db:rollback` delegates to `server/src/database/cli.ts down` which today has no production guard or explicit destructive confirmation. The `rollbackMigrations` library runs migration `downSql` directly. Several existing `down` blocks include `DROP TABLE` or `DROP COLUMN`, e.g. 0002/0003/0004 and 0014. Running the command against the wrong DATABASE_URL could irreversibly remove live records. This is an operational command exposure, not a demonstrated attack or current incident.

## Scoped fix
1. Parse CLI args strictly: `--steps N` supported for down, `--confirm-destructive` supported for down; reject unknown/repeated/missing values.
2. Reject `down` in `NODE_ENV=production` **unconditionally**, even with the confirmation flag.
3. In other environments, require the explicit `--confirm-destructive` flag. Validate command/guard before opening any database connection. This is a conscious developer-only operation and still should target disposable data.
4. Leave `rollbackMigrations` library intact: existing isolated migration tests need it to verify down SQL. No database/migration changes to existing production schema.
5. Add no-database unit tests for guard and CLI early refusal, update `.env.example` warning and document `ALSQAYA_REPORT_TIME_ZONE` deployment policy (C9).
6. Run exact-SHA CI (all existing Phase 23 suites, PostgreSQL, authenticated HTTP, Docker, PDF, Chromium).

## Limitations and release gate
- `NODE_ENV` is caller-controlled, so this guard is **not** a foolproof prohibition against someone intentionally pointing non-production tooling at a production database. Production database permissions, operational policy, backup/restore drills, snapshot of attachment files, operator approval and a final target-host readiness check remain mandatory.
- Do not run migrations on institutional hosts, merge drafts, enable reports or remove HTTP 503 in this task.
- Release target and approval are separately controlled by Issue #36.
