/** Phase 23/C3-S3: synthetic-only certification checks at the export boundary. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportResponse } from '../src/api/dto/report';
import { buildReportExportModel, ReportExportUnavailableError } from '../src/api/services/reportExport';

function sample(): ReportResponse {
  return {
    rows: [{ id: 'cir-1', date: '2026-11-01', title: 'تعميم اختبار' }],
    summary: { totalCount: 1, generatedAt: '2026-11-06T10:00:00Z' },
    circularAcknowledgements: {
      acknowledgements: [
        { transactionId: 'cir-1', employeeId: 'hidden-a', employeeName: 'منتسب تجريبي',
          acknowledgedAt: '2026-11-02T12:00:00Z' },
      ],
      statistics: {
        circularCount: 1,
        acknowledgementOperations: 1,
        uniqueEmployees: 1,
        verifiedAcknowledgementOperations: 1,
        verifiedUniqueEmployees: 1,
        problemRecords: 0,
        problemReasons: {
          missingEmployeeId: 0,
          identityMismatch: 0,
          conflictingAcknowledgementTime: 0,
        },
        complete: true,
      },
    },
  };
}

test('C3-S3: certified counts match verified rows without leaking internal employee ID', () => {
  const model = buildReportExportModel('circularsAndAcknowledgements', sample());
  assert.equal(model.acknowledgements.length, 1);
  assert.ok(model.summary.some(([label, value]) => label === 'اكتمال التحقق' && value === 'نعم'));
  assert.ok(!JSON.stringify(model).includes('hidden-a'));
});

test('C3-S3: uncertainty correctly preserves verified subset and overlapping anomaly reasons', () => {
  const report = sample();
  const stats = report.circularAcknowledgements!.statistics;
  stats.complete = false;
  stats.acknowledgementOperations = null;
  stats.uniqueEmployees = null;
  stats.problemRecords = 2;
  stats.problemReasons.missingEmployeeId = 2;
  stats.problemReasons.identityMismatch = 1; // One row may have multiple problems.
  const model = buildReportExportModel('circularsAndAcknowledgements', report);
  assert.ok(model.summary.some(([label, value]) =>
    label === 'إجمالي عمليات الاطلاع المؤكدة' && value === 'غير محسوم'));
  assert.ok(model.summary.some(([label, value]) =>
    label === 'الإقرارات المتحقق منها' && value === '1'));
  assert.ok(model.summary.some(([label, value]) =>
    label === 'السجلات الإشكالية' && value === '2'));
});

test('C3-S3: malformed ViewLog totals and contradictory certified states fail before exporting', () => {
  const cases: Array<(report: ReportResponse) => void> = [
    r => { r.circularAcknowledgements!.statistics.verifiedUniqueEmployees = 2; },
    r => { r.circularAcknowledgements!.statistics.verifiedAcknowledgementOperations = -1; },
    r => { r.circularAcknowledgements!.statistics.verifiedUniqueEmployees = 0.5; },
    r => { r.circularAcknowledgements!.statistics.problemRecords = Number.NaN; },
    r => { r.circularAcknowledgements!.statistics.problemReasons.identityMismatch = -1; },
    r => { r.circularAcknowledgements!.statistics.problemReasons.missingEmployeeId = 1; },
    r => { r.circularAcknowledgements!.statistics.complete = false; },
    r => { r.circularAcknowledgements!.statistics.complete = false;
      r.circularAcknowledgements!.statistics.problemRecords = 1; },
    r => { r.circularAcknowledgements!.statistics.uniqueEmployees = 0; },
    r => { r.circularAcknowledgements!.statistics.acknowledgementOperations = 0; },
    r => { r.circularAcknowledgements!.statistics.verifiedAcknowledgementOperations = 2; },
    r => { r.circularAcknowledgements!.statistics.problemRecords = 1; },
    r => { r.circularAcknowledgements!.statistics.problemReasons.conflictingAcknowledgementTime = Number.POSITIVE_INFINITY; },
    r => { (r.circularAcknowledgements!.statistics as unknown as {complete:unknown}).complete = 'true'; },
    r => { r.circularAcknowledgements!.statistics.complete = false;
      r.circularAcknowledgements!.statistics.problemRecords = 1;
      r.circularAcknowledgements!.statistics.acknowledgementOperations = null;
      r.circularAcknowledgements!.statistics.uniqueEmployees = null;
      r.circularAcknowledgements!.statistics.problemReasons.identityMismatch = 2; },
  ];
  for (const mutate of cases) {
    const response = sample();
    mutate(response);
    assert.throws(
      () => buildReportExportModel('circularsAndAcknowledgements', response),
      ReportExportUnavailableError,
    );
  }
});
