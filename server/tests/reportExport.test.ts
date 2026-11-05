/** Phase 23/P1h: in-process export tests using an authorized synthetic response. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import type { ReportResponse } from '../src/api/dto/report';
import { ReportApiService } from '../src/api/services/reportService';
import {
  buildReportExportModel, renderReportExport, ReportExportUnavailableError,
} from '../src/api/services/reportExport';
import type { ReportRepository, ReportFilter } from '../src/repositories/contracts';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';

const admin = reportAccessFor({role:'admin',employeeId:null});
const employee = reportAccessFor({role:'employee',employeeId:'test-employee'});
const rows=[
  {id:'c1',date:'2026-01-04T13:00:00Z',type:'وارد',status:'مكتمل',
    title:'=HYPERLINK("https://evil.example","test")',notes:'سجل رسمي'},
  {id:'c2',date:'2026-01-05T13:00:00Z',type:'داخلي',status:'قيد المراجعة',
    title:'كتاب داخلي',notes:'بيانات اختبار'},
];
const report:ReportResponse={
  rows,summary:{
    totalCount:2,generatedAt:'2026-11-05T19:00:00.000Z',
    period:'2026-01-01 إلى 2026-01-31',
    appliedFilters:{'نوع التقرير':'monthly','تاريخ الكتاب من':'2020-01-01'},
    bookStatistics:{
      totalBooks:2,incoming:1,outgoing:0,internal:1,
      statuses:{'قيد المراجعة':1,'مكتمل':1},
    },
  },
};

test('P1h: Excel summary and authorized details; hostile cell remains literal text',async()=>{
  const result=await renderReportExport('excel','monthly',report);
  assert.equal(result.mimeType,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(result.content.subarray(0,2).toString('utf8'),'PK');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(result.content as never);
  const summary=workbook.getWorksheet('الملخص');
  const details=workbook.getWorksheet('التفاصيل');
  assert.ok(summary&&details);
  assert.equal(details.rowCount,3,'header plus two visible rows');
  assert.equal(details.getCell('G2').value,"'=HYPERLINK(\"https://evil.example\",\"test\")");
  assert.equal(typeof details.getCell('G2').value,'string','not an Excel formula');
  assert.equal(details.getCell('E2').value,'مكتمل');
  assert.equal(details.getCell('G3').value,'كتاب داخلي');
  const pairs=new Map<string,string>();
  summary.eachRow((row,index)=>{
    if(index>1)pairs.set(String(row.getCell(1).value),String(row.getCell(2).value));
  });
  assert.equal(pairs.get('عدد السجلات'),'2');
  assert.equal(pairs.get('إجمالي الكتب'),'2');
  assert.equal(pairs.get('الوارد'),'1');
  assert.equal(pairs.get('الداخلي'),'1');
  assert.equal(pairs.get('مكتمل'),'1');
  assert.equal(pairs.get('فلتر: تاريخ الكتاب من'),'2020-01-01');
  assert.equal(workbook.getWorksheet('الإقرارات'),undefined);
});

test('P1h: ViewLog export preserves uncertain totals and omits internal identities',async()=>{
  const circular:ReportResponse={
    rows:[{id:'new',date:'2026-02-05',type:'تعميم',title:'تعميم مسجل حديثًا'}],
    summary:{totalCount:1,generatedAt:'2026-11-05T19:00:00.000Z'},
    circularAcknowledgements:{
      acknowledgements:[{
        transactionId:'old',employeeId:'secret-employee-id',
        employeeName:'سارة',acknowledgedAt:'2026-02-07T10:00:00Z',
      }],
      statistics:{
        circularCount:1,acknowledgementOperations:null,uniqueEmployees:null,
        verifiedAcknowledgementOperations:1,verifiedUniqueEmployees:1,
        problemRecords:2,
        problemReasons:{missingEmployeeId:1,identityMismatch:1,conflictingAcknowledgementTime:0},
        complete:false,
      },
    },
  };
  const model=buildReportExportModel('circularsAndAcknowledgements',circular);
  assert.equal(model.details.length,1);
  assert.equal(model.acknowledgements.length,1);
  assert.deepEqual(model.acknowledgements[0],[
    'سارة','2026-02-07T10:00:00Z','كتاب خارج فترة التسجيل',
  ]);
  const result=await renderReportExport('excel','circularsAndAcknowledgements',circular);
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(result.content as never);
  const summary=workbook.getWorksheet('الملخص');
  const ack=workbook.getWorksheet('الإقرارات');
  assert.ok(summary&&ack);
  assert.equal(ack.rowCount,2);
  assert.equal(ack.getCell('A2').value,'سارة');
  const pairs=new Map<string,string>();
  summary.eachRow((row,index)=>{
    if(index>1)pairs.set(String(row.getCell(1).value),String(row.getCell(2).value));
  });
  assert.equal(pairs.get('إجمالي عمليات الاطلاع المؤكدة'),'غير محسوم');
  assert.equal(pairs.get('عدد المنتسبين الفريدين'),'غير محسوم');
  assert.equal(pairs.get('السجلات الإشكالية'),'2');
  const serialized=JSON.stringify(workbook.model);
  assert.ok(!serialized.includes('secret-employee-id'));
  assert.ok(!serialized.includes('sessionRef'));
  assert.ok(!serialized.includes('userId'));
});

test('P1h: PDF requires explicit Arabic-capable font and generates a valid PDF',async()=>{
  await assert.rejects(renderReportExport('pdf','monthly',report),ReportExportUnavailableError);
  const font=await readFile('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  const rendered=await renderReportExport('pdf','monthly',report,{arabicPdfFont:font});
  assert.equal(rendered.content.subarray(0,5).toString(),'%PDF-');
  assert.equal(rendered.mimeType,'application/pdf');
  assert.ok(rendered.content.length>3000);
  assert.ok(rendered.content.toString('latin1').includes('/Type /Page'));
  assert.equal(buildReportExportModel('monthly',report).details[0][6],
    '=HYPERLINK("https://evil.example","test")','PDF text uses canonical unescaped value');
});

test('P1h: corrupted/excessive response rejected; never silently truncated',async()=>{
  await assert.rejects(renderReportExport('excel','monthly',{
    ...report,summary:{...report.summary,totalCount:3},
  }),ReportExportUnavailableError);
  await assert.rejects(renderReportExport('excel','monthly',{
    ...report,summary:{...report.summary,bookStatistics:{
      ...report.summary.bookStatistics!,incoming:99,
    }},
  }),ReportExportUnavailableError);
  await assert.rejects(renderReportExport('excel','monthly',{
    ...report,rows:Array.from({length:2001},(_,index)=>({
      id:String(index),date:'2026-01-01',title:'book',
    })),summary:{totalCount:2001,generatedAt:'2026-11-05T19:00:00Z'},
  }),ReportExportUnavailableError);
  await assert.rejects(renderReportExport('excel','monthly',{
    ...report,rows:[{id:'a',date:'2026-01-01',title:'X'.repeat(4001)}],
    summary:{totalCount:1,generatedAt:'2026-11-05T19:00:00Z'},
  }),ReportExportUnavailableError);
  await assert.rejects(renderReportExport('excel','researchers',report),ReportExportUnavailableError);
  await assert.rejects(renderReportExport('excel','monthly',{
    ...report,circularAcknowledgements:{
      acknowledgements:[],statistics:{
        circularCount:2,acknowledgementOperations:0,uniqueEmployees:0,
        verifiedAcknowledgementOperations:0,verifiedUniqueEmployees:0,
        problemRecords:0,problemReasons:{
          missingEmployeeId:0,identityMismatch:0,conflictingAcknowledgementTime:0,
        },complete:true,
      },
    },
  }),ReportExportUnavailableError);
});

test('P1h: export service reads once; employee and forged scope have zero DB reads',async()=>{
  let reads=0;
  const repository:ReportRepository={
    async list(){reads++;return rows;},
    async readCircularAcknowledgements(){throw Error('No ViewLog reads');},
  };
  const service=new ReportApiService(repository);
  const f:ReportFilter={reportType:'monthly'};
  const x=await service.export(f,admin,'excel');
  assert.equal(x.format,'excel');
  assert.equal(reads,1,'Export uses one authorized response');
  await assert.rejects(service.export(f,employee,'excel'),ReportScopeNotReadyError);
  await assert.rejects(service.export(f,{...admin,personnelScope:{kind:'owner',employeeId:'forged'}} as never,'excel'),
    /Privileged report access context is inconsistent/);
  assert.equal(reads,1,'Forbidden export fails before repository reads');
});
