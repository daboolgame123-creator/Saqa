/** C10 synthetic SSR security contract: no live report routes or real personnel. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReportResponse } from '../src/api/dto/report';
import { ReportsCircularAcknowledgements } from '../../src/components/views/ReportsCircularAcknowledgements';

const inPeriodBook='IN_PERIOD_C10_ID_NEVER_DISPLAY';
const outOfPeriodBook='OUT_OF_PERIOD_C10_ID_NEVER_DISPLAY';
const employeeKey='PRIVATE_EMPLOYEE_UUID_NEVER_DISPLAY';
const approvedName='C10_SYNTH_EMPLOYEE_NAME';
const complete: ReportResponse={
  rows:[{id:inPeriodBook,date:'2026-11-08T09:00:00.000Z',type:'تعميم',
    status:'مكتمل',title:'C10_SYNTH_CIRCULAR_TITLE'}],
  summary:{totalCount:1,generatedAt:'2026-11-08T10:00:00.000Z'},
  circularAcknowledgements:{
    acknowledgements:[
      {transactionId:inPeriodBook,employeeId:employeeKey,
        employeeName:approvedName,acknowledgedAt:'2026-11-08T11:00:00.000Z'},
      {transactionId:outOfPeriodBook,employeeId:employeeKey,
        employeeName:approvedName,acknowledgedAt:'2026-11-08T12:00:00.000Z'},
    ],
    statistics:{
      circularCount:1,acknowledgementOperations:2,uniqueEmployees:1,
      verifiedAcknowledgementOperations:2,verifiedUniqueEmployees:1,
      problemRecords:0,problemReasons:{
        missingEmployeeId:0,identityMismatch:0,conflictingAcknowledgementTime:0,
      },complete:true,
    },
  },
};
const render=(report:ReportResponse,role:'admin'|'director'|'employee')=>
  renderToStaticMarkup(React.createElement(ReportsCircularAcknowledgements,{report,role}));

test('C10 privileged ViewLog names, timestamps and out-of-period titles only; no raw identities',()=>{
  for(const role of ['admin','director'] as const){
    const html=render(complete,role);
    assert.ok(html.includes('تفاصيل الإقرارات الرسمية'));
    assert.ok(html.includes('C10_SYNTH_CIRCULAR_TITLE'));
    assert.ok(html.includes(approvedName));
    assert.ok(html.includes('2026-11-08T11:00:00.000Z'));
    assert.ok(html.includes('2026-11-08T12:00:00.000Z'));
    assert.ok(html.includes('كتاب خارج فترة التسجيل'));
    assert.ok(html.includes('إجمالي عمليات الاطلاع: 2'));
    assert.ok(html.includes('عدد المنتسبين الفريدين: 1'));
    for(const leaked of [inPeriodBook,outOfPeriodBook,employeeKey,'sessionRef']){
      assert.ok(!html.includes(leaked),'Raw sensitive ID must not appear in DOM: '+leaked);
    }
    assert.ok(!html.includes('إحصاءات الاطلاع الكاملة غير محسومة'));
  }
});

test('C10 historical anomalies never relabel verified subset as complete total',()=>{
  const affected:ReportResponse={
    ...complete,
    circularAcknowledgements:{
      ...complete.circularAcknowledgements!,
      statistics:{
        ...complete.circularAcknowledgements!.statistics,
        complete:false,acknowledgementOperations:null,uniqueEmployees:null,
        verifiedAcknowledgementOperations:2,verifiedUniqueEmployees:1,
        problemRecords:3,
        problemReasons:{missingEmployeeId:1,identityMismatch:1,conflictingAcknowledgementTime:2},
      },
    },
  };
  const html=render(affected,'director');
  assert.ok(html.includes('إجمالي عمليات الاطلاع: غير محسوم'));
  assert.ok(html.includes('عدد المنتسبين الفريدين: غير محسوم'));
  assert.ok(html.includes('الإقرارات المتحقق منها: 2'));
  assert.ok(html.includes('السجلات الإشكالية: 3'));
  assert.ok(html.includes('بلا هوية منتسب: 1'));
  assert.ok(html.includes('تعارض الهوية: 1'));
  assert.ok(html.includes('تعارض تاريخ الإقرار: 2'));
  assert.ok(html.includes('يمثل سجلات مؤكدة فقط'));
});

test('C10 employee or absent ViewLog never gets privileged detail DOM',()=>{
  assert.equal(render(complete,'employee'),'');
  assert.equal(render({...complete,circularAcknowledgements:undefined},'admin'),'');
});
