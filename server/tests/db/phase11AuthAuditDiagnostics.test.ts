/**
 * Phase 11-A diagnostic reproduction ONLY. The two assertions intentionally
 * capture the CURRENT unsafe behavior; Phase 11-B must replace them with
 * the secure acceptance invariants and fix the implementation.
 *
 * Uses an embedded, disposable PostgreSQL cluster on the test-only port.
 * NEVER targets alsqaya_staging or any real person's data.
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

describe('Phase 11-A: diagnostic-only authentication concurrency reproduction', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase());
  });
  beforeEach(async () => {
    await resetDomainTables(pool);
  });
  after(async () => {
    await stopTestDatabase();
  });

  async function employee(badge: string, phone: string): Promise<void> {
    await pool.query(
      `INSERT INTO employees (name, title, department, badge_number, phone, status)
       VALUES ('منتسب اختبار اصطناعي', 'معاون', 'قسم اختبار', $1, $2, 'active')`,
      [badge, phone],
    );
  }

  it('DIAGNOSTIC: six concurrent OTP requests pass the five-per-window quota', async () => {
    const badgeNumber = 'PH11-OTP-0001';
    const phone = '07701110001';
    await employee(badgeNumber, phone);

    const otp = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: otp });
    const original = OtpRepository.prototype.countRequestsSince;

    let arrived = 0;
    let open!: () => void;
    const barrier = new Promise<void>((resolve) => { open = resolve; });
    let allRead!: () => void;
    const allReadBarrier = new Promise<void>((resolve) => { allRead = resolve; });
    OtpRepository.prototype.countRequestsSince = async function(phoneArg, sinceIso) {
      const count = await original.call(this, phoneArg, sinceIso);
      arrived++;
      if (arrived === 6) allRead();
      await barrier;
      return count;
    };
    try {
      const calls = Array.from({ length: 6 }, () =>
        auth.requestRegistrationOtp({ badgeNumber, phone }),
      );
      // All six have read the same stale counter BEFORE any OTP is inserted.
      await allReadBarrier;
      open();
      const results = await Promise.allSettled(calls);
      const accepted = results.filter((item) => item.status === 'fulfilled').length;
      const row = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM auth_otp_codes WHERE phone = $1',
        [phone],
      );

      // These reproduce an observed violation rather than passing the security
      // requirement. The Phase 11-B test must instead assert accepted <= 5.
      assert.equal(accepted, 6);
      assert.equal(Number(row.rows[0].count), 6);
    } finally {
      open();
      OtpRepository.prototype.countRequestsSince = original;
    }
  });

  it('DIAGNOSTIC: an old password can finish logging in after successful secret rotation', async () => {
    const badgeNumber = 'PH11-LOGIN-0001';
    const phone = '07701110002';
    const oldSecret = 'SyntheticOldSecret42';
    const newSecret = 'SyntheticNewSecret57';
    await employee(badgeNumber, phone);

    const otp = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: otp });
    await auth.requestRegistrationOtp({ badgeNumber, phone });
    const code = otp.lastCodeFor(phone, 'registration');
    assert.ok(code);
    const account = await auth.verifyRegistrationOtp({ phone, code, secret: oldSecret });
    const session = await auth.login({ identifier: badgeNumber, secret: oldSecret });

    // Hold the second login precisely after its account/secret snapshot was
    // read but before it compares the old secret or creates a new session.
    const original = AccountRepository.prototype.findByUsername;
    let read!: () => void;
    const sawSnapshot = new Promise<void>((resolve) => { read = resolve; });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
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
      await auth.changeOwnSecret(actor, {
        currentSecret: oldSecret,
        newSecret,
      });

      release();
      const lateLogin = await delayed;
      // A request created after rotation should NOT be allowed to use the old
      // password. Currently the newly issued bearer is valid anyway.
      const resolved = await auth.resolveSession(lateLogin.sessionToken);
      assert.equal(resolved.userId, account.id);
    } finally {
      release();
      AccountRepository.prototype.findByUsername = original;
    }
  });
});
