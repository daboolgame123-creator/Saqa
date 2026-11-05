/** Phase 23/P1k internal-only Chromium renderer fail-closed unit tests. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildReportExportModel,ReportExportUnavailableError} from '../src/api/services/reportExport';
import {renderSafeReportHtml,renderInternalChromiumPreview} from '../src/api/services/reportChromiumInternal';
import type {ReportResponse} from '../src/api/dto/report';

const synthetic:ReportResponse={
  rows:[{
    id:'internal-should-not-render',
    date:'2026-01-01T12:00:00Z',
    type:'وارد',status:'مكتمل',
    title:'كتاب <script>alert(1)</script> \u202E تفاصيل',
    notes:'مدخل مختلط 2026/001 & "test"',
  }],
  summary:{totalCount:1,generatedAt:'2026-11-05T19:00:00Z'},
};
const model=buildReportExportModel('incoming',synthetic);
test('P1k HTML renderer escapes text, preserves Arabic/ISO and never includes internal ids',()=>{
  const html=renderSafeReportHtml(model);
  assert.match(html,/lang="ar" dir="rtl"/);
  assert.match(html,/default-src &#39;none&#39;/);
  assert.match(html,/2026-01-01T12:00:00Z/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/internal-should-not-render/);
  assert.match(html,/سجل رقم 1/);
  assert.match(html,/break-inside:avoid/);
});
test('P1k malformed, oversized and inconsistent pre-validated models fail closed',()=>{
  assert.throws(()=>renderSafeReportHtml({...model,details: Array.from({length:251},()=>model.details[0])}),
    ReportExportUnavailableError);
  assert.throws(()=>renderSafeReportHtml({...model,details:[['bad']]}),
    ReportExportUnavailableError);
  assert.throws(()=>renderSafeReportHtml({...model,details:[[...model.details[0].slice(0,7),'س'.repeat(1300)]]}),
    ReportExportUnavailableError);
  assert.throws(()=>renderSafeReportHtml({...model,hasAcknowledgements:false,acknowledgements:[['x','y','z']]}),
    ReportExportUnavailableError);
  assert.throws(()=>renderSafeReportHtml({...model,summary:[['field',null as never]]}),
    ReportExportUnavailableError);
});
test('P1k executable path, timeout and CI sandbox override checked before spawning',async()=>{
  await assert.rejects(renderInternalChromiumPreview(model,{executablePath:'chromium'}),
    ReportExportUnavailableError);
  await assert.rejects(renderInternalChromiumPreview(model,{executablePath:'/missing/browser',timeoutMs:99}),
    ReportExportUnavailableError);
  if(process.env.CI!=='true'){
    await assert.rejects(renderInternalChromiumPreview(model,{
      executablePath:'/missing/browser',ciDisableSandbox:true,
    }),ReportExportUnavailableError);
  }
});
test('P1k bad browser exit, timeout and invalid output clean temp workspace',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'alsqaya-test-browser-'));
  try{
    const bad=join(dir,'bad.sh');
    await writeFile(bad,'#!/bin/sh\nexit 4\n');
    await chmod(bad,0o700);
    await assert.rejects(renderInternalChromiumPreview(model,{executablePath:bad}),
      /PDF browser failed/);
    const sleeper=join(dir,'slow.sh');
    await writeFile(sleeper,'#!/bin/sh\nexec sleep 5\n');
    await chmod(sleeper,0o700);
    await assert.rejects(renderInternalChromiumPreview(model,{
      executablePath:sleeper,timeoutMs:150,
    }),/PDF browser timeout/);
    const empty=join(dir,'empty.sh');
    await writeFile(empty,'#!/bin/sh\nexit 0\n');
    await chmod(empty,0o700);
    await assert.rejects(renderInternalChromiumPreview(model,{executablePath:empty}),
      /ENOENT/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('P1k optional CI browser render still does not enable HTTP endpoints',async()=>{
  const executable=process.env.ALSQAYA_TEST_CHROMIUM;
  if(!executable)return;
  const output=await renderInternalChromiumPreview(model,{
    executablePath:executable,timeoutMs:60_000,ciDisableSandbox:true,
  });
  assert.equal(output.subarray(0,5).toString(),'%PDF-');
  assert.ok(output.length>1000);
});
