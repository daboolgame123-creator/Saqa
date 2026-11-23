/**
 * Phase 15-G: targeted failure injection for multi-recipient notifications
 * and a director's request decision. Runs on a disposable synthetic PG cluster.
 * Production code and real/staging data are never modified.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { postJson, useTestSession } from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase15-G: atomic notifications for multiple recipients and director decisions', () => {
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

  it('second bulk-grant notification failure rolls back even the first notification, all grants and Audit', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-G-ADM', phone: '07707777001',
      secret: 'Synthetic15GBulkAdmin', role: 'admin',
    });
    const first = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-G-A', phone: '07707777002',
      secret: 'Synthetic15GBulkFirst', role: 'employee',
    });
    const second = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-G-B', phone: '07707777003',
      secret: 'Synthetic15GBulkSecond', role: 'employee',
    });
    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, {
      number: '15G-BULK',
      visibility: 'SpecificEmployees',
      employeeLinks: [
        { employeeId: first.employee.id, relationshipType: 'subject' },
        { employeeId: second.employee.id, relationshipType: 'recipient' },
      ],
    });

    // The first INSERT succeeds; the second fails. This verifies that no
    // partial notification/availability persists after PostgreSQL ROLLBACK.
    await pool.query(`
      CREATE FUNCTION phase15_test_fail_second_notification() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.kind = 'book_available' AND
           (SELECT count(*) FROM notifications WHERE kind='book_available') >= 1 THEN
          RAISE EXCEPTION 'phase15 synthetic second notification failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15_test_fail_second_notification
      BEFORE INSERT ON notifications FOR EACH ROW
      EXECUTE FUNCTION phase15_test_fail_second_notification()
    `);
    const bulkUrl = `/api/transactions/${book.id}/availability/bulk`;
    try {
      const rejected = await postJson(baseUrl, bulkUrl);
      assert.equal(rejected.status, 500,
        'second notification INSERT failure must reject entire bulk-grant');
      const grants = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM transaction_availability
         WHERE transaction_id=$1 AND revoked_at IS NULL`, [book.id],
      );
      assert.equal(grants.rows[0].count, '0', 'neither recipient gains access');
      const events = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='transaction_availability' AND entity_id=$1
           AND event_kind='create'`, [book.id],
      );
      assert.equal(events.rows[0].count, '0', 'no grant success was audited');
      const notifications = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM notifications
         WHERE kind='book_available' AND (user_id=$1 OR user_id=$2)`,
        [first.account.id, second.account.id],
      );
      assert.equal(notifications.rows[0].count, '0',
        'even first successful INSERT must roll back when the second fails');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS phase15_test_fail_second_notification ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_fail_second_notification()');
    }

    const accepted = await postJson<{ employeeId: string }[]>(baseUrl, bulkUrl);
    assert.equal(accepted.status, 201);
    assert.deepEqual(
      accepted.body.map(x => x.employeeId).sort(),
      [first.employee.id, second.employee.id].sort(),
      'both grants should be committed after notification database recovers',
    );
    const again = await postJson<{ employeeId: string }[]>(baseUrl, bulkUrl);
    assert.equal(again.status, 201);
    assert.equal(again.body.length, 0, 'idempotent bulk-grant does not repeat new grants');
    const receipts = await pool.query<{ user_id: string; count: string }>(
      `SELECT user_id, count(*)::text AS count FROM notifications
       WHERE kind='book_available' AND user_id IN ($1, $2)
       GROUP BY user_id ORDER BY user_id`, [first.account.id, second.account.id],
    );
    assert.equal(receipts.rows.length, 2);
    for (const receipt of receipts.rows) {
      assert.equal(receipt.count, '1', 'exactly one notification per new recipient');
    }
  });

  it('failed director-decision notification cannot commit approval, history or Audit', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-G-REQ', phone: '07707777004',
      secret: 'Synthetic15GRequestAdmin', role: 'admin',
    });
    const director = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A15-G-DIR', phone: '07707777005',
      secret: 'Synthetic15GDirector', role: 'director',
    });
    useTestSession(admin.sessionToken);
    const create = await postJson<{ id: string; status: string; version: number }>(
      baseUrl, '/api/requests', {
        employeeId: admin.employee.id,
        kind: 'general',
        payload: { kind: 'general', subject: 'Synthetic director notification rollback' },
      },
    );
    assert.equal(create.status, 201);
    const workflow = `/api/requests/${create.body.id}/workflow`;
    const submitted = await postJson<{ status: string; version: number }>(
      baseUrl, workflow, { action: 'submit', expectedVersion: create.body.version },
    );
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.status, 'submitted');
    assert.equal(submitted.body.version, 2);

    await pool.query(`
      CREATE FUNCTION phase15_test_reject_decision_notification() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.kind='request_update' THEN
          RAISE EXCEPTION 'phase15 synthetic director decision notification failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15_test_reject_decision_notification
      BEFORE INSERT ON notifications FOR EACH ROW
      EXECUTE FUNCTION phase15_test_reject_decision_notification()
    `);
    useTestSession(director.sessionToken);
    try {
      const denied = await postJson(baseUrl, workflow, {
        action: 'approve', expectedVersion: submitted.body.version,
      });
      assert.equal(denied.status, 500);
      const state = await pool.query<{ status: string; version: number }>(
        'SELECT status,version FROM requests WHERE id=$1', [create.body.id],
      );
      assert.deepEqual(state.rows, [{ status: 'submitted', version: 2 }],
        'approval must roll back before status or version changes');
      const history = await pool.query<{ action: string }>(
        'SELECT action FROM request_status_history WHERE request_id=$1 ORDER BY created_at, id',
        [create.body.id],
      );
      assert.deepEqual(history.rows.map(x => x.action), ['create', 'submit'],
        'rejected approval never appears in request history');
      const audit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='request' AND entity_id=$1 AND event_kind='status_change'
           AND new_values->>'action'='approve'`,
        [create.body.id],
      );
      assert.equal(audit.rows[0].count, '0',
        'no fake audit decision after failed notification');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS phase15_test_reject_decision_notification ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_reject_decision_notification()');
    }

    const approved = await postJson<{ status: string; version: number }>(
      baseUrl, workflow, { action: 'approve', expectedVersion: submitted.body.version },
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, 'approved');
    const notices = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
       WHERE user_id=$1 AND kind='request_update'`, [admin.account.id],
    );
    assert.equal(notices.rows[0].count, '1', 'one decision notification after successful retry');
  });
});
