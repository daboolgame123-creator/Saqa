/**
 * Phase15-F: internal notification writes must be in the same PostgreSQL
 * transaction as domain mutation and audit. Synthetic database + HTTP only.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { postJson, useTestSession } from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase15-F: internal notification failure rolls back domain and Audit', () => {
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

  const blockNotifications = async (kind: string): Promise<void> => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION phase15_test_reject_notifications() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.kind = '${kind}' THEN
          RAISE EXCEPTION 'phase15 synthetic notification insert failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15_reject_notifications
      BEFORE INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION phase15_test_reject_notifications()
    `);
  };
  const unblockNotifications = async (): Promise<void> => {
    await pool.query('DROP TRIGGER IF EXISTS phase15_reject_notifications ON notifications');
    await pool.query('DROP FUNCTION IF EXISTS phase15_test_reject_notifications()');
  };

  it('failed book_available notification cannot commit a new employee grant or Audit', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-F-ADM', phone: '07706666001',
      secret: 'SyntheticNotify15Admin', role: 'admin',
    });
    const employee = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-F-EMP', phone: '07706666002',
      secret: 'SyntheticNotify15Employee', role: 'employee',
    });
    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, {
      number: '15F-NOTIFICATION-GRANT',
      visibility: 'SpecificEmployees',
    });
    const grantPath = `/api/transactions/${book.id}/availability`;
    await blockNotifications('book_available');
    try {
      const failed = await postJson(baseUrl, grantPath, {
        employeeIds: [employee.employee.id],
      });
      assert.equal(failed.status, 500, 'notification insertion fails by synthetic trigger');
      const grants = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM transaction_availability
         WHERE transaction_id=$1 AND employee_id=$2 AND revoked_at IS NULL`,
        [book.id, employee.employee.id],
      );
      assert.equal(grants.rows[0].count, '0',
        'failed notification cannot leave an unacknowledged committed grant');
      const audit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='transaction_availability' AND entity_id=$1 AND event_kind='create'`,
        [book.id],
      );
      assert.equal(audit.rows[0].count, '0',
        'rollback must include grant audit as well');
    } finally {
      await unblockNotifications();
    }
    const ok = await postJson(baseUrl, grantPath, { employeeIds: [employee.employee.id] });
    assert.equal(ok.status, 201, 'retry after DB notification recovers is safe');
    const notifications = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
       WHERE user_id=$1 AND kind='book_available'`,
      [employee.account.id],
    );
    assert.equal(notifications.rows[0].count, '1',
      'one successful grant creates exactly one notification');
  });

  it('failed new_request notification rolls back workflow state, history and Audit', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-F-REQ', phone: '07706666003',
      secret: 'SyntheticNotify15Request', role: 'admin',
    });
    const director = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-F-DIR', phone: '07706666004',
      secret: 'SyntheticNotify15Director', role: 'director',
    });
    useTestSession(admin.sessionToken);
    const created = await postJson<{ id: string; version: number; status: string }>(
      baseUrl, '/api/requests', {
        employeeId: admin.employee.id,
        kind: 'general',
        payload: { kind: 'general', subject: 'Synthetic after-commit notification test' },
      },
    );
    assert.equal(created.status, 201);
    const path = `/api/requests/${created.body.id}/workflow`;
    await blockNotifications('new_request');
    try {
      const failed = await postJson(baseUrl, path, {
        action: 'submit', expectedVersion: created.body.version,
      });
      assert.equal(failed.status, 500);
      const state = await pool.query<{ status: string; version: number }>(
        'SELECT status, version FROM requests WHERE id=$1', [created.body.id],
      );
      assert.deepEqual(state.rows, [{ status: 'draft', version: 1 }],
        'failed notification cannot commit workflow state');
      const history = await pool.query<{ action: string }>(
        'SELECT action FROM request_status_history WHERE request_id=$1',
        [created.body.id],
      );
      assert.deepEqual(history.rows.map(x => x.action), ['create'],
        'workflow history must roll back');
      const audits = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='request' AND entity_id=$1 AND event_kind='status_change'`,
        [created.body.id],
      );
      assert.equal(audits.rows[0].count, '0',
        'no status-change audit for aborted notification workflow');
    } finally {
      await unblockNotifications();
    }
    const success = await postJson(baseUrl, path, {
      action: 'submit', expectedVersion: created.body.version,
    });
    assert.equal(success.status, 200);
    const notifications = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
       WHERE user_id=$1 AND kind='new_request'`,
      [director.account.id],
    );
    assert.equal(notifications.rows[0].count, '1');
  });
  it('failed new_broadcast insert rolls back public incoming book creation and Audit', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-F-CIRC', phone: '07706666005',
      secret: 'SyntheticNotify15Circular', role: 'admin',
    });
    const subscriber = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-F-SUB', phone: '07706666006',
      secret: 'SyntheticNotify15Subscriber', role: 'employee',
    });
    useTestSession(admin.sessionToken);
    const payload = {
      number: '15F-NEW-BROADCAST',
      sequence: '15F-0007',
      date: '2026-09-10',
      direction: 'وارد',
      visibility: 'PublicToEmployees',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'اختبار اصطناعي',
      subject: 'Synthetic broadcast failure should roll back',
      status: 'قيد المراجعة',
    };
    await blockNotifications('new_broadcast');
    try {
      const failed = await postJson(baseUrl, '/api/transactions', payload);
      assert.equal(failed.status, 500);
      const books = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM transactions WHERE subject=$1',
        [payload.subject],
      );
      assert.equal(books.rows[0].count, '0',
        'failed broadcast notification must not commit a new public book');
      const audits = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='transaction' AND event_kind='create'`,
      );
      assert.equal(audits.rows[0].count, '0', 'no success audit on rollback');
    } finally {
      await unblockNotifications();
    }
    const success = await postJson(baseUrl, '/api/transactions', payload);
    assert.equal(success.status, 201);
    const notifications = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
       WHERE kind='new_broadcast' AND user_id=$1`,
      [subscriber.account.id],
    );
    assert.equal(notifications.rows[0].count, '1');
  });

});
