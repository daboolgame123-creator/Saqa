/**
 * Phase 23 institutional first-admin provisioning candidate.
 *
 * NO HTTP route and NO production authorization. This is a one-time,
 * operator-attended, localhost-database console command. The final host,
 * institutional approval and independent security review remain required.
 */
import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { recordAuditEvent } from '../audit';
import { createPool, withTransaction } from '../database';
import { generateSecret } from './crypto';
import { encryptSecret } from './secretVault';
import { SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from './authTypes';

export interface FirstAdminBootstrapRequest {
  badgeNumber: string;
  approvalReference: string;
  temporarySecret: string;
}

export interface FirstAdminBootstrapResult {
  accountId: string;
  employeeId: string;
}

const APPROVAL_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/-]{5,79}$/;

function validateRequest(request: FirstAdminBootstrapRequest): void {
  if (typeof request.badgeNumber !== 'string' ||
      request.badgeNumber.trim() !== request.badgeNumber ||
      request.badgeNumber.length < 1 || request.badgeNumber.length > 128) {
    throw new Error('First-admin badge number is invalid.');
  }
  if (typeof request.approvalReference !== 'string' ||
      !APPROVAL_REFERENCE.test(request.approvalReference)) {
    throw new Error('First-admin institutional approval reference is invalid.');
  }
  if (typeof request.temporarySecret !== 'string' ||
      request.temporarySecret.trim().length < SECRET_MIN_LENGTH ||
      request.temporarySecret.length > SECRET_MAX_LENGTH) {
    throw new Error('First-admin temporary secret length is invalid.');
  }
}

/**
 * Run only after real institutional approval. The PostgreSQL advisory
 * transaction lock serializes two concurrent local bootstrap attempts.
 * Existing administrators, including blocked/inactive ones, stop bootstrap:
 * recovery of a lost administrator is a SEPARATE, supervised procedure.
 *
 * Important: this core routine is imported by disposable-PostgreSQL tests.
 * The CLI below imposes production, TTY and loopback preflight checks.
 * Never expose this function through an HTTP route.
 */
export async function createFirstAdministrator(
  pool: Pool,
  request: FirstAdminBootstrapRequest,
): Promise<FirstAdminBootstrapResult> {
  validateRequest(request);
  return withTransaction(pool, async db => {
    // Fixed pair, shared by all invocations of this operation in this DB.
    await db.query('SELECT pg_advisory_xact_lock(691042, 23)');
    // Disabled admins must be recovered through a separate approved procedure.
    const existingAdmins = await db.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    );
    if ((existingAdmins.rowCount ?? 0) !== 0) {
      throw new Error('An administrator already exists; bootstrap is permanently disabled.');
    }

    const staff = await db.query<{ id: string; name: string; badge_number: string }>(
      "SELECT id, name, badge_number FROM employees " +
      "WHERE badge_number = $1 AND status = 'active' FOR UPDATE",
      [request.badgeNumber],
    );
    if (staff.rowCount !== 1 || !staff.rows[0]) {
      throw new Error('Verified active personnel record was not found.');
    }
    const employee = staff.rows[0];
    const anyAccount = await db.query(
      'SELECT id FROM users WHERE employee_id = $1 OR username = $2 LIMIT 1',
      [employee.id, employee.badge_number],
    );
    if ((anyAccount.rowCount ?? 0) !== 0) {
      throw new Error('Selected employee already has an account.');
    }

    const encrypted = encryptSecret(request.temporarySecret);
    const created = await db.query<{ id: string }>(
      "INSERT INTO users (" +
      "username, display_name, role, employee_id, status, " +
      "secret_ciphertext, secret_iv, secret_auth_tag, secret_key_id, " +
      "must_change_secret, activated_at) " +
      "VALUES ($1, $2, 'admin', $3, 'active', $4, $5, $6, $7, true, now()) RETURNING id",
      [
        employee.badge_number, employee.name, employee.id,
        encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyId,
      ],
    );
    const accountId = created.rows[0]?.id;
    if (!accountId) {
      throw new Error('Administrator creation did not return an ID.');
    }

    // Audited in the SAME transaction: audit failure aborts user creation.
    // Never record a plaintext code, encryption fields or sensitive staff data.
    await recordAuditEvent(db, {
      eventKind: 'create',
      actor: { userId: null, employeeId: null, sessionId: null },
      entityKind: 'user_account',
      entityId: accountId,
      newValues: {
        operation: 'first_admin_local_bootstrap',
        approvalReference: request.approvalReference,
        mustChangeSecret: true,
        role: 'admin',
      },
    });
    return { accountId, employeeId: employee.id };
  });
}

export interface BootstrapCliInput {
  badgeNumber: string;
  approvalReference: string;
}

/**
 * Conservative console guard. Requires a directly attended production
 * console and loopback PostgreSQL endpoint (local or supervised local
 * tunnel). This does NOT attest institutional approval or certify the host.
 */
export function parseAndAuthorizeBootstrapConsole(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  attendedTty: boolean,
): BootstrapCliInput {
  if (argv.length !== 5 || argv[0] !== '--badge-number' ||
      argv[2] !== '--approval-ref' || argv[4] !== '--execute') {
    throw new Error(
      'Usage: --badge-number VERIFIED_BADGE --approval-ref APPROVED_TICKET --execute',
    );
  }
  const badgeNumber = argv[1] ?? '';
  const approvalReference = argv[3] ?? '';
  // Never accept a secret on the command line, in environment or via a pipe.
  validateRequest({ badgeNumber, approvalReference, temporarySecret: 'ValidationOnly123' });
  if (!attendedTty || env.CI === 'true') {
    throw new Error('First-admin bootstrap requires an attended local TTY, never CI or a pipe.');
  }
  if (env.NODE_ENV !== 'production' || env.AUTH_OTP_PROVIDER !== 'admin') {
    throw new Error('First-admin bootstrap requires explicit production and admin OTP modes.');
  }
  if (!env.AUTH_SECRET_KEY || Buffer.from(env.AUTH_SECRET_KEY, 'base64').length !== 32) {
    throw new Error('First-admin bootstrap requires the persistent 32-byte encryption key.');
  }
  const rawUrl = env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL must be set for the approved local database.');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Database URL invalid; value is not displayed.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('First-admin bootstrap requires a loopback PostgreSQL endpoint.');
  }
  return { badgeNumber, approvalReference };
}

export async function runFirstAdminBootstrapCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let pool: Pool | null = null;
  try {
    const args = parseAndAuthorizeBootstrapConsole(
      argv,
      env,
      process.stdin.isTTY === true && process.stdout.isTTY === true &&
        process.stderr.isTTY === true,
    );
    const ui = createInterface({ input: process.stdin, output: process.stdout });
    let acknowledgement: string;
    try {
      acknowledgement = await ui.question(
        'Confirm institutional approval and an isolated host. Type CREATE FIRST ADMIN: ',
      );
    } finally {
      ui.close();
    }
    if (acknowledgement !== 'CREATE FIRST ADMIN') {
      process.stderr.write('Cancelled: no changes were made.\n');
      return 1;
    }

    // No secret may be supplied in argv. Generated locally for one invocation.
    const temporarySecret = generateSecret(20);
    pool = createPool(env.DATABASE_URL!);
    await createFirstAdministrator(pool, { ...args, temporarySecret });
    process.stdout.write(
      '\nFirst administrator created. Show this temporary secret privately ONCE:\n' +
      temporarySecret + '\nChange it at first login before privileged actions.\n',
    );
    return 0;
  } catch {
    // No SQL, URI, badge or secret values in error output or CI artifacts.
    process.stderr.write('First-admin bootstrap stopped; verify approval, local DB, and account state.\n');
    return 1;
  } finally {
    if (pool) await pool.end();
  }
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  runFirstAdminBootstrapCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
