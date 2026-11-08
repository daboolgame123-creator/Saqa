/**
 * C13: Chromium -> React candidate -> real session -> Express authorization ->
 * migrated disposable PostgreSQL -> exact scoped preview and XLSX download.
 * The ONLY candidate mount is a test-only loopback server behind a Vite proxy.
 * Actual application's /api/reports* route remains HTTP 503.
 *
 * CI: node --import tsx server/tests/browser/c13RealBrowserPgUat.mjs
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import ExcelJS from 'exceljs';
import {startApiSuite,stopApiSuite} from '../api/apiTestSuite.ts';
import {newAuthenticatedAccount} from '../api/apiTestData.ts';
import {useTestSession} from '../api/apiTestHelpers.ts';
import {createReportCandidateRouter} from '../../src/api/routes/reportCandidateRoutes.ts';
import {ReportApiService} from '../../src/api/services/reportService.ts';
import {PgReportRepository} from '../../src/repositories/reportRepository.ts';
import {useApiServices} from '../../src/api/serviceContext.ts';
import {useAuthService} from '../../src/auth/serviceContext.ts';
import {requireSession,requireChangedSecret} from '../../src/auth/sessionMiddleware.ts';
import {requireResourcePermission,attachAccessScope,attachRequestScope} from '../../src/authorization/index.ts';
import {createErrorHandler,notFoundHandler} from '../../src/middleware/index.ts';
import {waitForListening} from '../helpers.ts';
import {closeServer} from '../../src/server.ts';

const ARTIFACTS='artifacts/phase23-c13-real-pg-browser';
const SECRET='C13-SYNTHETIC-SECRET-ONLY';
const LABELS={
  public:'C13_PUBLIC_SYNTHETIC',
  a:'C13_PRIVATE_A_SYNTHETIC',
  b:'C13_PRIVATE_B_SYNTHETIC',
  admin:'C13_ADMIN_ONLY_SYNTHETIC',
};
let suite=null, detached=null, vite=null, browser=null;
const checks=[];
const browserErrors=[];
async function seedBook(pool,title,visibility){
  const result=await pool.query(
    `INSERT INTO transactions
      (number,sequence,document_date,month,direction,category,sub_type,
       entity,subject,visibility,status,is_daily_situation,created_at)
      VALUES
      ('C13-100','C13-001','2026-11-08','2026-11','وارد','إدارية','كتاب',
       'C13_SYNTHETIC_ENTITY',$1,$2::jsonb,'مكتمل',false,
       '2026-11-08T09:30:00Z'::timestamptz)
      RETURNING id`,[title,JSON.stringify(visibility)]);
  return result.rows[0].id;
}
async function preview(page){
  await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
  const region=page.getByRole('region',{name:'نتائج التقرير المصرح بها'});
  await region.waitFor({state:'visible'});
  return region.innerText();
}
async function snapshot(page,name){
  await page.screenshot({path:ARTIFACTS+'/'+name+'.png',fullPage:true,animations:'disabled'});
}
async function run(){
  assert.equal(process.env.CI,'true','C13 test-only fixture requires CI=true');
  await mkdir(ARTIFACTS,{recursive:true});
  suite=await startApiSuite();
  const ctx=suite.context;
  const ids={};
  let employeeAToken='';
  for(const [key,role,badge,phone] of [
    ['admin','admin','C13-ADMIN','07700001300'],
    ['employeeA','employee','C13-EMP-A','07700001301'],
    ['employeeB','employee','C13-EMP-B','07700001302'],
  ]){
    const user=await newAuthenticatedAccount(ctx,{
      role,badgeNumber:badge,phone,name:'C13_SYNTH_'+key,secret:SECRET,
    });
    ids[key]=user.employee.id;
    if(key==='employeeA')employeeAToken=user.sessionToken;
  }
  useTestSession(null);
  const publicBook=await seedBook(ctx.pool,LABELS.public,'PublicToEmployees');
  const aBook=await seedBook(ctx.pool,LABELS.a,'SpecificEmployees');
  const bBook=await seedBook(ctx.pool,LABELS.b,'SpecificEmployees');
  await seedBook(ctx.pool,LABELS.admin,'Administrative');
  await ctx.pool.query(
    'INSERT INTO transaction_availability (transaction_id,employee_id,revoked_at) VALUES ($1,$2,NULL),($3,$4,NULL)',
    [aBook,ids.employeeA,bBook,ids.employeeB],
  );
  assert.ok(publicBook);
  ctx.services.report=new ReportApiService(new PgReportRepository(ctx.pool,'Asia/Baghdad'));

  // Assert real, production-mounted report paths remain blocked before SQL.
  const official=await fetch(ctx.baseUrl+'/api/reports?reportType=incoming',{
    headers:{authorization:'Bearer '+employeeAToken},
  });
  assert.equal(official.status,503);
  assert.equal((await official.json()).error.code,'REPORTS_UNAVAILABLE');
  checks.push('official production report path is still HTTP 503');

  // Detached endpoint uses actual production middleware; never added to createApp.
  const app=express();
  app.use(useApiServices(ctx.services));
  app.use(useAuthService(ctx.authService));
  app.use(requireSession());
  app.use(requireChangedSecret());
  app.use(requireResourcePermission());
  app.use(attachAccessScope());
  app.use(attachRequestScope());
  app.use('/__c13_candidate',createReportCandidateRouter());
  app.use(notFoundHandler);
  app.use(createErrorHandler({exposeDetails:true}));
  const server=app.listen(0,'127.0.0.1');
  const port=await waitForListening(server);
  detached={baseUrl:'http://127.0.0.1:'+port,
    close:async()=>{server.closeAllConnections();await closeServer(server);}};
  // The proxy is CI-only and loopback. /api/reports goes to detached candidate;
  // login and /auth/me go to the genuine application under test.
  vite=await createServer({
    configFile:false,root:process.cwd(),plugins:[react()],
    logLevel:'error',
    server:{host:'127.0.0.1',port:0,strictPort:false,proxy:{
      '/api/reports':{
        target:detached.baseUrl,changeOrigin:false,
        rewrite:path=>path.replace(/^\/api\/reports/,'/__c13_candidate'),
      },
      '/api':{target:ctx.baseUrl,changeOrigin:false},
    }},
  });
  await vite.listen();
  const address=vite.httpServer?.address();
  assert.ok(address && typeof address==='object' && address.port>0);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({
    viewport:{width:1360,height:900},locale:'ar-IQ',
    timezoneId:'Asia/Baghdad',acceptDownloads:true,
  });
  const page=await context.newPage();
  page.setDefaultTimeout(22000);
  page.on('pageerror',error=>browserErrors.push(error.message));
  await page.goto('http://127.0.0.1:'+address.port+'/server/tests/browser/c13/index.html');
  await page.getByTestId('c13-no-session').waitFor();
  await page.locator('#c13-employee-a').click();
  await page.getByTestId('c13-identity').getByText('C13-EMP-A').waitFor();
  let text=await preview(page);
  assert.ok(text.includes(LABELS.public)&&text.includes(LABELS.a));
  assert.ok(!text.includes(LABELS.b)&&!text.includes(LABELS.admin));
  assert.ok(text.includes('عدد السجلات: 2'));
  await snapshot(page,'01-employee-a');
  checks.push('employee A real login and scoped SQL preview');

  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'تصدير Excel'}).click(),
  ]);
  const file=await download.path();
  assert.ok(file,'real browser XLSX download must exist');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet=workbook.getWorksheet('التفاصيل');
  assert.ok(worksheet);
  assert.deepEqual([worksheet.getCell('G2').text,worksheet.getCell('G3').text].sort(),
    [LABELS.public,LABELS.a].sort());
  assert.equal(worksheet.rowCount,3);
  const workbookText=JSON.stringify(workbook.model);
  assert.ok(!workbookText.includes(LABELS.b));
  assert.ok(!workbookText.includes(LABELS.admin));
  checks.push('real browser XLSX download matches owner scope');

  await page.locator('#c13-employee-b').click();
  await page.getByTestId('c13-identity').getByText('C13-EMP-B').waitFor();
  assert.equal(await page.getByRole('region',{name:'نتائج التقرير المصرح بها'}).count(),0);
  text=await preview(page);
  assert.ok(text.includes(LABELS.public)&&text.includes(LABELS.b));
  assert.ok(!text.includes(LABELS.a)&&!text.includes(LABELS.admin));
  await snapshot(page,'02-employee-b');
  checks.push('same-role account switch clears previous report, employee B isolated');

  await page.locator('#c13-admin').click();
  await page.getByTestId('c13-identity').getByText('C13-ADMIN').waitFor();
  await page.getByRole('combobox',{name:'نوع التقرير'}).selectOption('incoming');
  text=await preview(page);
  for(const label of Object.values(LABELS))assert.ok(text.includes(label),label);
  assert.ok(text.includes('عدد السجلات: 4'));
  const pdf=page.getByRole('button',{name:'تصدير PDF'});
  assert.equal(await pdf.isDisabled(),true,'unapproved production PDF cannot be exported');
  await snapshot(page,'03-admin');
  checks.push('admin role has permitted rows, PDF is disabled without host approval');

  await page.locator('#c13-logout').click();
  await page.getByTestId('c13-no-session').waitFor();
  assert.equal(await page.getByRole('region',{name:'نتائج التقرير المصرح بها'}).count(),0);
  assert.deepEqual(browserErrors,[]);
  checks.push('logout clears visible data and no browser runtime errors');
  await context.close();
  await writeFile(ARTIFACTS+'/summary.json',JSON.stringify({
    status:'PASS',syntheticOnly:true,actualMigratedPostgresql:true,
    actualBrowser:'Chromium',httpIdentity:'real_session_login_and_me',
    officialReports:'HTTP_503_UNCHANGED',candidateMountedInProduction:false,
    browserChecks:checks,
  },null,2));
  process.stdout.write('C13_REAL_BROWSER_PG_ACCEPTANCE_PASS: '+checks.length+' checks\n');
}
try{
  await run();
}catch(error){
  process.stderr.write('C13_REAL_BROWSER_PG_ACCEPTANCE_FAILED: '+
    (error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
}finally{
  try{await browser?.close();}catch{}
  try{await vite?.close();}catch{}
  try{await detached?.close();}catch{}
  try{if(suite)await stopApiSuite(suite);}catch(error){
    process.stderr.write('C13_CLEANUP_ERROR: '+String(error)+'\n');
    process.exitCode=1;
  }
  useTestSession(null);
}
