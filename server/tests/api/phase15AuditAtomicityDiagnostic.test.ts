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
import { newAuthenticatedAccount, newEmployee, newTransaction } from './apiTestData';
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

  it('duplicate grants and empty bulk grants do not fabricate Audit creates or notifications', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-NOOP', phone: '07705555006',
      secret: 'SyntheticAudit15NoopSecret', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, {
      number: '15-AV-NOOP-BOOK', visibility: 'SpecificEmployees',
    });
    const grantPath = `/api/transactions/${book.id}/availability`;
    const auditCount = async (): Promise<number> => {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind = 'transaction_availability'
           AND event_kind = 'create' AND entity_id = $1`,
        [book.id],
      );
      return Number(result.rows[0].count);
    };
    const notificationCount = async (): Promise<number> => {
      const result = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM notifications WHERE kind='book_available'",
      );
      return Number(result.rows[0].count);
    };

    assert.equal(await auditCount(), 0);
    const first = await postJson<unknown[]>(baseUrl, grantPath, {
      employeeIds: [admin.employee.id],
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.length, 1);
    assert.equal(await auditCount(), 1, 'one real availability grant is audited');
    const notificationsAfterFirst = await notificationCount();

    const duplicate = await postJson<unknown[]>(baseUrl, grantPath, {
      employeeIds: [admin.employee.id],
    });
    assert.equal(duplicate.status, 201);
    assert.deepEqual(duplicate.body, [], 'already-active grant inserts no new availability');
    assert.equal(await auditCount(), 1, 'duplicate grant cannot fabricate a create audit');
    assert.equal(await notificationCount(), notificationsAfterFirst,
      'duplicate grant cannot emit a new notification');

    const emptyBulk = await postJson<unknown[]>(baseUrl, grantPath + '/bulk');
    assert.equal(emptyBulk.status, 201);
    assert.deepEqual(emptyBulk.body, [], 'book with no linked employees grants nobody');
    assert.equal(await auditCount(), 1, 'empty bulk request cannot fabricate a create audit');
    assert.equal(await notificationCount(), notificationsAfterFirst,
      'empty bulk request cannot emit a new notification');

    const active = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transaction_availability
       WHERE transaction_id = $1 AND revoked_at IS NULL`,
      [book.id],
    );
    assert.equal(active.rows[0].count, '1', 'real access grant remains intact');
  });

  it('relation deletion rejects a mismatched source and never audits the wrong book', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-REL', phone: '07705555007',
      secret: 'SyntheticAudit15RelationSecret', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const sourceA = await newTransaction(suite.context, { number: '15-REL-SOURCE-A' });
    const sourceB = await newTransaction(suite.context, { number: '15-REL-SOURCE-B' });
    const targetC = await newTransaction(suite.context, { number: '15-REL-TARGET-C' });
    const created = await pool.query<{ id: string }>(
      `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
       VALUES ($1, $2) RETURNING id`,
      [sourceB.id, targetC.id],
    );
    const relationId = created.rows[0].id;
    const wrongPath = `/api/transactions/${sourceA.id}/relations/${relationId}`;
    const correctPath = `/api/transactions/${sourceB.id}/relations/${relationId}`;

    const wrongDelete = await deleteJson(baseUrl, wrongPath);
    assert.equal(wrongDelete.status, 404, 'A URL cannot delete a relation belonging to B');
    const stillExists = await pool.query<{ id: string }>(
      'SELECT id FROM transaction_relations WHERE id = $1',
      [relationId],
    );
    assert.equal(stillExists.rows.length, 1, 'mismatched delete must not mutate another book');

    const auditRows = async () => pool.query<{ entity_id: string; old_values: { relationId?: string } }>(
      `SELECT entity_id, old_values
         FROM audit_logs
        WHERE entity_kind = 'transaction' AND event_kind = 'update'
          AND old_values ->> 'relationId' = $1`,
      [relationId],
    );
    assert.equal((await auditRows()).rows.length, 0,
      'no false success Audit event is written for a rejected relation removal');

    const correctDelete = await deleteJson(baseUrl, correctPath);
    assert.equal(correctDelete.status, 204, 'valid source relation can be deleted');
    const removed = await pool.query<{ id: string }>(
      'SELECT id FROM transaction_relations WHERE id = $1',
      [relationId],
    );
    assert.equal(removed.rows.length, 0);
    const audited = (await auditRows()).rows;
    assert.equal(audited.length, 1, 'exactly one successful removal is audited');
    assert.equal(audited[0].entity_id, sourceB.id, 'Audit is attached to the actual source B');
    assert.equal(audited[0].old_values.relationId, relationId);
  });

  it('employee status Audit uses the state committed before a waiting HTTP update', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-EMP-RACE', phone: '07705555008',
      secret: 'SyntheticAudit15EmployeeRaceSecret', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const employee = await newEmployee(suite.context, { name: 'منتسب تزامن التدقيق' });
    const path = `/api/employees/${employee.id}/status`;
    const competing = await pool.connect();
    let inTransaction = false;
    let attempted: ReturnType<typeof postJson<{ status: string }>> | undefined;
    try {
      // Synthetic competing transaction: uncommitted state change holds the row
      // lock. The HTTP request sees the old snapshot until it attempts UPDATE
      // or SELECT FOR UPDATE; its successful Audit must describe the newer
      // predecessor after this competing transaction commits.
      await competing.query('BEGIN');
      inTransaction = true;
      await competing.query(
        `UPDATE employees SET status = 'former' WHERE id = $1`,
        [employee.id],
      );
      attempted = postJson<{ status: string }>(baseUrl, path, { status: 'active' });

      let blocked = false;
      for (let i = 0; i < 80; i += 1) {
        const lockWait = await pool.query<{ waiting: string }>(
          `SELECT count(*)::text AS waiting FROM pg_stat_activity
           WHERE datname = current_database()
             AND wait_event_type = 'Lock'
             AND query ILIKE '%employees%'`,
        );
        if (Number(lockWait.rows[0].waiting) > 0) { blocked = true; break; }
        await new Promise<void>(resolve => setTimeout(resolve, 50));
      }
      assert.ok(blocked, 'HTTP status mutation must wait on the competing row lock');
      await competing.query('COMMIT');
      inTransaction = false;
    } finally {
      if (inTransaction) await competing.query('ROLLBACK');
      competing.release();
    }

    assert.ok(attempted !== undefined);
    const response = await attempted;
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'active');
    const audit = await pool.query<{
      previous_status: string; next_status: string;
    }>(
      `SELECT old_values->>'status' AS previous_status,
              new_values->>'status' AS next_status
         FROM audit_logs
        WHERE entity_kind='employee' AND entity_id=$1
          AND event_kind='status_change'`,
      [employee.id],
    );
    assert.deepEqual(audit.rows, [
      { previous_status: 'former', next_status: 'active' },
    ], 'Audit must use the committed predecessor, not an unlocked stale pre-read');
  });

  it('archive and restore both roll back when their audit event cannot be written', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-AR', phone: '07705555004',
      secret: 'SyntheticAudit15ArchiveSecret', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, { number: '15-AR-BOOK' });
    const original = await pool.query<{ version: number; deletedAt: string | null }>(
      'SELECT version, deleted_at AS "deletedAt" FROM transactions WHERE id=$1',
      [book.id],
    );
    assert.equal(original.rows[0].deletedAt, null);

    await pool.query(`
      CREATE FUNCTION phase15_test_reject_archive_restore_audit() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.entity_kind='transaction' AND
          (NEW.event_kind='archive' OR
            (NEW.event_kind='update' AND NEW.new_values->>'action'='restore')) THEN
          RAISE EXCEPTION 'phase15 synthetic archive or restore audit failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    const enableTrigger = () => pool.query(`
      CREATE TRIGGER phase15_reject_archive_restore_audit
      BEFORE INSERT ON audit_logs FOR EACH ROW
      EXECUTE FUNCTION phase15_test_reject_archive_restore_audit()
    `);
    const disableTrigger = () => pool.query(
      'DROP TRIGGER IF EXISTS phase15_reject_archive_restore_audit ON audit_logs',
    );
    const current = async () => {
      const result = await pool.query<{ version: number; deletedAt: string | null }>(
        'SELECT version, deleted_at AS "deletedAt" FROM transactions WHERE id=$1',
        [book.id],
      );
      return result.rows[0];
    };
    try {
      await enableTrigger();
      const rejectedArchive = await deleteJson(
        baseUrl, `/api/transactions/${book.id}?expectedVersion=${original.rows[0].version}`,
      );
      assert.equal(rejectedArchive.status, 500);
      assert.deepEqual(await current(), original.rows[0],
        'failed archive audit cannot archive book or bump version');
      const archiveAudit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='transaction' AND entity_id=$1 AND event_kind='archive'`,
        [book.id],
      );
      assert.equal(archiveAudit.rows[0].count, '0');

      await disableTrigger();
      const acceptedArchive = await deleteJson(
        baseUrl, `/api/transactions/${book.id}?expectedVersion=${original.rows[0].version}`,
      );
      assert.equal(acceptedArchive.status, 200);
      const archived = await current();
      assert.ok(archived.deletedAt, 'normal archive succeeded and is audit-backed');
      assert.equal(archived.version, original.rows[0].version + 1);

      await enableTrigger();
      const rejectedRestore = await postJson(
        baseUrl, `/api/transactions/${book.id}/restore?expectedVersion=${archived.version}`,
      );
      assert.equal(rejectedRestore.status, 500);
      assert.deepEqual(await current(), archived,
        'failed restore audit cannot unarchive the book or bump version');
      const restoreAudit = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='transaction' AND entity_id=$1
           AND event_kind='update' AND new_values->>'action'='restore'`,
        [book.id],
      );
      assert.equal(restoreAudit.rows[0].count, '0');
    } finally {
      await disableTrigger();
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_reject_archive_restore_audit()');
    }
  });

  it('request workflow and history are not committed when status-change Audit fails', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'AUDIT-15-REQ', phone: '07705555005',
      secret: 'SyntheticAudit15RequestSecret', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const employee = await newEmployee(suite.context);
    const created = await postJson<{ id: string; status: string; version: number }>(
      baseUrl, '/api/requests', {
        employeeId: employee.id,
        kind: 'general',
        payload: { kind: 'general', subject: 'Synthetic audit atomicity request' },
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'draft');

    await pool.query(`
      CREATE FUNCTION phase15_test_reject_request_audit() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.entity_kind='request' AND NEW.event_kind='status_change' THEN
          RAISE EXCEPTION 'phase15 synthetic request audit failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    await pool.query(`
      CREATE TRIGGER phase15_reject_request_audit
      BEFORE INSERT ON audit_logs FOR EACH ROW
      EXECUTE FUNCTION phase15_test_reject_request_audit()
    `);
    try {
      const failed = await postJson(baseUrl, `/api/requests/${created.body.id}/workflow`, {
        action: 'submit', expectedVersion: created.body.version,
      });
      assert.equal(failed.status, 500);
      const state = await pool.query<{ status: string; version: number }>(
        'SELECT status,version FROM requests WHERE id=$1', [created.body.id],
      );
      assert.deepEqual(state.rows, [{ status: 'draft', version: 1 }],
        'no request status/version mutation after Audit failure');
      const histories = await pool.query<{ action: string }>(
        'SELECT action FROM request_status_history WHERE request_id=$1',
        [created.body.id],
      );
      assert.deepEqual(histories.rows.map(x => x.action), ['create'],
        'failed workflow must also roll back status-history row');
      const events = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_logs
         WHERE entity_kind='request' AND entity_id=$1 AND event_kind='status_change'`,
        [created.body.id],
      );
      assert.equal(events.rows[0].count, '0');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS phase15_reject_request_audit ON audit_logs');
      await pool.query('DROP FUNCTION IF EXISTS phase15_test_reject_request_audit()');
    }
  });

});
