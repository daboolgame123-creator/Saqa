/**
 * Phase15-N policy reversal: no notification event may be emitted, even by
 * domain writes which used to create in-DB notification rows.
 *
 * Synthetic trigger deliberately fails any notification insertion.
 * Legitimate domain + Audit writes must still commit in a real Express/PG run.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { postJson, useTestSession } from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase15-N: domain writes never emit internal notifications', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;

  before(async () => {
    suite = await startApiSuite();
    pool = suite.pool;
    baseUrl = suite.baseUrl;
  });
  after(async () => { await stopApiSuite(suite); });
  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
  });

  const blockAllNotifications = async () => {
    await pool.query(`
      CREATE FUNCTION phase15_test_no_notification_inserts() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        RAISE EXCEPTION 'notifications disabled by owner policy';
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15_test_no_notification_inserts
      BEFORE INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION phase15_test_no_notification_inserts()
    `);
  };
  const unblockAllNotifications = async () => {
    await pool.query('DROP TRIGGER IF EXISTS phase15_test_no_notification_inserts ON notifications');
    await pool.query('DROP FUNCTION IF EXISTS phase15_test_no_notification_inserts()');
  };

  const notificationCount = async (): Promise<number> => {
    const result = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM notifications',
    );
    return Number(result.rows[0].count);
  };

  it('book creation and availability grants succeed even when notification INSERT is forbidden', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-AT-ADM', phone: '07709992001', secret: 'Phase15NAtomicAdmin',
      role: 'admin',
    });
    const employee = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-AT-EMP', phone: '07709992002', secret: 'Phase15NAtomicEmployee',
      role: 'employee',
    });
    useTestSession(admin.sessionToken);
    await blockAllNotifications();
    try {
      const publicBook = await postJson<{ id: string }>(baseUrl, '/api/transactions', {
        number: '15N-AT-PUBLIC', sequence: '15N-AT-1', date: '2026-11-23',
        direction: 'وارد', category: 'إدارية', subType: 'تعميم',
        entity: 'Synthetic', subject: 'Notification-free book',
        status: 'قيد المراجعة', visibility: 'PublicToEmployees',
      });
      assert.equal(publicBook.status, 201);
      assert.equal(await notificationCount(), 0);
      const privateBook = await newTransaction(suite.context, {
        number: '15N-AT-PRIVATE', visibility: 'SpecificEmployees',
      });
      const grant = await postJson(baseUrl, `/api/transactions/${privateBook.id}/availability`, {
        employeeIds: [employee.employee.id],
      });
      assert.equal(grant.status, 201);
      assert.equal(await notificationCount(), 0);
      const audit = await pool.query<{ kind: string; count: string }>(
        `SELECT entity_kind AS kind, count(*)::text AS count FROM audit_logs
         WHERE (entity_kind='transaction' AND entity_id=$1)
            OR (entity_kind='transaction_availability' AND entity_id=$2)
         GROUP BY entity_kind ORDER BY entity_kind`,
        [publicBook.body.id, privateBook.id],
      );
      assert.ok(audit.rows.some(x => x.kind === 'transaction'));
      assert.ok(audit.rows.some(x => x.kind === 'transaction_availability'));
    } finally {
      await unblockAllNotifications();
    }
  });

  it('request workflow and Audit no longer depend on a notification recipient or INSERT', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-AT-REQ', phone: '07709992003', secret: 'Phase15NAtomicRequest',
      role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const created = await postJson<{ id: string; version: number; status: string }>(
      baseUrl, '/api/requests', {
        employeeId: admin.employee.id,
        kind: 'general',
        payload: { kind: 'general', subject: 'Synthetic request with no alerts' },
      },
    );
    assert.equal(created.status, 201);
    await blockAllNotifications();
    try {
      const submit = await postJson<{ status: string }>(
        baseUrl, `/api/requests/${created.body.id}/workflow`,
        { action: 'submit', expectedVersion: created.body.version },
      );
      assert.equal(submit.status, 200);
      assert.equal(submit.body.status, 'submitted');
      assert.equal(await notificationCount(), 0);
      const audit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='request' AND entity_id=$1 AND event_kind='status_change'`,
        [created.body.id],
      );
      assert.equal(audit.rows[0].count, '1');
    } finally {
      await unblockAllNotifications();
    }
  });
});
