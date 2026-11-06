/** Phase 23/C2 — application-side JSON handoff contract only.
 * No renderer process, Docker, network, real institution records or HTTP enablement.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import { ReportApiService } from '../src/api/services/reportService';
import { buildReportExportModel, ReportExportUnavailableError } from '../src/api/services/reportExport';
import { decodeReportPdfInput, encodeReportPdfInput, ReportPdfInputError } from '../src/api/services/reportPdfInput';
import type { ReportRepository } from '../src/repositories/contracts';

const admin = reportAccessFor({ role: 'admin', employeeId: null });
const employee = reportAccessFor({ role: 'employee', employeeId: 'synthetic-person-001' });

function syntheticRepository() {
  let listCalls = 0;
  let acknowledgementCalls = 0;
  const repository: ReportRepository = {
    async list() {
      listCalls++;
      return [{
        id: 'SECRET_INTERNAL_ROW_ID',
        date: '2026-11-06T09:00:00Z',
        type: 'وارد',
        status: 'مكتمل',
        title: 'عنوان تجريبي <img src="file:///etc/passwd">',
        notes: '=HYPERLINK("https://example.invalid","text only")',
      }];
    },
    async readCircularAcknowledgements() {
      acknowledgementCalls++;
      throw new Error('Unexpected ViewLog query');
    },
  };
  return {
    repository,
    calls: () => ({ listCalls, acknowledgementCalls }),
  };
}

test('C2 contract: authorized service rows become strictly data-only versioned PDF input', async () => {
  const fake = syntheticRepository();
  const service = new ReportApiService(fake.repository);
  const result = await service.run({ reportType: 'incoming' }, admin);
  const model = buildReportExportModel('incoming', result);
  const bytes = encodeReportPdfInput(model);
  const decoded = decodeReportPdfInput(bytes);
  assert.equal(decoded.schemaVersion, 1);
  assert.equal(decoded.hasAcknowledgements, false);
  assert.deepEqual(decoded.details, model.details.map(row => [...row]));
  assert.deepEqual(decoded.summary, model.summary.map(row => [...row]));
  assert.deepEqual(fake.calls(), { listCalls: 1, acknowledgementCalls: 0 });
  const json = bytes.toString('utf8');
  assert.ok(json.includes('file:///etc/passwd'), 'potentially hostile text remains literal data');
  assert.ok(json.includes('HYPERLINK'), 'Excel-like formula remains text for the PDF handoff');
  assert.ok(!json.includes('SECRET_INTERNAL_ROW_ID'));
  assert.ok(!json.includes('sessionRef'));
  assert.deepEqual(Object.keys(decoded), [
    'schemaVersion', 'title', 'summary', 'details', 'acknowledgements', 'hasAcknowledgements',
  ]);
});

test('C2 contract: all blocked employee book reports reject before any repository access', async () => {
  const fake = syntheticRepository();
  const service = new ReportApiService(fake.repository);
  for (const reportType of ['monthly', 'incoming', 'outgoing', 'situation'] as const) {
    await assert.rejects(service.run({ reportType }, employee), ReportScopeNotReadyError);
    await assert.rejects(service.export({ reportType }, employee, 'pdf'), ReportScopeNotReadyError);
  }
  assert.deepEqual(fake.calls(), { listCalls: 0, acknowledgementCalls: 0 });
});

test('C2 contract: inconsistent report summaries cannot cross the encoder boundary', async () => {
  const fake = syntheticRepository();
  const service = new ReportApiService(fake.repository);
  const response = await service.run({ reportType: 'incoming' }, admin);
  assert.throws(
    () => buildReportExportModel('incoming', {
      ...response,
      summary: { ...response.summary, totalCount: response.rows.length + 1 },
    }),
    ReportExportUnavailableError,
  );
  assert.throws(() => encodeReportPdfInput({
    ...buildReportExportModel('incoming', response),
    sourcePath: '/private/host',
  } as never), ReportPdfInputError);
  assert.throws(() => decodeReportPdfInput(Buffer.from([0xff, 0xfe])), ReportPdfInputError);
});
