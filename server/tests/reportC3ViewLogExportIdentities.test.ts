/** C3-S4 — synthetic-only ViewLog export identity/dedup invariants.
 * Does not authorize employee ViewLog access, open HTTP or test PostgreSQL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportResponse } from '../src/api/dto/report';
import { buildReportExportModel, ReportExportUnavailableError } from '../src/api/services/reportExport';

function circular(): ReportResponse {
  const acknowledgements = [
    { transactionId: 'c1', employeeId: 'e1', employeeName: 'موظف أ', acknowledgedAt: '2026-11-01T10:00:00Z' },
    { transactionId: 'c2', employeeId: 'e1', employeeName: 'موظف أ', acknowledgedAt: '2026-11-02T10:00:00Z' },
    { transactionId: 'c3', employeeId: 'e1', employeeName: 'موظف أ', acknowledgedAt: '2026-11-03T10:00:00Z' },
    { transactionId: 'c2', employeeId: 'e2', employeeName: 'موظف ب', acknowledgedAt: '2026-11-02T11:00:00Z' },
  ];
  return {
    // Registration period and acknowledgement period are different clocks:
    // an older acknowledged circular need not be in the selected book rows.
    rows: [{ id: 'c3', date: '2026-11-03', type: 'تعميم', title: 'تعميم جديد' }],
    summary: { totalCount: 1, generatedAt: '2026-11-06T10:00:00Z' },
    circularAcknowledgements: {
      acknowledgements,
      statistics: {
        circularCount: 1, acknowledgementOperations: 4, uniqueEmployees: 2,
        verifiedAcknowledgementOperations: 4, verifiedUniqueEmployees: 2,
        problemRecords: 0, complete: true,
        problemReasons: {
          missingEmployeeId: 0, identityMismatch: 0, conflictingAcknowledgementTime: 0,
        },
      },
    },
  };
}

test('C3-S4: four unique employee/circular pairs produce four operations and two unique employees', () => {
  const model = buildReportExportModel('circularsAndAcknowledgements', circular());
  assert.equal(model.details.length, 1);
  assert.equal(model.acknowledgements.length, 4);
  assert.equal(model.summary.find(([key]) => key === 'عدد المنتسبين الفريدين')?.[1], '2');
  assert.equal(model.summary.find(([key]) => key === 'إجمالي عمليات الاطلاع المؤكدة')?.[1], '4');
  assert.equal(model.acknowledgements[0][2], 'كتاب خارج فترة التسجيل');
  assert.ok(!JSON.stringify(model).includes('"e1"'), 'Internal identity must not be serialized to export columns');
});

test('C3-S4: a repeated employee/circular operation fails before rendering, regardless of account or timestamp', () => {
  const report = circular();
  const original = report.circularAcknowledgements!.acknowledgements[0];
  report.circularAcknowledgements!.acknowledgements.push({ ...original, acknowledgedAt: '2026-11-05T12:00:00Z' });
  const stats = report.circularAcknowledgements!.statistics;
  stats.verifiedAcknowledgementOperations = 5;
  stats.acknowledgementOperations = 5;
  assert.throws(
    () => buildReportExportModel('circularsAndAcknowledgements', report),
    /Duplicate ViewLog acknowledgement operation/,
  );
});

test('C3-S4: fabricated unique count cannot pass even when within operation bound', () => {
  const report = circular();
  report.circularAcknowledgements!.statistics.verifiedUniqueEmployees = 3;
  report.circularAcknowledgements!.statistics.uniqueEmployees = 3;
  assert.throws(() => buildReportExportModel('circularsAndAcknowledgements', report),
    /Inconsistent ViewLog unique employee count/);
});

test('C3-S4: undefined or blank identities never become exported operations', () => {
  for (const broken of [
    { transactionId: '', employeeId: 'e1' },
    { transactionId: 'c1', employeeId: ' ' },
    { transactionId: 'c1', employeeId: null },
    { transactionId: null, employeeId: 'e1' },
  ]) {
    const report = circular();
    Object.assign(report.circularAcknowledgements!.acknowledgements[0], broken);
    assert.throws(
      () => buildReportExportModel('circularsAndAcknowledgements', report),
      ReportExportUnavailableError,
    );
  }
});

test('C3-S4: incomplete historical indicators still permit only distinct VERIFIED operations', () => {
  const report = circular();
  const stats = report.circularAcknowledgements!.statistics;
  stats.complete = false;
  stats.acknowledgementOperations = null;
  stats.uniqueEmployees = null;
  stats.problemRecords = 2;
  stats.problemReasons.identityMismatch = 1;
  stats.problemReasons.conflictingAcknowledgementTime = 1;
  const model = buildReportExportModel('circularsAndAcknowledgements', report);
  assert.equal(model.acknowledgements.length, 4);
  assert.equal(model.summary.find(([key]) => key === 'إجمالي عمليات الاطلاع المؤكدة')?.[1], 'غير محسوم');
  assert.equal(model.summary.find(([key]) => key === 'الإقرارات المتحقق منها')?.[1], '4');
});
