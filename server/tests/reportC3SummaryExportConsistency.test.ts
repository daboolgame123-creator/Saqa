/** Phase 23/C3 — synthetic-only consistency contract, not DB/HTTP release proof. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor } from '../src/authorization/reportAccess';
import { ReportApiService } from '../src/api/services/reportService';
import { buildReportExportModel, ReportExportUnavailableError } from '../src/api/services/reportExport';
import type { ReportRepository, ReportType } from '../src/repositories/contracts';

const admin = reportAccessFor({ role: 'admin', employeeId: null });
const books = [
  { id: 'PRIVATE_INTERNAL_ID_1', date: '2026-11-01T09:00:00Z', type: 'وارد', status: 'مكتمل', title: 'عنوان ١' },
  { id: 'PRIVATE_INTERNAL_ID_2', date: '2026-11-02T09:00:00Z', type: 'صادر', status: 'قيد المراجعة', title: 'عنوان ٢' },
  { id: 'PRIVATE_INTERNAL_ID_3', date: '2026-11-03T09:00:00Z', type: 'داخلي', status: 'مكتمل', title: 'عنوان ٣' },
];

function repository(rows: typeof books): ReportRepository {
  return {
    async list() { return rows; },
    async readCircularAcknowledgements() { throw new Error('Unexpected circular report call'); },
  };
}

test('C3: both book-statistics reports use exactly their visible detail rows and export summary', async () => {
  const service = new ReportApiService(repository(books));
  const expected = {
    totalBooks: 3, incoming: 1, outgoing: 1, internal: 1,
    statuses: { 'قيد المراجعة': 1, 'مكتمل': 2 },
  };
  for (const reportType of ['monthly', 'situation'] as const) {
    const response = await service.run({ reportType, status: 'مكتمل' }, admin);
    assert.deepEqual(response.summary.bookStatistics, expected);
    assert.equal(response.summary.totalCount, books.length);
    const model = buildReportExportModel(reportType, response);
    assert.equal(model.details.length, books.length);
    assert.ok(model.summary.some(row => row[0] === 'إجمالي الكتب' && row[1] === '3'));
    assert.ok(model.summary.some(row => row[0] === 'الوارد' && row[1] === '1'));
    assert.ok(model.summary.some(row => row[0] === 'الصادر' && row[1] === '1'));
    assert.ok(model.summary.some(row => row[0] === 'الداخلي' && row[1] === '1'));
    assert.ok(model.summary.some(row => row[0] === 'قيد المراجعة' && row[1] === '1'));
    assert.ok(model.summary.some(row => row[0] === 'مكتمل' && row[1] === '2'));
    assert.ok(model.summary.some(row => row[0] === 'فلتر: الحالة' && row[1] === 'مكتمل'));
    const exportedFields = JSON.stringify(model);
    for (const b of books) assert.ok(!exportedFields.includes(b.id), 'Internal row IDs are never export details');
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
