/**
 * Phase 23 first-admin bootstrap contract regression.
 * Disposable migrated PostgreSQL ONLY; no real identity or live admin.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  createFirstAdministrator,
  parseAndAuthorizeBootstrapConsole,
} from '../../src/auth/firstAdminBootstrap';
import { createAuthServiceOnPool } from '../../src/auth/authService';
import { createAdminOtpProvider } from '../../src/auth/otpProvider';
import { decryptSecret } from '../../src/auth/secretVault';
import {
  resetDomainTables, startTestDatabase, stopTestDatabase,
} from './testDb';

const APPROVAL = 'TEST-APPROVAL-2026';
const SECRET = 'TEST-SYNTHETIC-CHANGE-ME-2026';

async function insertStaff(
  pool: Pool, badgeNumber: string, status: 'active' | 'former' = 'active',
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO employees (name, title, department, badge_number, phone, status) " +
    "VALUES ($1, 'موظف', 'الاختبار', $2, '07700001000', $3) RETURNING id",
    ['Synthetic Verified Employee', badgeNumber, status],
  );
  return result.rows[0].id;
}

describe('Phase 23: first administrator local-only bootstrap candidate', () => {
  let pool: Pool;
  before(async () => {
    ({ pool } = await startTestDatabase());
  });
  after(async () => {
    await stopTestDatabase();
  });
  beforeEach(async () => {
    await resetDomainTables(pool);
  });

  it('creates only the first admin with encrypted secret, forced change and same-transaction audit', async () => {
    const employeeId = await insertStaff(pool, 'BOOT-STAFF-01');
    const created = await createFirstAdministrator(pool, {
      badgeNumber: 'BOOT-STAFF-01', approvalReference: APPROVAL, temporarySecret: SECRET,
    });
    assert.equal(created.employeeId, employeeId);
    const account = await pool.query<{
      id: string; role: string; status: string; must_change_secret: boolean;
      secret_ciphertext: string; secret_iv: string; secret_auth_tag: string;
    }>(
      "SELECT id, role, status, must_change_secret, " +
      "secret_ciphertext, secret_iv, secret_auth_tag FROM users",
    );
    assert.equal(account.rowCount, 1);
    const row = account.rows[0];
    assert.equal(row.id, created.accountId);
    assert.equal(row.role, 'admin');
    assert.equal(row.status, 'active');
    assert.equal(row.must_change_secret, true);
    assert.notEqual(row.secret_ciphertext, SECRET);
    assert.equal(decryptSecret({
      ciphertext: row.secret_ciphertext, iv: row.secret_iv, authTag: row.secret_auth_tag,
    }), SECRET);

    const audits = await pool.query<{
      event_kind: string; entity_id: string; actor_user_id: string | null;
      new_values: Record<string, unknown>;
    }>(
      "SELECT event_kind, entity_id, actor_user_id, new_values FROM audit_logs " +
      "WHERE entity_id=$1", [created.accountId],
    );
    assert.equal(audits.rowCount, 1);
    assert.equal(audits.rows[0].event_kind, 'create');
    assert.equal(audits.rows[0].actor_user_id, null);
    assert.equal(audits.rows[0].new_values.operation, 'first_admin_local_bootstrap');
    assert.equal(audits.rows[0].new_values.approvalReference, APPROVAL);
    assert.equal(JSON.stringify(audits.rows[0]).includes(SECRET), false);

    const auth = createAuthServiceOnPool(pool, createAdminOtpProvider());
    const login = await auth.login({ identifier: 'BOOT-STAFF-01', secret: SECRET });
    assert.equal(login.account.role, 'admin');
    assert.equal(login.mustChangeSecret, true);
  });

  it('refuses second execution even when previous administrator is blocked', async () => {
    await insertStaff(pool, 'BOOT-STAFF-02');
    await insertStaff(pool, 'BOOT-STAFF-03');
    const first = await createFirstAdministrator(pool, {
      badgeNumber: 'BOOT-STAFF-02', approvalReference: APPROVAL, temporarySecret: SECRET,
    });
    await pool.query("UPDATE users SET status='blocked' WHERE id=$1", [first.accountId]);
    await assert.rejects(
      createFirstAdministrator(pool, {
        badgeNumber: 'BOOT-STAFF-03', approvalReference: APPROVAL, temporarySecret: SECRET,
      }),
      /administrator already exists/,
    );
    assert.equal((await pool.query('SELECT id FROM users')).rowCount, 1);
  });

  it('refuses absent, former and pre-registered personnel without creating an administrator', async () => {
    await insertStaff(pool, 'BOOT-FORMER', 'former');
    await insertStaff(pool, 'BOOT-REGISTERED');
    await pool.query(
      "INSERT INTO users(username,display_name,role,employee_id,status) " +
      "SELECT badge_number,name,'employee',id,'inactive' FROM employees " +
      "WHERE badge_number='BOOT-REGISTERED'",
    );
    for (const badgeNumber of ['BOOT-NOT-FOUND', 'BOOT-FORMER', 'BOOT-REGISTERED']) {
      await assert.rejects(
        createFirstAdministrator(pool, {
          badgeNumber, approvalReference: APPROVAL, temporarySecret: SECRET,
        }),
      );
    }
    assert.equal((await pool.query("SELECT id FROM users WHERE role='admin'")).rowCount, 0);
    assert.equal((await pool.query('SELECT id FROM audit_logs')).rowCount, 0);
  });

  it('serializes simultaneous first-admin attempts with different identities', async () => {
    await insertStaff(pool, 'BOOT-RACE-A');
    await insertStaff(pool, 'BOOT-RACE-B');
    const results = await Promise.allSettled([
      createFirstAdministrator(pool, {
        badgeNumber: 'BOOT-RACE-A', approvalReference: APPROVAL, temporarySecret: SECRET,
      }),
      createFirstAdministrator(pool, {
        badgeNumber: 'BOOT-RACE-B', approvalReference: APPROVAL, temporarySecret: SECRET,
      }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await pool.query("SELECT id FROM users WHERE role='admin'")).rowCount, 1);
    assert.equal((await pool.query("SELECT id FROM audit_logs WHERE entity_kind='user_account'")).rowCount, 1);
  });

  it('rejects malformed approval and temporary secret before database mutation', async () => {
    await insertStaff(pool, 'BOOT-VALID');
    for (const change of [
      { approvalReference: 'x' }, { temporarySecret: '' }, { badgeNumber: ' BOOT-VALID ' },
    ]) {
      await assert.rejects(
        createFirstAdministrator(pool, {
          badgeNumber: 'BOOT-VALID', approvalReference: APPROVAL,
          temporarySecret: SECRET, ...change,
        }),
      );
    }
    assert.equal((await pool.query('SELECT id FROM users')).rowCount, 0);
  });

  it('CLI refuses unattended, CI, wrong provider, weak key and nonlocal databases', () => {
    const good = {
      NODE_ENV: 'production', AUTH_OTP_PROVIDER: 'admin',
      DATABASE_URL: 'postgres://test:synthetic@127.0.0.1:5432/alsqaya_staging',
      AUTH_SECRET_KEY: Buffer.alloc(32, 3).toString('base64'),
    };
    const args = ['--badge-number', 'BOOT-STAFF', '--approval-ref', APPROVAL, '--execute'];
    assert.deepEqual(
      parseAndAuthorizeBootstrapConsole(args, good, true),
      { badgeNumber: 'BOOT-STAFF', approvalReference: APPROVAL },
    );
    for (const [environment, attended] of [
      [good, false],
      [{ ...good, CI: 'true' }, true],
      [{ ...good, NODE_ENV: 'development' }, true],
      [{ ...good, AUTH_OTP_PROVIDER: 'log' }, true],
      [{ ...good, AUTH_SECRET_KEY: 'bad' }, true],
      [{ ...good, DATABASE_URL: 'postgres://test:synthetic@192.0.2.1:5432/prod' }, true],
    ] as const) {
      assert.throws(() => parseAndAuthorizeBootstrapConsole(args, environment, attended));
    }
    assert.throws(() => parseAndAuthorizeBootstrapConsole(
      [...args.slice(0, 4), '--not-approved'], good, true,
    ));
  });
});
