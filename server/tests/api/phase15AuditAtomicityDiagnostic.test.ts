/**
 * P15-02 DIAGNOSTIC — NOT SECURITY ACCEPTANCE.
 *
 * A synthetic trigger makes audit_logs INSERT fail only for a transaction
 * creation event. A 500 response while the transaction row persists
 * demonstrates that the domain mutation and its audit entry are not atomic.
 * This test intentionally asserts the existing defect, NOT a repaired state.
 * Never use real/staging PostgreSQL for this diagnostic.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { postJson, useTestSession } from './apiTestHelpers';
import { newAuthenticatedAccount } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('P15-02 DIAGNOSTIC: domain write survives an audit-log insertion failure', () => {
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

  it('500 response is misleading when transaction row committed but create audit did not', async () => {
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
      assert.equal(response.status, 500, 'audit failure propagates after business write');

      const rows = await pool.query<{ id: string }>(
        'SELECT id FROM transactions WHERE subject = $1',
        ['P15-02 audit gap synthetic book'],
      );
      assert.equal(rows.rows.length, 1,
        'DIAGNOSTIC: business row remains committed despite HTTP 500');

      const audit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind = 'transaction' AND event_kind = 'create'
           AND entity_id = $1`,
        [rows.rows[0].id],
      );
      assert.equal(Number(audit.rows[0].count), 0,
        'DIAGNOSTIC: no matching audit row was committed');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS phase15_test_reject_create_audit ON audit_logs');
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_fail_transaction_audit()');
    }
  });
});
