import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  authorizeStagingConsole, stagingDatabaseConfig,
  STAGING_BADGE, STAGING_CONFIRMATION, STAGING_NAME,
} from './localStagingEnvironment';

/** No pool, endpoint, key, identity or guard injection, including in integration tests. */
export async function provisionLocalStagingAdmin(confirmation: string): Promise<{
  employeeId: string; accountId: string; temporarySecret: string;
}> {
  const database = stagingDatabaseConfig(process.env);
  if (confirmation !== STAGING_CONFIRMATION) throw new Error('Staging creation was not confirmed.');

  // The original vault captures config at import time. Never import it before preflight.
  const { config } = await import('../server/src/config');
  if (!config.isTest || config.authSecretKey !== process.env.AUTH_SECRET_KEY) {
    throw new Error('Configuration was already loaded differently; start a fresh process.');
  }
  const [{ Pool }, { encryptSecret }, { generateSecret }, { recordAuditEvent }, { loadMigrations }] =
    await Promise.all([
      import('pg'), import('../server/src/auth/secretVault'),
      import('../server/src/auth/crypto'), import('../server/src/audit'),
      import('../server/src/database/migrations'),
    ]);
  const migrations = await loadMigrations();
  const pool = new Pool(database);
  // Do not print driver errors, which may contain connection or query values.
  pool.on('error', () => undefined);
  try {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const identity = await db.query<{ database: string; address: string; port: number }>(
        'SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port',
      );
      const actual = identity.rows[0];
      if (actual?.database !== 'alsqaya_staging' || actual.address !== '127.0.0.1' || actual.port !== 5433) {
        throw new Error('Connected server is not the exact staging endpoint.');
      }
      const applied = await db.query<{ version: number; checksum: string }>(
        'SELECT version, checksum FROM public.schema_migrations ORDER BY version',
      );
      if (applied.rows.length !== migrations.length || applied.rows.some((row, i) =>
        row.version !== migrations[i].version || row.checksum !== migrations[i].checksum)) {
        throw new Error('Apply and review the expected migrations separately.');
      }
      // Conflicts with ordinary INSERT/UPDATE as well as another invocation. No recovery mode.
      await db.query('LOCK TABLE public.employees, public.users IN SHARE ROW EXCLUSIVE MODE');
      if ((await db.query('SELECT 1 FROM public.users LIMIT 1')).rowCount !== 0) {
        throw new Error('Staging must contain zero user accounts.');
      }
      const temporarySecret = generateSecret(20);
      const encrypted = encryptSecret(temporarySecret);
      // No phone: synthetic identity must never address a real OTP recipient.
      const staff = await db.query<{ id: string }>(
        "INSERT INTO public.employees (name, title, department, badge_number, status) " +
        "VALUES ($1, 'Synthetic test only', 'Synthetic staging', $2, 'active') RETURNING id",
        [STAGING_NAME, STAGING_BADGE],
      );
      const employeeId = staff.rows[0].id;
      const account = await db.query<{ id: string }>(
        'INSERT INTO public.users (username, display_name, role, employee_id, status, ' +
        'secret_ciphertext, secret_iv, secret_auth_tag, secret_key_id, must_change_secret, activated_at) ' +
        "VALUES ($1, $2, 'admin', $3, 'active', $4, $5, $6, $7, true, now()) RETURNING id",
        [STAGING_BADGE, STAGING_NAME, employeeId,
          encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyId],
      );
      const accountId = account.rows[0].id;
      for (const [entityKind, entityId] of [['employee', employeeId], ['user_account', accountId]] as const) {
        await recordAuditEvent(db, {
          eventKind: 'create', actor: { userId: null, employeeId: null, sessionId: null },
          entityKind, entityId,
          newValues: { operation: 'synthetic_local_staging_admin', synthetic: true,
            ...(entityKind === 'user_account' ? { role: 'admin', mustChangeSecret: true } : {}) },
        });
      }
      await db.query('COMMIT');
      return { employeeId, accountId, temporarySecret };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally { db.release(); }
  } finally { await pool.end(); }
}

export async function runLocalStagingAdminCli(argv: readonly string[]): Promise<number> {
  try {
    authorizeStagingConsole(argv, process.env,
      process.stdin.isTTY === true && process.stdout.isTTY === true && process.stderr.isTTY === true);
    const ui = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try {
      answer = await ui.question(
        `Synthetic data only. Target: 127.0.0.1:5433/alsqaya_staging.\nType ${STAGING_CONFIRMATION}: `,
      );
    } finally { ui.close(); }
    const created = await provisionLocalStagingAdmin(answer);
    process.stdout.write(`Created ${STAGING_BADGE}. Temporary secret (private, shown once):\n` +
      created.temporarySecret + '\nChange it at first login.\n');
    return 0;
  } catch {
    process.stderr.write('Staging setup stopped. Check destination, key, confirmation, migrations and empty users. No automatic retry.\n');
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
