/**
 * P15-02 scoped SECURITY ACCEPTANCE for transaction create.
 *
 * A synthetic trigger makes audit_logs INSERT fail only for a transaction
 * creation event. When audit INSERT fails, HTTP 500 must accompany a complete rollback
 * of the corresponding domain mutation.
 * The older diagnostic in Phase15-B PR #82 documented the original failure.
 * Never use real/staging PostgreSQL for these synthetic failure injections.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, postJson, useTestSession } from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('P15-02 security acceptance: transaction create is atomic with audit insert', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;

  before(async () => {
    suite = await startApiSuite();
    pool = suite.pool;
    baseUrl = suite.baseUrl;
  });
  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
  });
  after(async () => { await stopApiSuite(suite); });

  it('audit insert failure causes 500 and ROLLBACK of transaction and links', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-02', phone: '07705555002',
      secret: 'SyntheticAudit15Secret', role: 'admin',
    });
    useTestSession(admin.sessionToken);

    await pool.query(`
      CREATE FUNCTION phase15_test_fail_transaction_audit() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.entity_kind = 'transaction' AND NEW.event_kind = 'create' THEN
          RAISE EXCEPTION 'phase15 synthetic audit write failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15_test_reject_create_audit
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION phase15_test_fail_transaction_audit()
    `);

    try {
      const response = await postJson(baseUrl, '/api/transactions', {
        number: '15-AUDIT-FAIL',
        sequence: '15-902',
        date: '2026-09-10',
        direction: 'صادر',
        category: 'إدارية',
        subType: 'تعميم',
        entity: 'اختبار اصطناعي',
        subject: 'P15-02 audit gap synthetic book',
        status: 'قيد المراجعة',
      });
      assert.equal(response.status, 500, 'audit failure is surfaced, not silently ignored');

      const rows = await pool.query<{ id: string }>(
        'SELECT id FROM transactions WHERE subject = $1',
        ['P15-02 audit gap synthetic book'],
      );
      assert.equal(rows.rows.length, 0,
        'no business row may remain after audit insertion fails');

      const audit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind = 'transaction' AND event_kind = 'create'`,
      );
      assert.equal(Number(audit.rows[0].count), 0,
        'no success audit event may be fabricated on rollback');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS phase15_test_reject_create_audit ON audit_logs');
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_fail_transaction_audit()');
    }
  });
  it('grant and revoke of book availability roll back when audit insert fails', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-AV', phone: '07705555003',
      secret: 'SyntheticAudit15AvSecret', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, {
      number: '15-AV-BOOK', visibility: 'SpecificEmployees',
    });

    await pool.query(`
      CREATE FUNCTION phase15_test_fail_availability_audit() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.entity_kind = 'transaction_availability' THEN
          RAISE EXCEPTION 'phase15 synthetic availability audit failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    const enableFailingTrigger = () => pool.query(`
      CREATE TRIGGER phase15_test_reject_availability_audit
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION phase15_test_fail_availability_audit()
    `);
    const removeTrigger = () => pool.query(
      'DROP TRIGGER IF EXISTS phase15_test_reject_availability_audit ON audit_logs',
    );
    const grantPath = `/api/transactions/${book.id}/availability`;
    const revokePath = grantPath + '/' + admin.employee.id;

    try {
      await enableFailingTrigger();
      const deniedGrant = await postJson(baseUrl, grantPath, {
        employeeIds: [admin.employee.id],
      });
      assert.equal(deniedGrant.status, 500, 'audit failure must reject grant request');
      let rows = await pool.query<{ revoked_at: string | null }>(
        'SELECT revoked_at FROM transaction_availability WHERE transaction_id = $1',
        [book.id],
      );
      assert.equal(rows.rows.length, 0, 'no grant may survive without an audit entry');

      await removeTrigger();
      const allowedGrant = await postJson(baseUrl, grantPath, {
        employeeIds: [admin.employee.id],
      });
      assert.equal(allowedGrant.status, 201, 'same grant succeeds when audit works');
      rows = await pool.query<{ revoked_at: string | null }>(
        'SELECT revoked_at FROM transaction_availability WHERE transaction_id = $1',
        [book.id],
      );
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].revoked_at, null, 'grant is active');

      await enableFailingTrigger();
      const deniedRevoke = await deleteJson(baseUrl, revokePath);
      assert.equal(deniedRevoke.status, 500, 'audit failure must reject revoke request');
      rows = await pool.query<{ revoked_at: string | null }>(
        'SELECT revoked_at FROM transaction_availability WHERE transaction_id = $1',
        [book.id],
      );
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].revoked_at, null,
        'grant remains active when revoke audit rolls back');

      const audit = await pool.query<{ event_kind: string }>(
        `SELECT event_kind FROM audit_logs WHERE entity_kind='transaction_availability'
         AND entity_id=$1 ORDER BY occurred_at`,
        [book.id],
      );
      assert.deepEqual(audit.rows.map(x => x.event_kind), ['create'],
        'only the successfully committed grant has a corresponding event');
    } finally {
      await removeTrigger();
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_fail_availability_audit()');
    }
  });

});
