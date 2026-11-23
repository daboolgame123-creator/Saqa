/**
 * Phase15-G revised for the owner's Phase15-N no-notification policy.
 * Bulk grants and director decisions still commit with Audit, but may NEVER
 * create notification rows. All tests use disposable synthetic PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { postJson, useTestSession } from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase15-N: bulk grant and director decision without notifications', () => {
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

  const count = async (sql: string, params: unknown[] = []): Promise<number> => {
    const result = await pool.query<{ count: string }>(sql, params);
    return Number(result.rows[0].count);
  };
  const blockAllNotifications = async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION phase15g_forbid_notifications() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        RAISE EXCEPTION 'notification insert attempted after owner disabled all alerts';
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15g_forbid_notifications
      BEFORE INSERT ON notifications FOR EACH ROW
      EXECUTE FUNCTION phase15g_forbid_notifications()
    `);
  };
  const unblock = async () => {
    await pool.query('DROP TRIGGER IF EXISTS phase15g_forbid_notifications ON notifications');
    await pool.query('DROP FUNCTION IF EXISTS phase15g_forbid_notifications()');
  };

  it('bulk linked grants preserve both access rows and Audit with zero recipient notifications', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-G-ADM', phone: '07707777001',
      secret: 'Synthetic15NGAdmin', role: 'admin',
    });
    const first = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-G-A', phone: '07707777002',
      secret: 'Synthetic15NGFirst', role: 'employee',
    });
    const second = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-G-B', phone: '07707777003',
      secret: 'Synthetic15NGSecond', role: 'employee',
    });
    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, {
      number: '15N-G-BULK', visibility: 'SpecificEmployees',
      employeeLinks: [
        { employeeId: first.employee.id, relationshipType: 'subject' },
        { employeeId: second.employee.id, relationshipType: 'recipient' },
      ],
    });
    await blockAllNotifications();
    try {
      const path = `/api/transactions/${book.id}/availability/bulk`;
      const granted = await postJson<{ employeeId: string }[]>(baseUrl, path);
      assert.equal(granted.status, 201);
      assert.deepEqual(
        granted.body.map(x => x.employeeId).sort(),
        [first.employee.id, second.employee.id].sort(),
      );
      const repeated = await postJson<{ employeeId: string }[]>(baseUrl, path);
      assert.equal(repeated.status, 201);
      assert.deepEqual(repeated.body, []);
      assert.equal(await count(
        'SELECT count(*)::text AS count FROM transaction_availability WHERE transaction_id=$1 AND revoked_at IS NULL',
        [book.id],
      ), 2);
      assert.equal(await count(
        `SELECT count(*)::text AS count FROM audit_logs WHERE entity_kind='transaction_availability'
          AND entity_id=$1 AND event_kind='create'`, [book.id],
      ), 1, 'one Audit event for the real two-recipient grant, none for duplicate');
      assert.equal(await count(
        'SELECT count(*)::text AS count FROM notifications WHERE user_id IN ($1,$2)',
        [first.account.id, second.account.id],
      ), 0);
    } finally {
      await unblock();
    }
  });

  it('director approval commits workflow history and Audit without notifying requester', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-G-REQ', phone: '07707777004',
      secret: 'Synthetic15NGRequest', role: 'admin',
    });
    const director = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-G-DIR', phone: '07707777005',
      secret: 'Synthetic15NGDirector', role: 'director',
    });
    useTestSession(admin.sessionToken);
    const created = await postJson<{ id: string; status: string; version: number }>(
      baseUrl, '/api/requests', {
        employeeId: admin.employee.id, kind: 'general',
        payload: { kind: 'general', subject: 'Synthetic no-notification director approval' },
      },
    );
    assert.equal(created.status, 201);
    const path = `/api/requests/${created.body.id}/workflow`;
    const submitted = await postJson<{ status: string; version: number }>(
      baseUrl, path, { action: 'submit', expectedVersion: created.body.version },
    );
    assert.equal(submitted.status, 200);

    await blockAllNotifications();
    try {
      useTestSession(director.sessionToken);
      const approved = await postJson<{ status: string; version: number }>(
        baseUrl, path, { action: 'approve', expectedVersion: submitted.body.version },
      );
      assert.equal(approved.status, 200);
      assert.equal(approved.body.status, 'approved');
      assert.equal(await count(
        `SELECT count(*)::text AS count FROM request_status_history
         WHERE request_id=$1 AND action='approve'`, [created.body.id],
      ), 1);
      assert.equal(await count(
        `SELECT count(*)::text AS count FROM audit_logs
          WHERE entity_kind='request' AND entity_id=$1 AND event_kind='status_change'
          AND new_values->>'action'='approve'`, [created.body.id],
      ), 1);
      assert.equal(await count(
        'SELECT count(*)::text AS count FROM notifications WHERE user_id=$1',
        [admin.account.id],
      ), 0);
    } finally {
      await unblock();
    }
  });
});
