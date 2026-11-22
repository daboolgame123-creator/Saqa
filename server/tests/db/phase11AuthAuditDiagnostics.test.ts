/**
 * Phase 11-B acceptance regressions. These assertions now demand SAFE
 * behavior, unlike Phase 11-A's diagnostic reproductions.
 * Synthetic embedded PostgreSQL ONLY; never touches alsqaya_staging.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { AccountRepository } from '../../src/auth/accountRepository';
import { AuthService } from '../../src/auth/authService';
import { OtpRepository } from '../../src/auth/otpRepository';
import { createTestOtpProvider } from '../../src/auth/otpProvider';
import type { AuthenticatedIdentity } from '../../src/auth/authTypes';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

describe('Phase 11-B: authentication races must be rejected', () => {
  let pool: Pool;
  before(async () => { ({ pool } = await startTestDatabase()); });
  beforeEach(async () => { await resetDomainTables(pool); });
  after(async () => { await stopTestDatabase(); });

  async function employee(badge: string, phone: string): Promise<void> {
    await pool.query(
      `INSERT INTO employees (name, title, department, badge_number, phone, status)
       VALUES ('منتسب اختبار اصطناعي', 'معاون', 'قسم اختبار', $1, $2, 'active')`,
      [badge, phone],
    );
  }

  it('P11-01: only five of six concurrent OTP requests may issue; sixth block and audit persist', async () => {
    const badgeNumber = 'PH11-OTP-0001';
    const phone = '07701110001';
    await employee(badgeNumber, phone);
    const provider = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: provider });
    // Widen the old read-count/write race without installing a deadlocking
    // barrier: under the fixed implementation each caller holds the lock.
    const original = OtpRepository.prototype.countRequestsSince;
    OtpRepository.prototype.countRequestsSince = async function (phoneArg, sinceIso) {
      const count = await original.call(this, phoneArg, sinceIso);
      await new Promise<void>(resolve => setTimeout(resolve, 8));
      return count;
    };
    try {
      const results = await Promise.allSettled(Array.from({ length: 6 },
        () => auth.requestRegistrationOtp({ badgeNumber, phone })));
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected');
      assert.equal(successes, 5);
      assert.equal(failures.length, 1);
      const reason: unknown = (failures[0] as PromiseRejectedResult).reason;
      assert.equal((reason as { code?: string }).code, 'OTP_RATE_LIMITED');

      const count = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM auth_otp_codes WHERE phone = $1', [phone]);
      assert.equal(Number(count.rows[0].count), 5);
      const blocked = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM auth_otp_rate_limits WHERE phone = $1 AND blocked_until > now()', [phone]);
      assert.equal(Number(blocked.rows[0].count), 1);
      const audits = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE event_kind = 'otp_event'
           AND new_values::text LIKE '%rate_limited%'`);
      assert.ok(Number(audits.rows[0].count) >= 1);

      // The same block must apply across OTP purposes.
      await assert.rejects(auth.requestRecoveryOtp(phone), (err: unknown) =>
        (err as { code?: string }).code === 'OTP_RATE_LIMITED');
    } finally {
      OtpRepository.prototype.countRequestsSince = original;
    }
  });

  it('P11-02: password rotated after initial read cannot mint a usable late session', async () => {
    const badgeNumber = 'PH11-LOGIN-0001';
    const phone = '07701110002';
    const oldSecret = 'SyntheticOldSecret42';
    const newSecret = 'SyntheticNewSecret57';
    await employee(badgeNumber, phone);

    const provider = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: provider });
    await auth.requestRegistrationOtp({ badgeNumber, phone });
    const code = provider.lastCodeFor(phone, 'registration');
    assert.ok(code);
    const account = await auth.verifyRegistrationOtp({ phone, code, secret: oldSecret });
    const session = await auth.login({ identifier: badgeNumber, secret: oldSecret });

    const original = AccountRepository.prototype.findByUsername;
    let read!: () => void;
    const sawSnapshot = new Promise<void>(resolve => { read = resolve; });
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    let trap = true;
    AccountRepository.prototype.findByUsername = async function(username) {
      const snapshot = await original.call(this, username);
      if (trap && username === badgeNumber) {
        trap = false;
        read();
        await hold;
      }
      return snapshot;
    };

    try {
      const delayed = auth.login({ identifier: badgeNumber, secret: oldSecret });
      await sawSnapshot;
      const actor: AuthenticatedIdentity = {
        userId: account.id,
        employeeId: account.employeeId,
        sessionId: session.sessionId,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        mustChangeSecret: false,
      };
      await auth.changeOwnSecret(actor, { currentSecret: oldSecret, newSecret });
      release();
      await assert.rejects(delayed, (err: unknown) =>
        (err as { code?: string }).code === 'INVALID_CREDENTIALS');
      const active = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [account.id],
      );
      assert.equal(Number(active.rows[0].count), 0);
      const newLogin = await auth.login({ identifier: badgeNumber, secret: newSecret });
      assert.equal((await auth.resolveSession(newLogin.sessionToken)).userId, account.id);
    } finally {
      release();
      AccountRepository.prototype.findByUsername = original;
    }
  });

  it('P11-03: unfreeze never changes an administratively blocked or still-frozen account', async () => {
    const badgeNumber = 'PH11-FREEZE-0001', phone = '07701110003';
    await employee(badgeNumber, phone);
    const provider = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: provider });
    await auth.requestRegistrationOtp({ badgeNumber, phone });
    const code = provider.lastCodeFor(phone, 'registration');
    assert.ok(code);
    const account = await auth.verifyRegistrationOtp({ phone, code, secret: 'SyntheticSecret42' });
    const repo = new AccountRepository(pool);
    await repo.setStatus(account.id, 'frozen', new Date(Date.now() + 60_000).toISOString());
    assert.equal(await repo.unfreeze(account.id), null);
    await repo.setStatus(account.id, 'blocked', null);
    assert.equal(await repo.unfreeze(account.id), null);
    assert.equal((await repo.findById(account.id))?.status, 'blocked');
    assert.equal(await repo.freeze(account.id, new Date(Date.now() + 60_000).toISOString()), null);
    assert.equal((await repo.findById(account.id))?.status, 'blocked');
    await repo.setStatus(account.id, 'frozen', new Date(Date.now() - 60_000).toISOString());
    assert.equal((await repo.unfreeze(account.id))?.status, 'active');
  });
});
