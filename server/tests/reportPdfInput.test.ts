/** P1k ALT-07: synthetic-only structured PDF input boundary tests. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportResponse } from '../src/api/dto/report';
import { buildReportExportModel } from '../src/api/services/reportExport';
import { decodeReportPdfInput, encodeReportPdfInput, ReportPdfInputError } from '../src/api/services/reportPdfInput';

const report: ReportResponse = {
  rows: [{
    id: 'internal-row-secret', date: '2026-11-06T09:00:00Z', type: 'وارد',
    employee: 'منتسب اصطناعي', title: '<img src="file:///etc/passwd">',
    notes: '=HYPERLINK("https://example.invalid","literal")',
  }],
  summary: { totalCount: 1, generatedAt: '2026-11-06T09:10:00Z' },
};

function sample() {
  return buildReportExportModel('incoming', report);
}
function serialized() {
  return JSON.parse(encodeReportPdfInput(sample()).toString('utf8')) as Record<string, unknown>;
}
function corrupt(change: (value: Record<string, unknown>) => void) {
  const value = serialized();
  change(value);
  return Buffer.from(JSON.stringify(value), 'utf8');
}

test('ALT-07: canonical scoped model creates a deterministic, data-only JSON payload', () => {
  const model = sample();
  const first = encodeReportPdfInput(model);
  assert.deepEqual(first, encodeReportPdfInput(model));
  const decoded = decodeReportPdfInput(first);
  assert.equal(decoded.schemaVersion, 1);
  assert.deepEqual(decoded.details, model.details);
  assert.deepEqual(decoded.summary, model.summary.map(row => [...row]));
  assert.equal(decoded.acknowledgements.length, 0);
  assert.equal(decoded.hasAcknowledgements, false);
  assert.ok(first.toString().includes('<img src='));
  assert.ok(first.toString().includes('file:///etc/passwd'), 'literal untrusted values are DATA');
  assert.ok(!first.toString().includes('internal-row-secret'), 'internal row IDs must never pass boundary');
  assert.deepEqual(Object.keys(decoded), [
    'schemaVersion','title','summary','details','acknowledgements','hasAcknowledgements',
  ]);
});

test('ALT-07: rejects unknown fields, identities, unrecognized schema and malformed bytes', () => {
  for (const invalid of [
    corrupt(value => { value.sessionToken = 'secret'; }),
    corrupt(value => { value.actorId = 'internal-secret'; }),
    corrupt(value => { value.schemaVersion = 2; }),
    corrupt(value => { delete value.details; }),
    corrupt(value => { value.hasAcknowledgements = 'false'; }),
    Buffer.from('{"schemaVersion":1', 'utf8'),
    Buffer.from([0xff, 0xfe, 0xfd]),
    Buffer.alloc(0),
    Buffer.alloc(512_001),
  ]) {
    assert.throws(() => decodeReportPdfInput(invalid), ReportPdfInputError);
  }
});

test('ALT-07: strict rows, text sizes, flags and Unicode are fail closed', () => {
  const bad = [
    corrupt(value => { value.details = [['partial']]; }),
    corrupt(value => { value.details = Array.from({length: 251}, () => Array(8).fill('')); }),
    corrupt(value => { value.details = [Array(8).fill('x'.repeat(151))]; }),
    corrupt(value => { value.summary = [ ['x'] ]; }),
    corrupt(value => { value.summary = Array.from({length: 101}, () => ['x','y']); }),
    corrupt(value => { value.title = 'a'.repeat(4001); }),
    corrupt(value => { value.title = '\ud800'; }),
    corrupt(value => { value.hasAcknowledgements = false; value.acknowledgements = [['x','y','z']]; }),
    corrupt(value => { value.details = [{ '0': 'not-an-array' }]; }),
  ];
  bad.forEach(data => assert.throws(() => decodeReportPdfInput(data), ReportPdfInputError));
});

test('ALT-07: input is deep-copied, does not inherit forged metadata, does not silently truncate', () => {
  const model = sample();
  const captured = encodeReportPdfInput(model);
  const before = decodeReportPdfInput(captured);
  (model.details as string[][])[0][6] = 'changed later';
  assert.deepEqual(decodeReportPdfInput(captured), before);
  assert.throws(() => encodeReportPdfInput({
    ...sample(), sessionToken:'unexpected',
  } as never), ReportPdfInputError);
  assert.throws(() => encodeReportPdfInput({
    ...sample(), details: Array.from({length: 251}, () => Array(8).fill('')),
  }), ReportPdfInputError);
});

test('ALT-07: only certified circular model may include acknowledgement rows', () => {
  const circular: ReportResponse = {
    rows: [{id:'circular', date:'2026-11-06', title:'تعميم اصطناعي'}],
    summary: { totalCount: 1, generatedAt:'2026-11-06T09:10:00Z' },
    circularAcknowledgements: {
      acknowledgements: [{
        transactionId:'circular', employeeId:'private-id',
        employeeName:'منتسب تجريبي', acknowledgedAt:'2026-11-06T09:20:00Z',
      }],
      statistics: {
        circularCount:1, acknowledgementOperations:1, uniqueEmployees:1,
        verifiedAcknowledgementOperations:1, verifiedUniqueEmployees:1,
        problemRecords:0, problemReasons:{
          missingEmployeeId:0, identityMismatch:0, conflictingAcknowledgementTime:0,
        }, complete:true,
      },
    },
  };
  const payload = encodeReportPdfInput(buildReportExportModel('circularsAndAcknowledgements', circular));
  const decoded = decodeReportPdfInput(payload);
  assert.equal(decoded.hasAcknowledgements, true);
  assert.equal(decoded.acknowledgements.length, 1);
  assert.ok(!payload.toString('utf8').includes('private-id'));
});
