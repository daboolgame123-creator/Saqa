/** C7a candidate transport tests: synthetic, loopback-only, NO real DB or Docker.
 * The fake authenticated context below is test-only. Production is still
 * protected by the real global auth middleware AND the unconditional 503.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import ExcelJS from 'exceljs';
import { createReportRouter } from '../src/api/routes/reportRoutes';
import {
  createReportCandidateRouter, reportExportQuery,
} from '../src/api/routes/reportCandidateRoutes';
import { ReportApiService } from '../src/api/services/reportService';
import type { ReportRepository, ReportRecord, ReportAccessContext } from '../src/repositories/contracts';
import { RoleDeniedError } from '../src/authorization/authorizationErrors';
import { ValidationError } from '../src/errors';

const publicBook: ReportRecord = {
  id: 'synthetic-public-uuid', date: '2026-11-07', type: 'وارد',
  status: 'مكتمل', title: 'SYNTH_PUBLIC_BOOK',
};
const privateBook: ReportRecord = {
  id: 'synthetic-private-uuid', date: '2026-11-07', type: 'وارد',
  status: 'مكتمل', title: 'SYNTH_PRIVATE_BOOK',
};

test('C7a export validator keeps format out of SQL filters and rejects unknown inputs', () => {
  const good = reportExportQuery({
    reportType: 'incoming', format: 'excel',
    dateFrom: '2026-01-01', dateTo: '2026-11-07',
  });
  assert.deepEqual(good, {
    kind: 'valid', value: {
      reportType: 'incoming', format: 'excel',
      dateFrom: '2026-01-01', dateTo: '2026-11-07',
    },
  });
  for(const input of [
    {}, {reportType:'incoming'}, {reportType:'incoming',format:'html'},
    {reportType:'incoming',format:['excel','pdf']},
    {reportType:'incoming',format:'excel',role:'admin'},
    {reportType:'incoming',format:'excel',source:'forbidden'},
    {reportType:'incoming',format:'excel',dateFrom:'2026-12-31',dateTo:'2026-01-01'},
    {reportType:'outgoing',format:'excel',type:'وارد'},
    {reportType:'researchers',format:'pdf',documentDateFrom:'2026-01-01'},
    [],
  ]) assert.equal(reportExportQuery(input).kind,'invalid',JSON.stringify(input));
});

test('C7a real loopback HTTP: candidate XLSX scope/filters, PDF closed and production 503', async () => {
  let reads = 0;
  const accesses: ReportAccessContext[] = [];
  const filters: Array<{reportType:string;employee?:string}> = [];
  const repo: ReportRepository = {
    async list(reportType, filter, access) {
      reads++;
      accesses.push(access);
      filters.push(filter);
      if (reportType !== 'incoming') return [];
      if (filter.employee === 'someone-else') return [];
      return access.role === 'employee' ? [publicBook] : [publicBook,privateBook];
    },
    async readCircularAcknowledgements() {
      throw new Error('This candidate test must never query ViewLog');
    },
  };
  const service = new ReportApiService(repo);
  const app = express();

  // TEST-ONLY identity adapter, not production code. The actual API router
  // installs requireSession/requireChangedSecret/requireResourcePermission.
  const testIdentity: RequestHandler = (req,res,next) => {
    const role = String(req.headers['x-test-role'] || 'employee');
    (req as unknown as { auth: unknown }).auth = {
      role, employeeId: role === 'employee' ? 'employee-a' : null,
    };
    res.locals.apiServices = { report: service };
    next();
  };
  app.use(testIdentity);
  app.use('/candidate',createReportCandidateRouter());
  app.use('/reports',createReportRouter());
  const testErrors: ErrorRequestHandler = (error,_req,res,_next) => {
    res.status(error instanceof ValidationError ? 400 :
      error instanceof RoleDeniedError ? 403 : 500)
      .json({error:{code:'C7_TEST_REJECTION'}});
  };
  app.use(testErrors);
  const server: Server = app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{
    if (server.listening) resolve();
    else { server.once('listening',resolve); server.once('error',reject); }
  });
  const port=(server.address() as AddressInfo).port;
  const url=(p:string)=>'http://127.0.0.1:'+port+p;
  const hit=(p:string,role='employee')=>fetch(url(p),{
    headers:{'x-test-role':role},
  });
  try {
    // Public router gates ALL paths before even validating, invoking service
    // or spawning any future export worker.
    for(const path of [
      '/reports?reportType=incoming',
      '/reports/export?reportType=incoming&format=excel',
      '/reports/export?reportType=incoming&format=pdf',
      '/reports/export?reportType=monthly&format=bad',
    ]) {
      const blocked=await hit(path,'admin');
      assert.equal(blocked.status,503);
      assert.equal((await blocked.json()).error.code,'REPORTS_UNAVAILABLE');
    }
    assert.equal(reads,0,'Production 503 gate must perform zero report reads');

    const preview=await hit('/candidate?reportType=incoming');
    assert.equal(preview.status,200);
    const response=await preview.json();
    assert.equal(response.summary.totalCount,1);
    assert.deepEqual(response.rows.map((r:ReportRecord)=>r.title),['SYNTH_PUBLIC_BOOK']);
    assert.equal(accesses.at(-1)?.role,'employee');
    assert.equal(accesses.at(-1)?.employeeId,'employee-a');
    assert.deepEqual(accesses.at(-1)?.personnelScope,{kind:'owner',employeeId:'employee-a'});

    const full=await hit('/candidate?reportType=incoming','director');
    assert.equal(full.status,200);
    assert.equal((await full.json()).summary.totalCount,2);
    assert.equal(accesses.at(-1)?.role,'director');

    const out=await hit('/candidate/export?reportType=incoming&format=excel');
    assert.equal(out.status,200);
    assert.equal(out.headers.get('cache-control'),'no-store');
    assert.equal(out.headers.get('x-content-type-options'),'nosniff');
    assert.equal(out.headers.get('content-type')?.split(';')[0],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(out.headers.get('content-disposition'),
      'attachment; filename="alsqaya-incoming.xlsx"');
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await out.arrayBuffer()) as never);
    const xlsx=workbook.getWorksheet('التفاصيل');
    assert.ok(xlsx);
    assert.equal(xlsx.rowCount,2);
    assert.equal(xlsx.getCell('G2').text,'SYNTH_PUBLIC_BOOK');
    assert.ok(!JSON.stringify(workbook.model).includes('SYNTH_PRIVATE_BOOK'));
    assert.ok(!JSON.stringify(workbook.model).includes(publicBook.id));
    assert.equal(workbook.getWorksheet('الملخص')?.getCell('B2').text,'1');

    const narrower=await hit('/candidate/export?reportType=incoming&format=excel&employee=someone-else');
    assert.equal(narrower.status,200);
    const narrowExcel=new ExcelJS.Workbook();
    await narrowExcel.xlsx.load(Buffer.from(await narrower.arrayBuffer()) as never);
    assert.equal(narrowExcel.getWorksheet('التفاصيل')?.rowCount,1);
    assert.equal(filters.at(-1)?.employee,'someone-else');
    assert.equal(accesses.at(-1)?.employeeId,'employee-a');

    const beforeInvalid=reads;
    for(const path of [
      '/candidate/export?reportType=incoming&format=html',
      '/candidate/export?reportType=incoming&format=excel&role=admin',
      '/candidate/export?reportType=incoming&format=excel&source=bad',
      '/candidate/export?reportType=incoming&format=excel&dateFrom=2026-12-31&dateTo=2026-01-01',
    ]) {
      const bad=await hit(path);
      assert.equal(bad.status,400);
    }
    assert.equal(reads,beforeInvalid,'Unvalidated filters must not query SQL');

    const pdf=await hit('/candidate/export?reportType=incoming&format=pdf','admin');
    assert.equal(pdf.status,503,'PDF must not fallback to unapproved PDFKit');
    assert.equal((await pdf.json()).error.code,'REPORT_PDF_NOT_APPROVED');
    assert.equal(reads,beforeInvalid,'Unapproved PDF must reject before SQL');

    const denied=await hit('/candidate?reportType=incoming','archivist');
    assert.notEqual(denied.status,200);
    assert.equal(reads,beforeInvalid,'Unknown roles must fail before SQL');
  } finally {
    await new Promise<void>((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
