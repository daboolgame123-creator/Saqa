/** Synthetic real-session / migrated PostgreSQL proof. Loopback test app only. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import ExcelJS from 'exceljs';
import type { Pool } from 'pg';
import { startTestDatabase, stopTestDatabase } from './testDb';
import { startApiTestContext, useTestSession, type ApiTestContext } from '../api/apiTestHelpers';
import { newAuthenticatedAccount } from '../api/apiTestData';
import { createOwnAcknowledgementCandidateRouter } from '../../src/api/routes/reportOwnAcknowledgementCandidateRoutes';
import { useAuthService } from '../../src/auth/serviceContext';
import { createErrorHandler, notFoundHandler } from '../../src/middleware';
import { waitForListening, type RunningApp } from '../helpers';
import { closeServer } from '../../src/server';
import { MAX_REPORT_ROWS } from '../../src/repositories/reportLimits';
import { OFFICIAL_REPORTS_RELEASE_APPROVED } from '../../../src/core/reportReleaseGate';

type Account = Awaited<ReturnType<typeof newAuthenticatedAccount>>;
type OwnReport = { ownAcknowledgementCount: number; entries: Array<{
  transactionId: string; title: string; acknowledgedAt: string;
}> };

describe('24-C detached own acknowledgements HTTP', () => {
  let pool: Pool, main: ApiTestContext, detached: RunningApp;
  const accounts: Record<string, Account> = {};
  let reads = 0, ownBook: string, otherBook: string;
  const stamp = '2026-11-08T21:30:00.000Z'; // Baghdad: November 9
  before(async () => {
    ({ pool } = await startTestDatabase());
    main = await startApiTestContext(pool);
    let n = 0;
    for (const [key, role] of [
      ['a', 'employee'], ['b', 'employee'], ['unlinked', 'employee'],
      ['temporary', 'employee'], ['admin', 'admin'], ['director', 'director'],
    ] as const) {
      accounts[key] = await newAuthenticatedAccount(main, {
        role, badgeNumber: '24C-' + ++n, phone: '0770000240' + n, name: 'SYNTH_24C_' + key,
      });
    }
    useTestSession(null);
    await pool.query('UPDATE users SET employee_id = NULL WHERE id = $1', [accounts.unlinked.account.id]);
    await pool.query('UPDATE users SET must_change_secret = true WHERE id = $1', [accounts.temporary.account.id]);
    ownBook = await book('=SYNTH_OWN_A');
    otherBook = await book('SYNTH_COWORKER_B_SECRET');
    await ack(ownBook, 'a');
    await ack(otherBook, 'b');
    const shared = await book('SYNTH_SHARED');
    await ack(shared, 'a');
    await ack(shared, 'b', '2026-11-07T12:00:00Z');
    for (const [visibility, daily, deleted] of [
      ['Administrative', false, false], ['SpecificEmployees', false, false],
      ['PublicToEmployees', true, false], ['PublicToEmployees', false, true],
    ] as const) {
      await ack(await book('SYNTH_EXCLUDED', visibility, daily, deleted), 'a');
    }
    const viewedOnly = await book('SYNTH_NOT_FORMALLY_ACKNOWLEDGED');
    await pool.query(`INSERT INTO view_logs(transaction_id,user_id,employee_id,viewed_at)
      VALUES ($1,$2,$3,now())`, [viewedOnly, accounts.a.account.id, accounts.a.employee.id]);

    // Count only owner report reads, separately from real authentication SQL.
    const db = new Proxy(pool, {
      get(target, property) {
        if (property === 'query') return (...args: Parameters<Pool['query']>) => {
          reads++;
          return target.query(...args);
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const app = express();
    app.use(useAuthService(main.authService));
    app.use('/__24c_own', createOwnAcknowledgementCandidateRouter(db, 'Asia/Baghdad'));
    app.use('/__24c_no_zone', createOwnAcknowledgementCandidateRouter(db, null));
    app.use(notFoundHandler);
    app.use(createErrorHandler({ exposeDetails: false }));
    const server = app.listen(0, '127.0.0.1');
    const port = await waitForListening(server);
    detached = { server, port, baseUrl: 'http://127.0.0.1:' + port,
      shutdown: async () => { server.closeAllConnections(); await closeServer(server); } };
  });
  after(async () => {
    try { if (detached) await detached.shutdown(); if (main) await main.running.shutdown(); }
    finally { useTestSession(null); await stopTestDatabase(); }
  });

  async function book(title: string, visibility = 'PublicToEmployees', daily = false, deleted = false) {
    const result = await pool.query<{ id: string }>(`INSERT INTO transactions(
      number,sequence,document_date,month,direction,category,sub_type,entity,subject,
      visibility,status,is_daily_situation,deleted_at)
      VALUES ('24C','1','2020-01-01','2020-01','وارد','إدارية','تعميم','SYNTH',$1,
      $2::jsonb,'مكتمل',$3,CASE WHEN $4 THEN now() ELSE NULL END) RETURNING id`,
    [title, JSON.stringify(visibility), daily, deleted]);
    return result.rows[0].id;
  }
  async function ack(id: string, who: string, at = stamp) {
    await pool.query(`INSERT INTO view_logs(transaction_id,user_id,employee_id,viewed_at,acknowledged_at,session_ref)
      VALUES ($1,$2,$3,$4,$4,'SYNTH_SESSION_NEVER_EXPOSED')`,
    [id, accounts[who].account.id, accounts[who].employee.id, at]);
  }
  const hit = (base: string, path: string, token?: string, extra: Record<string, string> = {}) => fetch(base + path, {
    headers: { connection: 'close', ...(token ? { authorization: 'Bearer ' + token } : {}), ...extra },
  });
  const request = (path = '', who = 'a') => hit(detached.baseUrl, '/__24c_own' + path, accounts[who].sessionToken);

  it('A/B preview and Excel expose only the same verified owner rows, no colleague statistics', async () => {
    for (const who of ['a', 'b']) {
      const response = await request('', who);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const report = await response.json() as OwnReport;
      assert.deepEqual(Object.keys(report).sort(), ['entries', 'ownAcknowledgementCount']);
      assert.equal(report.ownAcknowledgementCount, 2);
      assert.ok(report.entries.some(e => e.transactionId === (who === 'a' ? ownBook : otherBook)));
      for (const entry of report.entries) assert.deepEqual(Object.keys(entry).sort(), ['acknowledgedAt', 'title', 'transactionId']);
      const file = await request('/export', who);
      assert.equal(file.status, 200);
      assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(file.headers.get('cache-control'), 'no-store');
      assert.match(file.headers.get('content-disposition')!, /alsqaya-own-acknowledgements.xlsx/);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
      assert.equal(workbook.getWorksheet('الملخص')!.getCell('B2').text, '2');
      const details = workbook.getWorksheet('إقراراتي')!;
      assert.equal(details.rowCount, 3);
      assert.deepEqual([2, 3].map(row => [details.getCell('A' + row).text, details.getCell('B' + row).text]),
        report.entries.map(e => [e.title.startsWith('=') ? "'" + e.title : e.title, e.acknowledgedAt]));
      const all = JSON.stringify(report) + JSON.stringify(workbook.model);
      for (const secret of [accounts[who === 'a' ? 'b' : 'a'].employee.id,
        who === 'a' ? 'SYNTH_COWORKER_B_SECRET' : '=SYNTH_OWN_A',
        'SYNTH_SESSION_NEVER_EXPOSED', 'problemRecords', 'SYNTH_EXCLUDED', 'SYNTH_NOT_FORMALLY_ACKNOWLEDGED']) {
        assert.ok(!all.includes(secret), secret);
      }
    }
    // Coworker-only extra history must not change A's response or count.
    const before = await (await request()).json();
    await ack(await book('SYNTH_EXTRA_B'), 'b');
    assert.deepEqual(await (await request()).json(), before);
  });

  it('rejects identity/scope/format tampering and malformed filters before owner SQL', async () => {
    const before = reads;
    for (const suffix of ['', '/export']) for (const query of [
      'employee=' + accounts.b.employee.id, 'employeeId=' + accounts.b.employee.id,
      'role=admin', 'reportType=circularsAndAcknowledgements', 'personnelScope=all',
      'transactionScope=all', 'dateTimeZone=UTC', 'format=pdf', 'employee=',
      'source=', 'documentDateFrom=2026-11-01', 'status=bad',
      'dateFrom=2026-02-30', 'dateFrom=2026-11-10&dateTo=2026-11-01',
      'status=x&status=y', 'dateFrom[x]=2026-11-01',
    ]) assert.equal((await request(suffix + '?' + query)).status, 400, query);
    assert.equal(reads, before);
    const headerForgery = await hit(detached.baseUrl, '/__24c_own', accounts.a.sessionToken,
      { 'x-employee-id': accounts.b.employee.id, 'x-role': 'admin' });
    assert.equal(headerForgery.status, 200);
    assert.ok(!(await headerForgery.text()).includes(otherBook));
  });

  it('requires real session, linked employee, changed secret and employee-only role', async () => {
    const before = reads;
    for (const suffix of ['', '/export']) {
      assert.equal((await hit(detached.baseUrl, '/__24c_own' + suffix)).status, 401);
      assert.equal((await hit(detached.baseUrl, '/__24c_own' + suffix, 'forged-token')).status, 401);
      for (const who of ['unlinked', 'temporary', 'admin', 'director']) {
        const denied = await request(suffix, who);
        assert.equal(denied.status, 403, who);
        assert.equal(denied.headers.get('cache-control'), 'no-store');
      }
    }
    assert.equal(reads, before);
  });

  it('dates use acknowledgement day in trusted timezone, not old document date; status narrows', async () => {
    const dated = await request('?dateFrom=2026-11-09&dateTo=2026-11-09');
    assert.equal(dated.status, 200);
    assert.equal((await dated.json() as OwnReport).ownAcknowledgementCount, 2);
    for (const query of ['?dateTo=2026-11-08', '?status=' + encodeURIComponent('قيد المراجعة')]) {
      assert.equal((await (await request(query)).json() as OwnReport).ownAcknowledgementCount, 0);
    }
    const before = reads;
    const noZone = await hit(detached.baseUrl, '/__24c_no_zone?dateFrom=2026-11-09', accounts.a.sessionToken);
    assert.equal(noZone.status, 503);
    assert.equal(reads, before);
  });

  it('official gate remains false/503 and candidate is absent from production', async () => {
    assert.equal(OFFICIAL_REPORTS_RELEASE_APPROVED, false);
    const before = reads;
    for (const suffix of ['', '/export']) {
      const official = await hit(main.baseUrl, '/api/reports' + suffix, accounts.a.sessionToken);
      assert.equal(official.status, 503);
      assert.equal((await official.json() as { error: { code: string } }).error.code, 'REPORTS_UNAVAILABLE');
      assert.equal((await hit(main.baseUrl, '/__24c_own' + suffix, accounts.a.sessionToken)).status, 404);
      assert.equal((await hit(main.baseUrl, '/api/own-acknowledgements' + suffix, accounts.a.sessionToken)).status, 404);
    }
    assert.equal(reads, before);
  });

  it('2000 raw history rows accepted, 2001 fail closed before deduplication for JSON/Excel', async () => {
    const inserted = await pool.query<{ id: string }>(`INSERT INTO view_logs(
      transaction_id,user_id,employee_id,viewed_at,acknowledged_at)
      SELECT $1,NULL,$2,$3,$3 FROM generate_series(1,$4) RETURNING id`,
    [ownBook, accounts.a.employee.id, stamp, MAX_REPORT_ROWS - 2]);
    // Only own + shared count in SQL; excluded/viewed-only rows do not.
    const extra: string[] = [];
    try {
      for (const suffix of ['', '/export']) assert.equal((await request(suffix)).status, 200);
      const overflow = await pool.query<{ id: string }>(`INSERT INTO view_logs(
        transaction_id,user_id,employee_id,viewed_at,acknowledged_at)
        VALUES($1,NULL,$2,$3,$3) RETURNING id`, [ownBook, accounts.a.employee.id, stamp]);
      extra.push(overflow.rows[0].id);
      for (const suffix of ['', '/export']) {
        const denied = await request(suffix);
        assert.equal(denied.status, 503);
        assert.deepEqual(await denied.json(), { error: { code: 'OWN_ACKNOWLEDGEMENTS_UNAVAILABLE', message: 'إقراراتي غير متاحة حالياً.' } });
        assert.ok(!denied.headers.has('content-disposition'));
      }
    } finally {
      // Synthetic test-only cleanup; leave the two original owner rows intact.
      await pool.query('DELETE FROM view_logs WHERE id = ANY($1::uuid[])', [inserted.rows.map(r => r.id).concat(extra)]);
    }
  });

  it('oversized title fails closed without sending preview or partial Excel', async () => {
    await pool.query('UPDATE transactions SET subject = $2 WHERE id = $1', [ownBook, 'x'.repeat(4001)]);
    try {
      for (const suffix of ['', '/export']) assert.equal((await request(suffix)).status, 503);
    } finally { await pool.query('UPDATE transactions SET subject = $2 WHERE id = $1', [ownBook, '=SYNTH_OWN_A']); }
  });

  it('logout invalidates A, leaves B valid', async () => {
    assert.equal((await fetch(main.baseUrl + '/api/auth/logout', { method: 'POST',
      headers: { authorization: 'Bearer ' + accounts.a.sessionToken, connection: 'close' } })).status, 204);
    const before = reads;
    for (const suffix of ['', '/export']) assert.equal((await request(suffix)).status, 401);
    assert.equal(reads, before);
    assert.equal((await request('', 'b')).status, 200);
  });
});
