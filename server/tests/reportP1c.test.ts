/** P1c: in-process SQL construction tests (no sockets, real database or migrations). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import {
  PgReportRepository, ReportDateZoneRequiredError,
  ReportFilterUnavailableError, ReportNotImplementedError,
} from '../src/repositories/reportRepository';
import { REPORT_SQL_SENTINEL_ROWS } from '../src/repositories/reportLimits';

const admin = reportAccessFor({ role: 'admin', employeeId: null });
const employee = reportAccessFor({ role: 'employee', employeeId: 'linked-employee' });

test('P1c: admin book SQL uses DDL columns and registration date, never FALSE administrative scope', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const db = { query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params }); return { rows: [] };
  } };
  const repo = new PgReportRepository(db as never, 'Asia/Baghdad');
  await repo.list('monthly', {
    reportType: 'monthly', dateFrom: '2026-01-01', dateTo: '2026-01-31',
    employee: 'person', type: 'وارد', status: 'مكتمل',
  }, admin);
  assert.equal(calls.length, 1);
  const [{ sql, params }] = calls;
  assert.match(sql, /FROM transactions t/);
  assert.match(sql, /t\.deleted_at IS NULL/);
  assert.match(sql, /t\.is_daily_situation = false/);
  assert.match(sql, /t\.imported_at IS NULL/);
  assert.match(sql, /timezone\(\$\d+::text, t\.created_at\)::date/);
  assert.match(sql, /EXISTS\s*\(\s*SELECT 1 FROM transaction_employees te/);
  assert.match(sql, /WHERE[^]* AND TRUE\s*ORDER BY/);
  assert.doesNotMatch(sql, /t\.source|t\.employee_id|document_date|FROM transactions\s+WHERE/);
  assert.deepEqual(params, ['مكتمل', 'وارد', 'person', 'Asia/Baghdad', '2026-01-01', '2026-01-31', REPORT_SQL_SENTINEL_ROWS]);
  assert.ok(sql.trimEnd().endsWith('LIMIT $7'));
});

test('P1c: incoming/outgoing query has a fixed direction and refuses unsupported filters', async () => {
  const queries: string[] = [];
  const repo = new PgReportRepository({
    query: async (sql: string) => { queries.push(sql); return { rows: [] }; },
  } as never);
  await repo.list('incoming', { reportType: 'incoming' }, admin);
  await repo.list('outgoing', { reportType: 'outgoing' }, admin);
  assert.match(queries[0], /t\.direction = 'وارد'/);
  assert.match(queries[1], /t\.direction = 'صادر'/);
  assert.doesNotMatch(queries[0], /t\.imported_at IS NULL/);
  for (const f of [{ section: 'قسم' }, { source: 'جهة' }]) {
    await assert.rejects(repo.list('monthly', { reportType: 'monthly', ...f }, admin), ReportFilterUnavailableError);
  }
  await assert.rejects(repo.list('monthly', { reportType: 'monthly', dateTo: '2026-01-05' }, admin), ReportDateZoneRequiredError);
  await assert.rejects(repo.list('circularsAndAcknowledgements', { reportType: 'circularsAndAcknowledgements' }, admin), ReportNotImplementedError);
  assert.equal(queries.length, 2, 'No extra query after explicit failures');
});

test('P1c: no employee query reaches the DB despite valid book-scope SQL', async () => {
  let count = 0;
  const repo = new PgReportRepository({
    query: async () => { count++; return { rows: [] }; },
  } as never, 'Asia/Baghdad');
  await assert.rejects(repo.list('monthly', { reportType: 'monthly' }, employee), ReportScopeNotReadyError);
  assert.equal(count, 0);
});
