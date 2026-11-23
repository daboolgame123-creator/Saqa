/**
 * Phase11-C: rejected / unmatched OTP requests must count toward the same
 * per-phone quota, without leaking registration/recovery account existence.
 * Synthetic embedded PostgreSQL ONLY.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { AuthService } from '../../src/auth/authService';
import { createAdminOtpProvider, createTestOtpProvider } from '../../src/auth/otpProvider';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

describe('Phase11-C: nonmatching OTP requests still consume phone quota', () => {
  let pool: Pool;
  before(async () => { ({ pool } = await startTestDatabase()); });
  beforeEach(async () => { await resetDomainTables(pool); });
  after(async () => { await stopTestDatabase(); });

  it('wrong badge with a known phone: five neutral responses then 429, with no code sent', async () => {
    const phone = '07701110021';
    await pool.query(
      `INSERT INTO employees (name, title, department, badge_number, phone, status)
       VALUES ('Synthetic Account', 'Staff', 'Synthetic', 'P11-C-0001', $1, 'active')`,
      [phone],
    );
    const provider = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: provider });
    const attempts = await Promise.allSettled(Array.from({ length: 6 },
      () => auth.requestRegistrationOtp({ badgeNumber: 'WRONG-BADGE', phone })));
    const allowed = attempts.filter(x => x.status === 'fulfilled');
    const rejected = attempts.filter(x => x.status === 'rejected') as PromiseRejectedResult[];
    assert.equal(allowed.length, 5, 'unmatched requests count toward the 5/15min quota');
    assert.equal(rejected.length, 1);
    assert.equal((rejected[0].reason as { code?: string }).code, 'OTP_RATE_LIMITED');
    assert.equal(provider.deliveries.length, 0, 'unmatched requests never send a code');
    const rows = await pool.query<{ cnt: string; unsafe: string }>(
      `SELECT count(*)::text AS cnt,
              count(*) FILTER (WHERE invalidated_at IS NULL)::text AS unsafe
         FROM auth_otp_codes WHERE phone = $1`, [phone]);
    assert.equal(rows.rows[0].cnt, '5');
    assert.equal(rows.rows[0].unsafe, '0', 'audit placeholders must never be usable codes');
    const block = await pool.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM auth_otp_rate_limits
       WHERE phone=$1 AND blocked_until > now()`, [phone]);
    assert.equal(block.rows[0].cnt, '1');
  });

  it('unknown recovery phone cannot bypass quota by requesting repeatedly', async () => {
    const phone = '07701110022';
    const provider = createTestOtpProvider();
    const auth = new AuthService({ db: pool, otpProvider: provider });
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(await auth.requestRecoveryOtp(phone), { accepted: true });
    }
    await assert.rejects(auth.requestRecoveryOtp(phone), (err: unknown) =>
      (err as { code?: string }).code === 'OTP_RATE_LIMITED');
    assert.equal(provider.deliveries.length, 0);
    const codes = await pool.query<{ cnt: string; active: string }>(
      `SELECT count(*)::text AS cnt,
              count(*) FILTER (WHERE consumed_at IS NULL AND invalidated_at IS NULL)::text AS active
       FROM auth_otp_codes WHERE phone=$1`, [phone]);
    assert.equal(codes.rows[0].cnt, '5');
    assert.equal(codes.rows[0].active, '0');
  });

  it('rejected admin issue also commits a quota event before OTP_INVALID; sixth becomes 429', async () => {
    // This is a service-layer test; the real HTTP router enforces manage_accounts.
    const actorPhone = '07701110024';
    const targetPhone = '07701110023';
    const badge = 'P11-C-ACTOR';
    await pool.query(
      `INSERT INTO employees (name, title, department, badge_number, phone, status)
       VALUES ('Synthetic Actor', 'Staff', 'Synthetic', $1, $2, 'active')`,
      [badge, actorPhone],
    );
    const provider = createTestOtpProvider();
    const enrollment = new AuthService({ db: pool, otpProvider: provider });
    await enrollment.requestRegistrationOtp({ badgeNumber: badge, phone: actorPhone });
    const code = provider.lastCodeFor(actorPhone, 'registration');
    assert.ok(code);
    const account = await enrollment.verifyRegistrationOtp({
      phone: actorPhone, code, secret: 'SyntheticActorSecret42',
    });
    const admin = new AuthService({ db: pool, otpProvider: createAdminOtpProvider() });
    const actor = { userId: account.id, employeeId: account.employeeId };
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        admin.issueAdminRegistrationOtp(actor, { badgeNumber: 'NO-SUCH-BADGE', phone: targetPhone }),
        (err: unknown) => (err as { code?: string }).code === 'OTP_INVALID',
      );
    }
    await assert.rejects(
      admin.issueAdminRegistrationOtp(actor, { badgeNumber: 'NO-SUCH-BADGE', phone: targetPhone }),
      (err: unknown) => (err as { code?: string }).code === 'OTP_RATE_LIMITED',
    );
    const rows = await pool.query<{ cnt: string; active: string }>(
      `SELECT count(*)::text AS cnt,
              count(*) FILTER (WHERE invalidated_at IS NULL)::text AS active
       FROM auth_otp_codes WHERE phone=$1`, [targetPhone]);
    assert.equal(rows.rows[0].cnt, '5');
    assert.equal(rows.rows[0].active, '0');
    const events = await pool.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM audit_logs
       WHERE event_kind='otp_event' AND new_values->>'outcome'='admin_invalid_target'`);
    assert.equal(events.rows[0].cnt, '5');
  });

});
