/** C7b candidate UI contract tests — server rendering only, NO browser network.
 * The real ReportsView and /api/reports remain unavailable to users.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiClient } from '../../src/api/apiClient';
import {
  candidateReportFilter, candidateReportTypesFor, previewCandidateReport,
} from '../../src/api/reportCandidate';
import { ReportsCandidateView } from '../../src/components/views/ReportsCandidateView';
import { ReportsView } from '../../src/components/views/ReportsView';

test('C7b employee report-type and filter allowlist never send privileged or stale inputs',()=>{
  assert.deepEqual(candidateReportTypesFor('employee'),[
    'incoming','leaves','timePermissions','requests','employees',
  ]);
  assert.ok(!candidateReportTypesFor('director').includes('researchers'));
  assert.ok(!candidateReportTypesFor('admin').includes('professors'));
  assert.throws(()=>candidateReportFilter({reportType:'monthly'},'employee'));
  const forged=candidateReportFilter({
    reportType:'incoming',dateFrom:' 2026-11-01 ',
    dateTo:'2026-11-07',documentDateFrom:'2022-01-01',
    section:'UNAPPROVED',employee:'other-user',type:'صادر',status:'مكتمل',
  },'employee');
  assert.deepEqual(forged,{
    reportType:'incoming',dateFrom:'2026-11-01',dateTo:'2026-11-07',
    documentDateFrom:'2022-01-01',status:'مكتمل',
  });
  assert.deepEqual(candidateReportFilter({
    reportType:'employees',section:'قسم اختبار',
    documentDateFrom:'2026-01-01',status:'active',
  },'admin'),{reportType:'employees',section:'قسم اختبار'});
  assert.deepEqual(candidateReportFilter({
    reportType:'monthly',type:'وارد',employee:'employee-a',
    documentDateTo:'2026-11-07',status:'مكتمل',
  },'director'),{
    reportType:'monthly',type:'وارد',employee:'employee-a',
    documentDateTo:'2026-11-07',status:'مكتمل',
  });
  assert.deepEqual(candidateReportFilter({
    reportType:'circularsAndAcknowledgements',
    employee:'employee-a',section:'UNSUPPORTED',
    status:'مكتمل',documentDateFrom:'2024-01-01',
  },'admin'),{reportType:'circularsAndAcknowledgements',status:'مكتمل'});
});

test('C7b candidate SSR exposes supported filters, no fake totals; live catalog stays unchanged',()=>{
  const employee=renderToStaticMarkup(React.createElement(ReportsCandidateView,{role:'employee',sessionKey:'synthetic-account-A'}));
  assert.ok(employee.includes('واجهة التقارير'));
  assert.ok(employee.includes('الكتب الواردة'));
  assert.ok(employee.includes('معاينة مع صلاحيات الخادم'));
  assert.ok(!employee.includes('التقرير الشهري'));
  assert.ok(!employee.includes('الإعمامات والاطلاع الرسمي'));
  assert.ok(!employee.includes('الباحثون'));
  assert.ok(!employee.includes('معرّف الرسمي للمنتسب'));
  assert.ok(!employee.includes('عدد السجلات:'));
  assert.ok(employee.includes('PDF غير معتمد على الخادم'));
  const director=renderToStaticMarkup(React.createElement(ReportsCandidateView,{role:'director',sessionKey:'synthetic-director-A'}));
  assert.ok(director.includes('التقرير الشهري'));
  assert.ok(director.includes('الإعمامات والاطلاع الرسمي'));
  assert.ok(director.includes('تاريخ الكتاب من'));
  assert.ok(!director.includes('الباحثون'));
  const live=renderToStaticMarkup(React.createElement(ReportsView));
  assert.ok(live.includes('غير متاحين'));
  assert.ok(!live.includes('معاينة مع صلاحيات الخادم'));
  assert.ok(!live.includes('تصدير Excel'));
});

test('C7b preview adapter does not fabricate a successful summary',async()=>{
  const filter={reportType:'incoming' as const};
  const calls:Array<{path:string;query:unknown}>=[];
  const mocked={
    get:async(path:string,query:unknown)=>{
      calls.push({path,query});
      return {rows:[{id:'a',date:'2026-01-01'}],summary:{totalCount:1,generatedAt:'2026-01-01'}};
    },
  } as unknown as ApiClient;
  const response=await previewCandidateReport(filter,mocked);
  assert.equal(response.summary.totalCount,1);
  assert.deepEqual(calls,[{path:'/reports',query:{reportType:'incoming'}}]);
  const broken={
    get:async()=>({rows:[{id:'a'}],summary:{totalCount:2}}),
  } as unknown as ApiClient;
  await assert.rejects(previewCandidateReport(filter,broken),
    /inconsistent/);
});
