/** C2/C4 managed Docker adapter: no Docker daemon or institutional data in unit tests. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReportExportModel } from '../src/api/services/reportExport';
import { runManagedDockerPdfWorker } from '../src/api/services/reportDockerPdfWorker';
import { ReportPdfWorkerError } from '../src/api/services/reportPdfWorker';

const model: ReportExportModel = {
  title: 'اختبار آمن',
  summary: [['عدد السجلات','0']],
  details: [],
  acknowledgements: [],
  hasAcknowledgements: false,
};
const valid = {
  dockerExecutable:'/usr/bin/docker',
  imageReference:'sha256:'+'c'.repeat(64),
  timeoutMs:1000,
  maxPdfBytes:120000,
};
test('C2 managed Docker: mutable tags, relative CLI, malformed digests and budgets reject before spawn', async()=>{
  const candidates = [
    {...valid,imageReference:'repo/worker:latest'},
    {...valid,imageReference:'repo/worker:1.2.3'},
    {...valid,imageReference:'repo/worker@sha256:'+'0'.repeat(63)},
    {...valid,imageReference:'repo/worker@sha256:'+'Z'.repeat(64)},
    {...valid,imageReference:'sha256:'+'a'.repeat(63)},
    {...valid,imageReference:'../bad-image@sha256:'+'0'.repeat(64)},
    {...valid,imageReference:'foo/worker@sha256:'+'a'.repeat(64)+'\u0000'},
    {...valid,dockerExecutable:'docker'},
    {...valid,dockerExecutable:'/usr/bin/docker\u0000--bad'},
    {...valid,timeoutMs:0},
    {...valid,timeoutMs:60001},
    {...valid,maxPdfBytes:12_000_001},
  ];
  for(const c of candidates){
    await assert.rejects(runManagedDockerPdfWorker(model,c),ReportPdfWorkerError);
  }
});

test('C2 managed Docker: pre-aborted signal rejects before Docker is invoked',async()=>{
  const controller=new AbortController();
  controller.abort();
  await assert.rejects(runManagedDockerPdfWorker(model,valid,controller.signal),
    (error:unknown)=>error instanceof ReportPdfWorkerError &&
      error.message.includes('cancelled'));
});
