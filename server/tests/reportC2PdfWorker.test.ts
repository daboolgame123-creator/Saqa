/** C2: subprocess transport tests; synthetic-only, no Docker or institutional data.
 * A valid PDF header/trailer below is a transport fixture, not a real document.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ReportExportModel } from '../src/api/services/reportExport';
import {
  runInternalPdfWorker, validatePdfWorkerOutput, ReportPdfWorkerError,
} from '../src/api/services/reportPdfWorker';

const model: ReportExportModel = {
  title: 'تقرير اصطناعي',
  summary: [['المؤشر', '1']],
  details: [['2026-11-06', 'وارد', '', '', 'مكتمل', '', 'كتاب', '']],
  acknowledgements: [],
  hasAcknowledgements: false,
};
const pdf = '%PDF-1.4\n' + 'x'.repeat(90) + '\n%%EOF\n';
function program(body:string) {
  return {
    executable: process.execPath,
    args: ['-e', 'process.stdin.resume();process.stdin.on("end",()=>{' + body + '});'],
    timeoutMs: 5000,
    maxPdfBytes: 4096,
  };
}

test('C2 worker: accepts capped PDF bytes from an isolated child process', async () => {
  const result = await runInternalPdfWorker(
    model,
    program('process.stdout.write(' + JSON.stringify(pdf) + ')'),
  );
  assert.equal(result.toString('utf8'),pdf);
});

test('C2 worker: rejects corrupted, empty, truncated and oversized output', async () => {
  const invalid = [
    'not-pdf-' + 'x'.repeat(100) + '%%EOF',
    '%PDF-1.4\n' + 'x'.repeat(100),
    '',
  ];
  for(const content of invalid) {
    await assert.rejects(runInternalPdfWorker(
      model, program('process.stdout.write(' + JSON.stringify(content) + ')'),
    ), ReportPdfWorkerError);
  }
  await assert.rejects(runInternalPdfWorker(model,{
    ...program('process.stdout.write(' + JSON.stringify(pdf) + ')'),
    maxPdfBytes: 64,
  }),ReportPdfWorkerError);
});

test('C2 worker: nonzero exit and child startup failures reject without partial PDF success', async () => {
  await assert.rejects(runInternalPdfWorker(
    model, program('process.stdout.write(' + JSON.stringify(pdf) + ');process.exitCode=7'),
  ), ReportPdfWorkerError);
  await assert.rejects(runInternalPdfWorker(model,{
    ...program(''), executable:join(tmpdir(),'an-unavailable-phase23-worker-binary'),
  }),ReportPdfWorkerError);
});

test('C2 worker: duration limit and excessive stderr stop execution', async () => {
  await assert.rejects(runInternalPdfWorker(model, {
    ...program('setTimeout(()=>process.stdout.write(' + JSON.stringify(pdf) + '),5000)'),
    timeoutMs: 80,
  }),ReportPdfWorkerError);
  await assert.rejects(runInternalPdfWorker(model,
    program('process.stderr.write("x".repeat(9000));process.stdout.write(' + JSON.stringify(pdf) + ')'),
  ),ReportPdfWorkerError);
});

test('C2 worker: strict config rejects unsafe budgets before spawning', async () => {
  await assert.rejects(runInternalPdfWorker(model, {
    ...program(''), timeoutMs: 0,
  }),ReportPdfWorkerError);
  await assert.rejects(runInternalPdfWorker(model, {
    ...program(''), maxPdfBytes: Number.POSITIVE_INFINITY,
  }),ReportPdfWorkerError);
  assert.throws(() => validatePdfWorkerOutput(Buffer.from('%PDF-1.4\n%%EOF'),64),
    ReportPdfWorkerError);
});

test('C2 worker: executable must be absolute, argv must be bounded and NUL-free', async () => {
  for(const config of [
    {...program(''), executable:'relative-worker-name'},
    {...program(''), executable:process.execPath + String.fromCharCode(0)},
    {...program(''), args:Array.from({length:65}, ()=>'unused')},
    {...program(''), args:['bad' + String.fromCharCode(0) + 'arg']},
  ]) {
    await assert.rejects(runInternalPdfWorker(model,config),ReportPdfWorkerError);
  }
});

test('C2 worker: report data crosses stdin only, with no inherited environment secret', async () => {
  const marker = 'SYNTHETIC_REPORT_SECRET_DO_NOT_LOG';
  const variable = 'ALSQAYA_C2_SYNTHETIC_PARENT_SECRET';
  const previous = process.env[variable];
  process.env[variable] = marker;
  try {
    const sensitiveModel: ReportExportModel = {
      ...model,
      title: marker,
      details: [['2026-11-06', 'وارد', '', '', 'مكتمل', '',
        '<img src="file:///etc/passwd">', marker]],
    };
    const childCode = [
      'const chunks=[]',
      'process.stdin.on("data",x=>chunks.push(x))',
      'process.stdin.on("end",()=>{',
      'const body=JSON.parse(Buffer.concat(chunks).toString("utf8"))',
      'if(body.schemaVersion!==1||body.title!==' + JSON.stringify(marker) + ')process.exit(3)',
      'if(body.details[0][6]!=="<img src=\\"file:///etc/passwd\\">")process.exit(4)',
      'if(process.argv.join(" ").includes(' + JSON.stringify(marker) + '))process.exit(5)',
      'if(process.env[' + JSON.stringify(variable) + ']!==undefined)process.exit(6)',
      'process.stdout.write(' + JSON.stringify(pdf) + ')',
      '})',
    ].join(';').replace(';})', '})');
    const result = await runInternalPdfWorker(sensitiveModel, {
      executable: process.execPath, args: ['-e', childCode],
      timeoutMs: 5000, maxPdfBytes: 4096,
    });
    assert.equal(result.toString('utf8'), pdf);
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});
