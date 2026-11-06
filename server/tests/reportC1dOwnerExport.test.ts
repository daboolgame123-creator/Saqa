/** C1d-S3: isolated synthetic owner report/XLSX contract; not HTTP release. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import {
  exportOwnAcknowledgementsExcel,
  runOwnAcknowledgementReport,
  OwnAcknowledgementExportError,
} from '../src/api/services/reportOwnAcknowledgements';
import type { ReportAccessContext } from '../src/repositories/contracts';

const own=reportAccessFor({role:'employee',employeeId:'my-employee-id'});
const base={reportType:'circularsAndAcknowledgements'} as const;

function row(id:string,title:string,employee='my-employee-id') {
  return {
    transactionId:id,title,linkedEmployeeId:employee,
    acknowledgedAt:new Date('2026-02-05T12:00:00.000Z'),
    timestampKey:'2026-02-05 12:00:00+00',inPeriod:true,
  };
}
function fixture(rows:Array<Record<string,unknown>>) {
  const calls: {sql:string;params:unknown[]}[]=[];
  return {
    calls,
    db: {async query(sql:string,params:unknown[]) {
      calls.push({sql,params});
      return {rows};
    }} as never,
  };
}

test('C1d-S3 returns only own count and rows; XLSX contains no coworker or account information',async()=>{
  const {db,calls}=fixture([row('my-book','=2+2')]);
  const result=await runOwnAcknowledgementReport(db,base,own,'Asia/Baghdad');
  assert.deepEqual(Object.keys(result).sort(),['entries','ownAcknowledgementCount']);
  assert.equal(result.ownAcknowledgementCount,1);
  assert.equal(result.entries[0].transactionId,'my-book');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportOwnAcknowledgementsExcel(db,base,own,'Asia/Baghdad'));
  assert.deepEqual(workbook.worksheets.map(x=>x.name),['الملخص','إقراراتي']);
  assert.equal(workbook.getWorksheet('الملخص')!.getCell('B2').value,'1');
  assert.equal(workbook.getWorksheet('إقراراتي')!.getCell('A2').value,"'=2+2");
  assert.equal(workbook.getWorksheet('إقراراتي')!.rowCount,2);
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.params[0]==='my-employee-id' && c.sql.includes('vl.employee_id = $1')));
  const serialized=JSON.stringify(workbook.worksheets.map(x=>x.getSheetValues()));
  for (const secret of ['coworker-name','session_ref','linkedEmployeeId','my-employee-id','globalCount','problemRecords']) {
    assert.ok(!serialized.includes(secret),secret);
  }
});

test('C1d-S3 rejects all forged owner contexts before any database query',async()=>{
  const {db,calls}=fixture([]);
  for (const access of [
    reportAccessFor({role:'admin',employeeId:null}),
    {...own,employeeId:'coworker-id'},
    {...own,personnelScope:{kind:'all'}},
    {...own,requestScope:{kind:'all'}},
    {...own,transactionScope:{...own.transactionScope,availableToEmployeeId:'coworker-id'}},
  ]) {
    await assert.rejects(
      exportOwnAcknowledgementsExcel(db,base,access as ReportAccessContext,'Asia/Baghdad'),
      ReportScopeNotReadyError,
    );
  }
  await assert.rejects(
    runOwnAcknowledgementReport(db,{...base,employee:'coworker-id'},own,'Asia/Baghdad'),
  );
  assert.equal(calls.length,0);
});

test('C1d-S3 excludes ambiguous own histories and never certifies disputed counts',async()=>{
  const {db}=fixture([
    row('confirmed','بند واضح'),
    row('conflict','سجل مشكوك'),
    {...row('conflict','سجل مشكوك'),timestampKey:'2026-02-06 12:00:00+00'},
    row('wrong-user','تعارض الهوية','foreign-employee'),
  ]);
  const report=await runOwnAcknowledgementReport(db,base,own,'Asia/Baghdad');
  assert.equal(report.ownAcknowledgementCount,1);
  assert.deepEqual(report.entries.map(e=>e.transactionId),['confirmed']);
});

test('C1d-S3 fail-closed if reader result has oversized title or duplicate book',async()=>{
  const tooLong=fixture([row('huge','س'.repeat(4001))]);
  await assert.rejects(runOwnAcknowledgementReport(tooLong.db,base,own,'Asia/Baghdad'),OwnAcknowledgementExportError);
  const tooMany=fixture(Array.from({length:2001},(_,i)=>row('book-'+i,'t')));
  await assert.rejects(exportOwnAcknowledgementsExcel(tooMany.db,base,own,'Asia/Baghdad'),OwnAcknowledgementExportError);
});
