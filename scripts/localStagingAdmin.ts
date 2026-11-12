import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { formatStagingFailure, StagingDiagnosticContext, stagingGuardError } from './localStagingDiagnostics';
import {
  authorizeStagingConsole, stagingDatabaseConfig,
  STAGING_BADGE, STAGING_CONFIRMATION, STAGING_NAME,
} from './localStagingEnvironment';

/** No pool, endpoint, key, identity or guard injection, including in integration tests. */
export async function provisionLocalStagingAdmin(confirmation: string): Promise<{
  employeeId: string; accountId: string; temporarySecret: string;
}> {
  const diagnostic = new StagingDiagnosticContext();
  try {
    const database = stagingDatabaseConfig(process.env);
    diagnostic.stage = 'confirmation';
    if (confirmation !== STAGING_CONFIRMATION) {
      throw stagingGuardError('CONFIRMATION_REQUIRED', 'Staging creation was not confirmed.');
    }

    // The original vault captures config at import time. Never import it before preflight.
    diagnostic.stage = 'config';
    const { config } = await import('../server/src/config');
    if (!config.isTest || config.authSecretKey !== process.env.AUTH_SECRET_KEY) {
      throw stagingGuardError('CONFIG_MISMATCH', 'Configuration was already loaded differently; start a fresh process.');
    }
    diagnostic.stage = 'dependencies';
    const [{ Pool }, { encryptSecret }, { generateSecret }, { recordAuditEvent }, { loadMigrations }] =
      await Promise.all([
        import('pg'), import('../server/src/auth/secretVault'),
        import('../server/src/auth/crypto'), import('../server/src/audit'),
        import('../server/src/database/migrations'),
      ]);
    diagnostic.stage = 'migration_files';
    const migrations = await loadMigrations();
    diagnostic.stage = 'pool';
    const pool = new Pool(database);
    // Do not print driver errors, which may contain connection or query values.
    pool.on('error', () => undefined);
    try {
      diagnostic.stage = 'connect';
      const db = await pool.connect();
      let commitAttempted = false;
      try {
        diagnostic.stage = 'begin';
        diagnostic.outcome = 'UNKNOWN';
        await db.query('BEGIN');
        diagnostic.stage = 'identity';
        const identity = await db.query<{ database: string; address: string; port: number }>(
          'SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port',
        );
        const actual = identity.rows[0];
        if (actual?.database !== 'alsqaya_staging' || actual.address !== '127.0.0.1' || actual.port !== 5433) {
          throw stagingGuardError('IDENTITY_MISMATCH', 'Connected server is not the exact staging endpoint.');
        }
        diagnostic.stage = 'migration_ledger';
        const applied = await db.query<{ version: number; checksum: string }>(
          'SELECT version, checksum FROM public.schema_migrations ORDER BY version',
        );
        if (applied.rows.length !== migrations.length || applied.rows.some((row, i) =>
          row.version !== migrations[i].version || row.checksum !== migrations[i].checksum)) {
          throw stagingGuardError('MIGRATION_MISMATCH', 'Apply and review the expected migrations separately.');
        }
        // Conflicts with ordinary INSERT/UPDATE as well as another invocation. No recovery mode.
        diagnostic.stage = 'lock';
        await db.query('LOCK TABLE public.employees, public.users IN SHARE ROW EXCLUSIVE MODE');
        diagnostic.stage = 'empty_users';
        if ((await db.query('SELECT 1 FROM public.users LIMIT 1')).rowCount !== 0) {
          throw stagingGuardError('USERS_NOT_EMPTY', 'Staging must contain zero user accounts.');
        }
        diagnostic.stage = 'encryption';
        const temporarySecret = generateSecret(20);
        const encrypted = encryptSecret(temporarySecret);
        // No phone: synthetic identity must never address a real OTP recipient.
        diagnostic.stage = 'employee_insert';
        const staff = await db.query<{ id: string }>(
          "INSERT INTO public.employees (name, title, department, badge_number, status) " +
          "VALUES ($1, 'Synthetic test only', 'Synthetic staging', $2, 'active') RETURNING id",
          [STAGING_NAME, STAGING_BADGE],
        );
        const employeeId = staff.rows[0].id;
        diagnostic.stage = 'account_insert';
        const account = await db.query<{ id: string }>(
          'INSERT INTO public.users (username, display_name, role, employee_id, status, ' +
          'secret_ciphertext, secret_iv, secret_auth_tag, secret_key_id, must_change_secret, activated_at) ' +
          "VALUES ($1, $2, 'admin', $3, 'active', $4, $5, $6, $7, true, now()) RETURNING id",
          [STAGING_BADGE, STAGING_NAME, employeeId,
            encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyId],
        );
        const accountId = account.rows[0].id;
        for (const [entityKind, entityId] of [['employee', employeeId], ['user_account', accountId]] as const) {
          diagnostic.stage = entityKind === 'employee' ? 'employee_audit' : 'account_audit';
          await recordAuditEvent(db, {
            eventKind: 'create', actor: { userId: null, employeeId: null, sessionId: null },
            entityKind, entityId,
            newValues: { operation: 'synthetic_local_staging_admin', synthetic: true,
              ...(entityKind === 'user_account' ? { role: 'admin', mustChangeSecret: true } : {}) },
          });
        }
        diagnostic.stage = 'commit';
        commitAttempted = true;
        await db.query('COMMIT');
        diagnostic.outcome = 'COMMITTED';
        return { employeeId, accountId, temporarySecret };
      } catch (error) {
        error = diagnostic.capture(error);
        await diagnostic.cleanup('rollback', async () => {
          await db.query('ROLLBACK');
          // A lost COMMIT acknowledgement cannot establish whether it committed.
          if (!commitAttempted) diagnostic.outcome = 'ROLLED_BACK';
        });
        throw error;
      } finally { await diagnostic.cleanup('release', () => db.release()); }
    } catch (error) { throw diagnostic.capture(error); }
    finally { await diagnostic.cleanup('pool_end', () => pool.end()); }
  } catch (error) { throw diagnostic.capture(error); }
}

export async function runLocalStagingAdminCli(argv: readonly string[]): Promise<number> {
  const diagnostic = new StagingDiagnosticContext();
  try {
    authorizeStagingConsole(argv, process.env,
      process.stdin.isTTY === true && process.stdout.isTTY === true && process.stderr.isTTY === true);
    diagnostic.stage = 'confirmation';
    const ui = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try {
      answer = await ui.question(
        `Synthetic data only. Target: 127.0.0.1:5433/alsqaya_staging.\nType ${STAGING_CONFIRMATION}: `,
      );
    } finally { ui.close(); }
    const created = await provisionLocalStagingAdmin(answer);
    diagnostic.stage = 'secret_output';
    diagnostic.outcome = 'COMMITTED';
    process.stdout.write(`Created ${STAGING_BADGE}. Temporary secret (private, shown once):\n` +
      created.temporarySecret + '\nChange it at first login.\n');
    return 0;
  } catch (error) {
    process.stderr.write(formatStagingFailure(error, diagnostic));
    return 1;
  }
}

function isDirectRun(): boolean {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isDirectRun()) {
  void runLocalStagingAdminCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
