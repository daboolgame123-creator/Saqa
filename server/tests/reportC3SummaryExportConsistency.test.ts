/** Phase 23/C3 — synthetic-only consistency contract, not DB/HTTP release proof. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor } from '../src/authorization/reportAccess';
import { ReportApiService } from '../src/api/services/reportService';
import { buildReportExportModel, ReportExportUnavailableError } from '../src/api/services/reportExport';
import type { ReportRepository } from '../src/repositories/contracts';

const admin = reportAccessFor({ role: 'admin', employeeId: null });
const books = [
  { id: 'PRIVATE_INTERNAL_ID_1', date: '2026-11-01T09:00:00Z', type: 'وارد', status: 'مكتمل', title: 'عنوان ١' },
  { id: 'PRIVATE_INTERNAL_ID_2', date: '2026-11-02T09:00:00Z', type: 'صادر', status: 'قيد المراجعة', title: 'عنوان ٢' },
  { id: 'PRIVATE_INTERNAL_ID_3', date: '2026-11-03T09:00:00Z', type: 'داخلي', status: 'مكتمل', title: 'عنوان ٣' },
];

function repository(rows: typeof books): ReportRepository {
  // A synthetic scoped-query result. This does not replace PostgreSQL scope
  // tests, but it must honor the requested filter to avoid false test evidence.
  return {
    async list(_reportType, filter) {
      return rows.filter(row => filter.status === undefined || row.status === filter.status);
    },
    async readCircularAcknowledgements() { throw new Error('Unexpected circular report call'); },
  };
}

test('C3: book totals and exports match unfiltered and status-filtered authorized row sets', async () => {
  const service = new ReportApiService(repository(books));
  const cases = [
    {
      filter: undefined,
      stats: {
        totalBooks: 3, incoming: 1, outgoing: 1, internal: 1,
        statuses: { 'قيد المراجعة': 1, 'مكتمل': 2 },
      },
      expectedCount: 3,
    },
    {
      filter: 'مكتمل',
      stats: {
        totalBooks: 2, incoming: 1, outgoing: 0, internal: 1,
        statuses: { 'قيد المراجعة': 0, 'مكتمل': 2 },
      },
      expectedCount: 2,
    },
  ] as const;
  for (const reportType of ['monthly', 'situation'] as const) {
    for (const scenario of cases) {
      const response = await service.run({
        reportType,
        ...(scenario.filter ? { status: scenario.filter } : {}),
      }, admin);
      assert.deepEqual(response.summary.bookStatistics, scenario.stats);
      assert.equal(response.summary.totalCount, scenario.expectedCount);
      const model = buildReportExportModel(reportType, response);
      assert.equal(model.details.length, scenario.expectedCount);
      const numbers = new Map(model.summary);
      assert.equal(numbers.get('إجمالي الكتب'), String(scenario.stats.totalBooks));
      assert.equal(numbers.get('الوارد'), String(scenario.stats.incoming));
      assert.equal(numbers.get('الصادر'), String(scenario.stats.outgoing));
      assert.equal(numbers.get('الداخلي'), String(scenario.stats.internal));
      assert.equal(numbers.get('قيد المراجعة'), String(scenario.stats.statuses['قيد المراجعة']));
      assert.equal(numbers.get('مكتمل'), String(scenario.stats.statuses['مكتمل']));
      assert.equal(numbers.get('فلتر: الحالة'), scenario.filter);
      const exportedFields = JSON.stringify(model);
      for (const book of books) {
        assert.ok(!exportedFields.includes(book.id), 'Internal row IDs are never export details');
      }
      if (scenario.filter === 'مكتمل') {
        assert.ok(!exportedFields.includes('عنوان ٢'), 'Filtered-out book content must not be exported');
      }
    }
  }
});

test('C3: tampered book statistics or mismatched total are rejected before rendering', async () => {
  const service = new ReportApiService(repository(books));
  const original = await service.run({ reportType: 'monthly' }, admin);
  const stats = original.summary.bookStatistics!;
  for (const altered of [
    { ...stats, totalBooks: 2 },
    { ...stats, incoming: 2 },
    { ...stats, statuses: { ...stats.statuses, 'مكتمل': 3 } },
  ]) {
    assert.throws(
      () => buildReportExportModel('monthly', {
        ...original,
        summary: { ...original.summary, bookStatistics: altered },
      }),
      ReportExportUnavailableError,
    );
  }
  assert.throws(
    () => buildReportExportModel('monthly', {
      ...original, summary: { ...original.summary, totalCount: books.length + 1 },
    }),
    ReportExportUnavailableError,
  );
  // Conservation can still hold when malformed numbers compensate. Every
  // reported count must be a finite, nonnegative safe integer independently.
  const malformed = [
    { ...stats, incoming: 2, outgoing: -1 },
    { ...stats, statuses: { 'قيد المراجعة': -1, 'مكتمل': 4 } },
    { ...stats, incoming: 0.5, outgoing: 1.5 },
    { ...stats, incoming: Number.POSITIVE_INFINITY, outgoing: Number.NEGATIVE_INFINITY },
    { ...stats, statuses: { 'قيد المراجعة': Number.NaN, 'مكتمل': 2 } },
  ];
  for (const value of malformed) {
    assert.throws(
      () => buildReportExportModel('monthly', {
        ...original, summary: { ...original.summary, bookStatistics: value },
      }),
      ReportExportUnavailableError,
    );
  }
});

test('C3: unsupported independent researcher/professor reports cannot yield empty success-shaped exports', async () => {
  const fake = repository([]);
  const service = new ReportApiService(fake);
  for (const reportType of ['researchers', 'professors'] as const) {
    await assert.rejects(
      service.export({ reportType }, admin, 'excel'),
      ReportExportUnavailableError,
    );
  }
});
