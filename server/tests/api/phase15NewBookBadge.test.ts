/**
 * Phase15-N: no generated notifications. A tiny per-account "جديد" marker
 * must never reveal books outside the caller's normal SQL read scope or
 * accidentally produce the explicit formal "اطلعت" ViewLog.
 * Isolated synthetic PostgreSQL + real Express only.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { getJson, postJson, useTestSession, type ApiErrorBody } from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase15-N: private new-book marker without notifications', () => {
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
    // The test also clears display-only opens; never use a real/staging DB.
    await pool.query('DELETE FROM transaction_opened');
    useTestSession(null);
  });

  const newIds = async (): Promise<string[]> => {
    const result = await getJson<string[]>(baseUrl, '/api/transactions/new-ids');
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.body));
    return result.body;
  };
  const opened = async (id: string): Promise<number> => {
    return (await postJson(baseUrl, `/api/transactions/${id}/opened`)).status;
  };

  it('one account opens a public book; another still sees NEW; no formal acknowledgement', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-ADM1', phone: '07709881001', secret: 'Phase15NAdminSecret', role: 'admin',
    });
    const first = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-EMP1', phone: '07709881002', secret: 'Phase15NEmployeeOne', role: 'employee',
    });
    const second = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-EMP2', phone: '07709881003', secret: 'Phase15NEmployeeTwo', role: 'employee',
    });

    useTestSession(admin.sessionToken);
    const book = await newTransaction(suite.context, {
      number: '15N-NEW-GENERAL', direction: 'وارد', visibility: 'PublicToEmployees',
    });
    useTestSession(first.sessionToken);
    assert.ok((await newIds()).includes(book.id), 'new visible book is marked for first user');
    assert.equal(await opened(book.id), 204);
    assert.ok(!(await newIds()).includes(book.id), 'opening removes only that user\'s mark');
    assert.equal(await opened(book.id), 204, 'repeating open is idempotent');

    const count = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM transaction_opened WHERE user_id=$1 AND transaction_id=$2',
      [first.account.id, book.id],
    );
    assert.equal(count.rows[0].count, '1', 'unique first-open row');
    const viewLog = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM view_logs WHERE transaction_id=$1', [book.id],
    );
    assert.equal(viewLog.rows[0].count, '0', 'opening is NOT explicit formal acknowledgement');
    useTestSession(second.sessionToken);
    assert.ok((await newIds()).includes(book.id), 'second user still sees NEW');
  });

  it('administrative grants and public daily situations never leak book IDs to employees', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-ADM2', phone: '07709881004', secret: 'Phase15NAdminTwo', role: 'admin',
    });
    const employee = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-EMP3', phone: '07709881005', secret: 'Phase15NEmployeeThree', role: 'employee',
    });
    useTestSession(admin.sessionToken);
    const adminBook = await newTransaction(suite.context, {
      number: '15N-HIDDEN-ADMIN', visibility: 'Administrative',
    });
    const daily = await newTransaction(suite.context, {
      number: '15N-DAILY-PUBLIC-BAD', visibility: 'PublicToEmployees',
      isDailySituation: true, direction: 'وارد',
    });
    const grant = await postJson(baseUrl, `/api/transactions/${adminBook.id}/availability`, {
      employeeIds: [employee.employee.id],
    });
    assert.equal(grant.status, 201, 'administrative availability can be recorded without a notification');
    useTestSession(employee.sessionToken);
    const ids = await newIds();
    assert.ok(!ids.includes(adminBook.id), 'Administrative remains hidden even after grant');
    assert.ok(!ids.includes(daily.id), 'daily situation is never marked visible for employee');
    for (const id of [adminBook.id, daily.id]) {
      assert.equal(await opened(id), 404, 'opening an invisible book is rejected');
    }
    const leak = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications
       WHERE user_id=$1 AND kind IN ('book_available', 'new_broadcast')`,
      [employee.account.id],
    );
    assert.equal(leak.rows[0].count, '0', 'no notification metadata is generated');
  });

  it('imported, older and archived books do not get a NEW marker; history is not erased', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-ADM3', phone: '07709881006', secret: 'Phase15NAdminThree', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const imported = await newTransaction(suite.context, {
      number: '15N-ARCHIVE-IMPORT', importedAt: '2026-01-01T00:00:00.000Z',
    });
    const old = await newTransaction(suite.context, { number: '15N-OLDER' });
    const archived = await newTransaction(suite.context, { number: '15N-ARCHIVED' });
    await pool.query("UPDATE transactions SET created_at=now()-INTERVAL '9 days' WHERE id=$1", [old.id]);
    await pool.query('UPDATE transactions SET deleted_at=now() WHERE id=$1', [archived.id]);
    const ids = await newIds();
    for (const book of [imported, old, archived]) {
      assert.ok(!ids.includes(book.id), 'not recent active live creation');
    }
    assert.equal(await opened(archived.id), 404);
  });

  it('new broadcast creation and direct grant never generate any notification or notification API', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-ADM4', phone: '07709881007', secret: 'Phase15NAdminFour', role: 'admin',
    });
    const employee = await newAuthenticatedAccount(suite.context, {
      badgeNumber: '15N-EMP4', phone: '07709881008', secret: 'Phase15NEmployeeFour', role: 'employee',
    });
    useTestSession(admin.sessionToken);
    const broadcast = await newTransaction(suite.context, {
      number: '15N-NOTIFY-OFF', direction: 'وارد', visibility: 'PublicToEmployees',
    });
    const privateBook = await newTransaction(suite.context, {
      number: '15N-GRANT-OFF', visibility: 'SpecificEmployees',
    });
    assert.ok(broadcast.id && privateBook.id);
    const grant = await postJson(baseUrl, `/api/transactions/${privateBook.id}/availability`, {
      employeeIds: [employee.employee.id],
    });
    assert.equal(grant.status, 201);
    const count = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM notifications WHERE user_id=$1',
      [employee.account.id],
    );
    assert.equal(count.rows[0].count, '0');
    const response = await fetch(`${baseUrl}/api/notifications`, {
      headers: { authorization: `Bearer ${employee.sessionToken}` },
    });
    assert.equal(response.status, 404, 'legacy notifications endpoint is disabled');
  });

  it('authentication remains required for both marker routes', async () => {
    useTestSession(null);
    const get = await getJson<ApiErrorBody>(baseUrl, '/api/transactions/new-ids');
    assert.equal(get.status, 401);
    const post = await postJson<ApiErrorBody>(
      baseUrl, '/api/transactions/00000000-0000-0000-0000-000000000000/opened',
    );
    assert.equal(post.status, 401);
  });
});
