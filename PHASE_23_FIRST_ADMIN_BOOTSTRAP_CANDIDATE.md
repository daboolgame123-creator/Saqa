# Phase 23 — First administrator local bootstrap candidate

**Status:** DRAFT / CODE REVIEW REQUIRED / SYNTHETIC CI REQUIRED / INSTITUTIONAL APPROVAL REQUIRED / NO GO-LIVE.
**Source base:** immutable RC1 at dd5ebf6d8db173551692d53e8cc2e753540b6ff9.
**Scope:** unblock initial admin account creation without SMS. NOT account recovery for a lost last admin, and NOT public signup.

## Operator prerequisites (not yet attested)

1. A named institution owner and a second operator approve an identified active employee as initial Saqaya administrator. Store their signed, nonsecret authorization reference outside this repository.
2. Prepare and verify the actual PostgreSQL database, migrations, approved environment, permissions, and a consistent database+attachments backup/restore. Do not bootstrap into test or unknown databases.
3. The active personnel row MUST already exist with a unique verified badge. No fictitious employee is created by the CLI.
4. Secure a persistent 32-byte base64 AUTH_SECRET_KEY in host secret storage, with separately approved backup/key recovery. Never store it in git, CLI arguments or CI artifacts.
5. Secure a real unattended-network-excluded server console, with NODE_ENV=production, AUTH_OTP_PROVIDER=admin and a local PostgreSQL endpoint (localhost / 127.0.0.1 / ::1, or a supervised local tunnel). HTTPS, LAN isolation and remaining host signoff are separate release gates.
6. Do not record the console or mirror its output into ticketing or terminal logs. The generated temporary administrator secret is shown once and must be delivered privately to the verified administrator.

## Candidate CLI (DO NOT RUN BEFORE APPROVAL)

After reviewing the exact source, infrastructure and a successful disposable staging acceptance, an authorized operator may invoke from a secured, interactive local terminal:

    node --import tsx server/src/auth/firstAdminBootstrap.ts --badge-number VERIFIED_BADGE --approval-ref APPROVED_TICKET --execute

The CLI requires exact flags, a real TTY, production admin provider, 32-byte encryption key, local PostgreSQL connection, and an explicit typed confirmation. No password or raw secret is allowed in arguments; a cryptographically random 20-character temporary secret is generated in process and displayed only after the committed transaction. CLI refusal prints no secret, badge or DATABASE_URL.

## Database transaction contract

- A fixed transaction-level PostgreSQL advisory lock serializes concurrent bootstrap attempts.
- Any existing administrator (even disabled) is a hard refusal. Emergency recovery is NOT this tool.
- The target must be a verified active employee with no existing user account. Employee row is locked and constraints enforce unique username/employee linkage.
- A single transaction writes the active admin account with AES-GCM encrypted temporary secret, must_change_secret=true, and a sanitized create audit event referencing the authorization ticket. Audit failure aborts the account creation.
- Login with temporary secret requires immediate self-secret change before privileged actions. Regular C15 employee registration still hardcodes role=employee. Report release gate stays OFF/503.

## Synthetic test acceptance

The added isolated PostgreSQL tests cover one-time creation, encrypted secret, login in forced-change state, audit/no-plaintext, already-admin refusal (including blocked admin), missing/former/existing employee rejection, two concurrent issuers, validation rejection, and explicit console deny cases. TypeScript checking and synthetic DB tests must pass on the exact proposed SHA. This evidence does NOT prove target-host approval.

## Emergency recovery and rollback

- If an admin already exists but is inaccessible, stop. A separate institution-approved dual-operator, audited break-glass procedure is required; never delete the original account to reuse first-run bootstrap.
- If the transaction fails, it rolls back. If the transaction commits but the temporary code is lost before the private handoff, stop and perform an independently approved admin recovery operation; do not rerun bootstrap or manually change roles/passwords.
- Preserve the authentication encryption key as securely as the database and ensure paired restoration of PostgreSQL+attachments; loss of the key invalidates decrypted secrets.
- Do NOT use db:rollback for incident recovery. No institutional account or production deployment was touched while creating this candidate.

## Release decision

This candidate is not merged into RC1 and not authorized for an institutional host. Require focused independent security review, full regression, host operator acceptance, and explicit owner permission before any source merge or execution.
