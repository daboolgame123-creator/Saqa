/**
 * Phase12-B: a stored-role change must be enforced at the next HTTP request
 * even when the same Bearer session remains valid.
 * Only synthetic PostgreSQL data from startApiSuite() is modified.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  getJson,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
} from './apiTestHelpers';
import { newAuthenticatedAccount, setAccountRole } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase 12-B: current database role controls an existing Bearer session', () => {
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

  it('admin → employee → director → archivist → admin denies and restores rights without re-login', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'RBAC-B-01', phone: '07703334001',
      secret: 'Synthetic-Access-Key-01', role: 'admin',
    });
    const token = admin.sessionToken;
    const adminId = admin.account.id;
    const loginTarget = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'RBAC-B-02', phone: '07703334002',
      secret: 'Synthetic-Access-Key-02', role: 'employee',
    });

    const readAs = (path: string) =>
      requestWithToken<ApiErrorBody>(baseUrl, path, { method: 'GET', token });
    const insertEmployee = (name: string) => requestWithToken<ApiErrorBody>(
      baseUrl, '/api/employees', {
        method: 'POST', token,
        body: { name, title: 'Synthetic', department: 'Synthetic Department' },
      },
    );
    const deny = (status: number, code: string | undefined, label: string): void => {
      assert.equal(status, 403, label + ' must be forbidden');
      assert.equal(code, 'PERMISSION_DENIED', label + ' must use the RBAC error');
    };

    // The same Bearer initially has administrator access.
    assert.equal((await readAs('/api/audit-logs')).status, 200);
    assert.equal((await readAs('/api/reminders')).status, 200);
    assert.equal((await insertEmployee('Before downgrade')).status, 201);

    await setAccountRole(suite.context, adminId, 'employee');
    const employeeMe = await readAs('/api/auth/me');
    assert.equal(employeeMe.status, 200, 'downgrade must not require a new login');
    assert.equal((employeeMe.body as unknown as { role: string }).role, 'employee');

    for (const sensitive of ['/api/audit-logs', '/api/reminders', '/api/transactions/archived']) {
      const response = await readAs(sensitive);
      deny(response.status, response.body.error?.code, sensitive);
    }
    const forbiddenWrite = await insertEmployee('After downgrade prohibited');
    deny(forbiddenWrite.status, forbiddenWrite.body.error?.code, 'employee create');
    const forbiddenReset = await requestWithToken<ApiErrorBody>(
      baseUrl, `/api/auth/accounts/${loginTarget.account.id}/reset`,
      { method: 'POST', token },
    );
    deny(forbiddenReset.status, forbiddenReset.body.error?.code, 'employee reset');
    assert.equal((await readAs('/api/employees')).status, 200, 'ordinary read remains allowed');

    // Director gains only read and approve_request, never administrator writes.
    await setAccountRole(suite.context, adminId, 'director');
    const directorMe = await readAs('/api/auth/me');
    assert.equal((directorMe.body as unknown as { role: string }).role, 'director');
    assert.equal((await readAs('/api/employees')).status, 200);
    const directorWrite = await insertEmployee('Director prohibited');
    deny(directorWrite.status, directorWrite.body.error?.code, 'director create');

    // Historical roles are always fail-closed, even with a formerly admin token.
    await setAccountRole(suite.context, adminId, 'archivist');
    const archivistRead = await readAs('/api/employees');
    deny(archivistRead.status, archivistRead.body.error?.code, 'archivist read');

    // A legitimate role elevation is visible on the very same session.
    await setAccountRole(suite.context, adminId, 'admin');
    assert.equal((await readAs('/api/audit-logs')).status, 200);
    assert.equal((await insertEmployee('After promotion allowed')).status, 201);

    const counts = await pool.query<{ name: string }>(
      `SELECT name FROM employees WHERE name IN
       ('Before downgrade', 'After downgrade prohibited', 'Director prohibited',
        'After promotion allowed') ORDER BY name`,
    );
    assert.deepEqual(counts.rows.map(x => x.name).sort(),
      ['Before downgrade', 'After promotion allowed'].sort(),
      'denied writes must leave no rows');
  });
});
