# Phase 23 — Safe release and rollback preflight (C9c; operational contract)

Source review date: 2026-11-07. This document is a checklist, **not** an attestation that the institutional host has passed.

## 1. Source and candidate release SHA
- Last approved candidate is the **exact SHA from the successful CI**, not an independently advancing branch name.
- Keep the stacked PR chain #23/#24/#26–#35/#37–#41 and this C9c PR in DRAFT until authorized review and target branch selection.
- Compare cumulative changes with the chosen *existing* release/integration base; do not bulk-merge into `phase-0-baseline` simply because that branch is the GitHub default.
- No HTTP report enablement: `/api/reports*` remains hard HTTP 503 and the candidate UI is not mounted.

## 2. Database and file safety
1. Identify the actual environment, maintenance window, migration version, PostgreSQL version and DB service account **without logging credentials**.
2. Stop or isolate writes for an agreed consistency point. Obtain an encrypted, access-controlled, checksum-verified **PostgreSQL backup** (including roles/extensions needed for restore) and a **matching ATTACHMENT_STORAGE_DIR snapshot**. Preserve the previous app build and configuration.
3. In a disposable staging installation, restore **both** PostgreSQL and attachments from those artifacts; prove that employee counts, transaction counts, ViewLog counts, file hashes and representative permissions match a recorded manifest. Ensure imported records and audit history remain present. No actual institutional backups have been taken by this task.
4. Run `npm run db:status`, migration checks and read/write smoke tests in staging **before** any production migration. Make an explicit compatibility decision for rolling app code back across migrations.
5. Production `npm run db:rollback` is **prohibited by the CLI**. In disposable non-production environments only, it requires `npm run db:rollback -- --confirm-destructive [--steps N]`. This guard does not prove that DATABASE_URL points to disposable data: human verification and DB permissions remain necessary.
6. **Never** use migration `down` as an incident-recovery backup. Existing down SQL includes `DROP TABLE` and `DROP COLUMN`, which can destroy data. For rollback after writes, stop traffic and follow the explicit tested restore/cutover plan with an approved maximum acceptable loss and reconciliation of later writes.

## 3. Report-specific production gate
- Get an explicit IANA `ALSQAYA_REPORT_TIME_ZONE` approved by the institution; configure it in the *server* environment. Missing/invalid setting must reject calendar-bound reports rather than use a browser/host default.
- Verify real-role (admin/director/employee/archivist) session isolation and access-scope behavior using **synthetic staging accounts and data** only. The intentional 503 guard stays until a separate approved go-live decision.
- Validate report row caps including historical ViewLog: 2000 complete rows accepted, 2001 rejected with no fabricated summary; exports may never bypass this cap.
- Approve production Docker image by digest, Arabic font identity/licensing/checksum, no-network/run-as-nonroot boundaries, abort/timeout containment, restart/SIGKILL watchdog and daemon-side container cleanup after a crash on the *target host*.
- Have a human reviewer approve at least Arabic RTL PDF output of monthly/incoming/acknowledgement sample pages and representative XLSX. Test under actual OS, PDF viewer and printer policy.
- Ensure service/session, request logging and backup/restore procedures do not leak bearer secrets, user data or attachment contents.

## 4. Approvals and outcomes
A release decision must record **who** approved: (a) cumulative code/security review, (b) target integration branch and ordered merge, (c) operational backup and restored file snapshots, (d) immutable PDF runtime/font and watchdog, (e) Arabic RTL visual acceptance, (f) report enablement separately. Each decision cites exact SHA, evidence date, host/probe environment and a roll-forward/restore owner.

If any item remains unverified: `PHASE23_RELEASE_NO_GO`. Passing GitHub Actions is a code/integration gate only, not production host security proof.
