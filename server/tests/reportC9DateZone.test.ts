/** C9 date-zone integration: synthetic only, no institutional DB/data. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { PgReportRepository, ReportDateZoneRequiredError } from '../src/repositories/reportRepository';
import { resolveInstitutionReportDateTimeZone } from '../src/repositories/reportTimeZone';
import { reportAccessFor } from '../src/authorization/reportAccess';
import { REPORT_SQL_SENTINEL_ROWS } from '../src/repositories/reportLimits';

const access = reportAccessFor({ role: 'admin', employeeId: null });
const filter = { reportType: 'incoming' as const, dateFrom: '2026-11-01' };

test('C9 accepts only explicitly configured supported calendar zones', () => {
  assert.equal(resolveInstitutionReportDateTimeZone(undefined), null);
  assert.equal(resolveInstitutionReportDateTimeZone(' Asia/Baghdad '), 'Asia/Baghdad');
  for (const bad of ['', ' ', 'Invalid/Nowhere', '../../etc/passwd', 'Asia/Baghdad;DROP', 'A'.repeat(129)]) {
    assert.throws(() => resolveInstitutionReportDateTimeZone(bad),
      /Invalid ALSQAYA_REPORT_TIME_ZONE/);
  }
});

test('C9 normal production constructor binds calendar zone; missing/invalid fail closed', async () => {
  const original = process.env.ALSQAYA_REPORT_TIME_ZONE;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params: [...params] });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  try {
    delete process.env.ALSQAYA_REPORT_TIME_ZONE;
    await assert.rejects(new PgReportRepository(db).list('incoming', filter, access),
      ReportDateZoneRequiredError);
    assert.equal(calls.length, 0, 'must not query without approved zone');

    process.env.ALSQAYA_REPORT_TIME_ZONE = 'Asia/Baghdad';
    const rows = await new PgReportRepository(db).list('incoming', filter, access);
    assert.deepEqual(rows, []);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /timezone\(\$1::text, t\.created_at\)::date/);
    assert.match(calls[0].sql, /ORDER BY t\.created_at DESC, t\.id DESC\s+LIMIT \$3$/);
    assert.deepEqual(calls[0].params,
      ['Asia/Baghdad', '2026-11-01', REPORT_SQL_SENTINEL_ROWS]);

    process.env.ALSQAYA_REPORT_TIME_ZONE = 'Invalid/Nowhere';
    assert.throws(() => new PgReportRepository(db),
      /Invalid ALSQAYA_REPORT_TIME_ZONE/);
    assert.equal(calls.length, 1, 'bad deployment zone must fail before SQL');
  } finally {
    if (original === undefined) delete process.env.ALSQAYA_REPORT_TIME_ZONE;
    else process.env.ALSQAYA_REPORT_TIME_ZONE = original;
  }
});
