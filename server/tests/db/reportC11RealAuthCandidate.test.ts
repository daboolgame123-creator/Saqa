/** C11 — detached candidate report transport with REAL authenticated sessions and
 * migrated disposable PostgreSQL. This test-only router is never mounted by
 * the actual application; /api/reports still returns hard HTTP 503.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import ExcelJS from 'exceljs';
import type { Pool } from 'pg';
import { startTestDatabase, stopTestDatabase } from './testDb';
import {
  startApiTestContext, useTestSession, type ApiTestContext,
} from '../api/apiTestHelpers';
import { newAuthenticatedAccount } from '../api/apiTestData';
import { createReportCandidateRouter } from '../../src/api/routes/reportCandidateRoutes';
import { ReportApiService } from '../../src/api/services/reportService';
import { PgReportRepository } from '../../src/repositories/reportRepository';
import { useApiServices } from '../../src/api/serviceContext';
import { useAuthService } from '../../src/auth/serviceContext';
import { requireSession, requireChangedSecret } from '../../src/auth/sessionMiddleware';
import {
  requireResourcePermission, attachAccessScope, attachRequestScope,
} from '../../src/authorization';
import { createErrorHandler, notFoundHandler } from '../../src/middleware';
import { listenApp, type RunningApp } from '../helpers';

const S={public:'C11_PUBLIC_SYNTH',ownA:'C11_OWN_A_SYNTH',
  ownB:'C11_OWN_B_SYNTH',admin:'C11_ADMIN_ONLY_SYNTH'};
type Preview={
  rows:Array<{id:string;title:string;type:string;status:string}>;
  summary:{totalCount:number};
  error?:{code:string};
};

describe('C11 detached candidate: actual session → RBAC → SQL scope → preview/XLSX',()=>{
  let pool:Pool;
  let main:ApiTestContext;
  let detached:RunningApp;
  let tokens:{admin:string;director:string;employeeA:string;employeeB:string};
  let aId:string,bId:string;
  let reportReads=0;

  before(async()=>{
    ({pool}=await startTestDatabase());
    main=await startApiTestContext(pool);
    const accounts:Record<string,{token:string;employeeId:string}>={};
    for(const [key,role,badge,phone] of [
      ['admin','admin','C11-A','07700001001'],
      ['director','director','C11-D','07700001002'],
      ['employeeA','employee','C11-E1','07700001003'],
      ['employeeB','employee','C11-E2','07700001004'],
    ] as const){
      const registered=await newAuthenticatedAccount(main,{
        role,badgeNumber:badge,phone,name:'C11_SYNTH_'+key,
      });
      accounts[key]={token:registered.sessionToken,employeeId:registered.employee.id};
    }
    tokens={
      admin:accounts.admin.token,director:accounts.director.token,
      employeeA:accounts.employeeA.token,employeeB:accounts.employeeB.token,
    };
    aId=accounts.employeeA.employeeId;
    bId=accounts.employeeB.employeeId;
    useTestSession(null);
    async function addBook(title:string,scope:string){
      const record=await pool.query<{id:string}>(`
        INSERT INTO transactions (
          number,sequence,document_date,month,direction,category,sub_type,
          entity,subject,visibility,status,is_daily_situation,created_at,notes
        ) VALUES (
          '١٠٠','١','2026-11-08'::date,'2026-11','وارد','إدارية','كتاب',
          'C11_SYNTH_ENTITY',$1,$2::jsonb,'مكتمل',false,
          '2026-11-08T09:30:00Z'::timestamptz,'C11_NOTES'
        ) RETURNING id
      `,[title,JSON.stringify(scope)]);
      return record.rows[0].id;
    }
    await addBook(S.public,'PublicToEmployees');
    const grantedA=await addBook(S.ownA,'SpecificEmployees');
    const grantedB=await addBook(S.ownB,'SpecificEmployees');
    await addBook(S.admin,'Administrative');
    await pool.query(`
      INSERT INTO transaction_availability
        (transaction_id,employee_id,revoked_at)
      VALUES ($1,$2,NULL),($3,$4,NULL)
    `,[grantedA,aId,grantedB,bId]);

    // Use real migrated repository with an explicit test institution zone.
    const original=new PgReportRepository(pool,'Asia/Baghdad');
    const repo={
      async list(...args: Parameters<PgReportRepository['list']>){
        reportReads++;
        return original.list(...args);
      },
      async readCircularAcknowledgements(...args: Parameters<PgReportRepository['readCircularAcknowledgements']>){
        reportReads++;
        return original.readCircularAcknowledgements(...args);
      },
    };
    main.services.report=new ReportApiService(repo);

    // THIS EXPRESS APP EXISTS ONLY IN THIS TEST. The real main API below
    // retains the unconditional 503 and does NOT mount this URL.
    const app=express();
    app.use(useApiServices(main.services));
    app.use(useAuthService(main.authService));
    app.use(requireSession());
    app.use(requireChangedSecret());
    app.use(requireResourcePermission());
    app.use(attachAccessScope());
    app.use(attachRequestScope());
    app.use('/__c11_candidate',createReportCandidateRouter());
    app.use(notFoundHandler);
    app.use(createErrorHandler({exposeDetails:true}));
    detached=await listenApp(app);
  });
  after(async()=>{
    try{
      if(detached)await detached.shutdown();
      if(main?.running)await main.running.shutdown();
    }finally{
      useTestSession(null);
      await stopTestDatabase();
    }
  });

  const hit=(base:string,path:string,token?:string)=>fetch(base+path,{
    headers:token?{authorization:'Bearer '+token,connection:'close'}:{connection:'close'},
  });
  const request=(path:string,token?:string)=>hit(detached.baseUrl,'/__c11_candidate'+path,token);
  const names=(body:Preview)=>body.rows.map(row=>row.title).sort();

  it('production /api/reports path stays 503 before SQL for every real role',async()=>{
    const before=reportReads;
    for(const token of Object.values(tokens)){
      const response=await hit(main.baseUrl,'/api/reports?reportType=incoming',token);
      assert.equal(response.status,503);
      const body=await response.json() as {error:{code:string}};
      assert.equal(body.error.code,'REPORTS_UNAVAILABLE');
      assert.equal(response.headers.get('content-type')?.includes('application/json'),true);
    }
    assert.equal(reportReads,before,'Production report guard MUST perform no SQL report read');
  });

  it('real employee tokens isolate own grants and forbid same-role cross-user data',async()=>{
    const expected=[
      [tokens.employeeA,[S.ownA,S.public].sort()],
      [tokens.employeeB,[S.ownB,S.public].sort()],
      [tokens.admin,Object.values(S).sort()],
      [tokens.director,Object.values(S).sort()],
    ] as const;
    for(const [token,allowed] of expected){
      const response=await request('?reportType=incoming',token);
      assert.equal(response.status,200,'Authenticated candidate preview must complete');
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      const body=await response.json() as Preview;
      assert.deepEqual(names(body),allowed);
      assert.equal(body.summary.totalCount,allowed.length);
    }
    for(const token of [tokens.employeeA,tokens.employeeB]){
      const denied=await request('?reportType=monthly',token);
      assert.notEqual(denied.status,200,'Employee cannot invoke privileged monthly');
      const forged=await request('?reportType=incoming&role=admin',token);
      assert.equal(forged.status,400,'Role must never come from query parameters');
    }
    const noAuth=await request('?reportType=incoming');
    const garbage=await request('?reportType=incoming','not-a-session');
    assert.equal(noAuth.status,401);
    assert.equal(garbage.status,401);
  });

  it('employee A XLSX is exactly scoped to A; fake employee filter cannot grant B',async()=>{
    const file=await request('/export?reportType=incoming&format=excel',tokens.employeeA);
    assert.equal(file.status,200);
    assert.equal(file.headers.get('cache-control'),'no-store');
    assert.equal(file.headers.get('content-type')?.split(';')[0],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const content=Buffer.from(await file.arrayBuffer());
    assert.equal(content.subarray(0,2).toString('ascii'),'PK');
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(content as never);
    const details=workbook.getWorksheet('التفاصيل');
    assert.ok(details);
    assert.equal(details.rowCount,3);
    assert.deepEqual([details.getCell('G2').text,details.getCell('G3').text].sort(),
      [S.ownA,S.public].sort());
    assert.equal(workbook.getWorksheet('الملخص')?.getCell('B3').text,'2');
    const xlsxText=JSON.stringify(workbook.model);
    assert.ok(!xlsxText.includes(S.ownB));
    assert.ok(!xlsxText.includes(S.admin));
    assert.ok(!xlsxText.includes(bId));
    const forged=await request(
      '/export?reportType=incoming&format=excel&employee='+encodeURIComponent(bId),
      tokens.employeeA);
    assert.equal(forged.status,200);
    const narrowed=new ExcelJS.Workbook();
    await narrowed.xlsx.load(Buffer.from(await forged.arrayBuffer()) as never);
    assert.equal(narrowed.getWorksheet('التفاصيل')?.rowCount,1);
    assert.equal(narrowed.getWorksheet('الملخص')?.getCell('B3').text,'0');
  });

  it('real server applies date, status, file-format, and PDF launch guards',async()=>{
    for(const query of [
      '?reportType=incoming&dateFrom=2026-11-09',
      '?reportType=incoming&documentDateFrom=2026-11-09',
      '?reportType=incoming&status=قيد%20المراجعة',
    ]){
      const response=await request(query,tokens.employeeA);
      assert.equal(response.status,200);
      assert.equal((await response.json() as Preview).summary.totalCount,0);
    }
    const before=reportReads;
    for(const query of [
      '/export?reportType=incoming&format=html',
      '/export?reportType=incoming&format=excel&role=director',
      '?reportType=incoming&source=forbidden',
      '?reportType=researchers',
    ]){
      const response=await request(query,tokens.admin);
      assert.notEqual(response.status,200);
    }
    const pdf=await request('/export?reportType=incoming&format=pdf',tokens.admin);
    assert.equal(pdf.status,503);
    assert.equal((await pdf.json() as {error:{code:string}}).error.code,'REPORT_PDF_NOT_APPROVED');
    assert.equal(reportReads,before,'Unsupported input and PDF without host config must do zero report reads');
  });

  it('logout revokes A token but does not revoke same-role B token',async()=>{
    const response=await fetch(main.baseUrl+'/api/auth/logout',{
      method:'POST',headers:{authorization:'Bearer '+tokens.employeeA,connection:'close'},
    });
    assert.equal(response.status,204);
    assert.equal((await request('?reportType=incoming',tokens.employeeA)).status,401);
    const other=await request('?reportType=incoming',tokens.employeeB);
    assert.equal(other.status,200);
    assert.deepEqual(names(await other.json() as Preview),[S.ownB,S.public].sort());
  });
});
