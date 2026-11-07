/**
 * C7c synthetic-only REAL Chromium acceptance for the unmounted React UI.
 * NEVER exercises a public report endpoint: Playwright intercepts every
 * /api/reports request in a test-only Vite fixture; the actual production
 * 503 and PostgreSQL permission checks are tested in the existing suite.
 * CI: node --import tsx server/tests/browser/c7cCandidateBrowserUat.mjs
 */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import ExcelJS from 'exceljs';
import {reportQuery} from '../../src/api/validation/reportValidators.ts';
import {reportExportQuery} from '../../src/api/routes/reportCandidateRoutes.ts';

const DIR='artifacts/phase23-c7c-browser-uat';
const FIXTURE='/server/tests/browser/c7c/index.html';
const ALLOWED=new Set(['employee-a','employee-b','admin','director']);
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PUBLIC='C7C_PUBLIC_SYNTHETIC';
const A='C7C_OWN_A_SYNTHETIC';
const B='C7C_OWN_B_SYNTHETIC';
const PRIVATE='C7C_ADMIN_SYNTHETIC';
const results=[];
const requests=[];
const browserErrors=[];
let vite=null;
let browser=null;
let stopped=false;

function record(title,status='مكتمل'){
  return {id:'synthetic-id-'+title,date:'2026-11-07',type:'وارد',status,title};
}
const books=[
  {...record(PUBLIC),visibility:'PublicToEmployees'},
  {...record(A),owner:'employee-a',visibility:'SpecificEmployees'},
  {...record(B),owner:'employee-b',visibility:'SpecificEmployees'},
  {...record(PRIVATE,'قيد المراجعة'),visibility:'Administrative'},
];
function scopedRows(who,filter){
  const type=filter.reportType;
  if(type==='employees'){
    const staff=[
      {id:'synthetic-id-a',date:'2026-11-07',type:'منتسب',employee:'C7C_EMPLOYEE_A',section:'قسم اختبار',status:'نشط',owner:'employee-a'},
      {id:'synthetic-id-b',date:'2026-11-07',type:'منتسب',employee:'C7C_EMPLOYEE_B',section:'قسم اختبار',status:'نشط',owner:'employee-b'},
    ];
    return staff.filter(row=>(who==='admin'||who==='director'||row.owner===who) &&
      (!filter.section||row.section===filter.section));
  }
  if(!['incoming','monthly','situation','outgoing'].includes(type))return [];
  return books.filter(row=>{
    if(who.startsWith('employee-') && row.visibility==='Administrative')return false;
    if(who.startsWith('employee-') && row.owner && row.owner!==who)return false;
    if(type==='outgoing')return false;
    if(filter.type && filter.type!==row.type)return false;
    if(filter.status && filter.status!==row.status)return false;
    if(filter.dateFrom && row.date<filter.dateFrom)return false;
    if(filter.dateTo && row.date>filter.dateTo)return false;
    if(filter.documentDateFrom && '2026-11-07'<filter.documentDateFrom)return false;
    if(filter.documentDateTo && '2026-11-07'>filter.documentDateTo)return false;
    // A client-provided employee ID only narrows the preexisting role scope.
    if(filter.employee && row.owner!==filter.employee)return false;
    return true;
  });
}
function report(who,filter){
  const rows=scopedRows(who,filter);
  const stats=['monthly','situation'].includes(filter.reportType)
    ?{bookStatistics:{
      totalBooks:rows.length,incoming:rows.length,outgoing:0,internal:0,
      statuses:{
        'قيد المراجعة':rows.filter(row=>row.status==='قيد المراجعة').length,
        'مكتمل':rows.filter(row=>row.status==='مكتمل').length,
      },
    }}:{};
  return {rows,summary:{totalCount:rows.length,...stats,
    generatedAt:'2026-11-07T00:00:00.000Z',appliedFilters:filter}};
}
async function realXlsx(rows){
  const w=new ExcelJS.Workbook();
  const summary=w.addWorksheet('الملخص');
  summary.addRow(['المؤشر','القيمة']);
  summary.addRow(['نوع التقرير','الكتب الواردة']);
  summary.addRow(['عدد السجلات',String(rows.length)]);
  const details=w.addWorksheet('التفاصيل');
  details.addRow(['التاريخ','النوع','القسم','المنتسب','الحالة','المصدر','العنوان','الملاحظات']);
  for(const row of rows)details.addRow([
    row.date??'',row.type??'',row.section??'',row.employee??'',
    row.status??'','',row.title??'','',
  ]);
  return Buffer.from(await w.xlsx.writeBuffer());
}
function queryObject(url){
  const pairs=[...url.searchParams.entries()];
  const data={};
  for(const [key,value] of pairs){
    if(Object.hasOwn(data,key))return null; // reject ambiguous duplicates
    data[key]=value;
  }
  return data;
}
async function screenshot(page,name){
  await page.screenshot({path:DIR+'/'+name+'.png',fullPage:true,animations:'disabled'});
}
async function main(){
  assert.equal(process.env.CI,'true','C7c browser fixture is CI-only');
  await mkdir(DIR,{recursive:true});
  vite=await createServer({
    configFile:false,root:process.cwd(),plugins:[react()],
    logLevel:'error',
    server:{host:'127.0.0.1',port:0,strictPort:false},
  });
  await vite.listen();
  const address=vite.httpServer?.address();
  assert.ok(address && typeof address==='object' && address.port>0);
  const url='http://127.0.0.1:'+address.port+FIXTURE;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({
    viewport:{width:1360,height:900},
    locale:'ar-IQ',timezoneId:'Asia/Baghdad',acceptDownloads:true,
  });
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',error=>browserErrors.push(error.message));
  let failNext=false;
  let pauseNext=false;
  let pausedStarted=null;
  let resolvePause=null;
  let resolveStarted=null;

  await page.route('**/api/reports**',async route=>{
    const r=route.request();
    try{
      const parsed=new URL(r.url());
      if(!['/api/reports','/api/reports/export'].includes(parsed.pathname) ||
        r.method()!=='GET'){
        await route.fulfill({status:405,body:'test-only path unavailable'});
        return;
      }
      const authorization=r.headers()['authorization']??'';
      const matched=/^Bearer C7C_SYNTHETIC_(employee-a|employee-b|admin|director)$/.exec(authorization);
      if(!matched || !ALLOWED.has(matched[1])){
        await route.fulfill({status:401,contentType:'application/json',
          body:JSON.stringify({error:{code:'UNAUTHENTICATED'}})});
        return;
      }
      const who=matched[1];
      const params=queryObject(parsed);
      if(params===null){
        await route.fulfill({status:400,contentType:'application/json',
          body:JSON.stringify({error:{code:'VALIDATION_ERROR'}})});
        return;
      }
      const exportMode=parsed.pathname.endsWith('/export');
      const validated=exportMode?reportExportQuery(params):reportQuery(params);
      if(validated.kind!=='valid'){
        await route.fulfill({status:400,contentType:'application/json',
          body:JSON.stringify({error:{code:'VALIDATION_ERROR'}})});
        return;
      }
      const validatedFilter={...validated.value};
      const format=validatedFilter.format;
      delete validatedFilter.format;
      requests.push({who,reportType:validatedFilter.reportType,
        format:exportMode?format:'preview',
        status:validatedFilter.status??null,
        employee:validatedFilter.employee??null,
        section:validatedFilter.section??null,
        dateFrom:validatedFilter.dateFrom??null});
      if(pauseNext && !exportMode && who==='employee-a'){
        pauseNext=false;
        pausedStarted=new Promise(resolve=>{resolveStarted=resolve;});
        // Make this promise reachable to the Playwright test before waiting.
        const release=new Promise(resolve=>{resolvePause=resolve;});
        resolveStarted();
        await release;
      }
      if(failNext){
        failNext=false;
        await route.fulfill({status:503,contentType:'application/json',
          headers:{'cache-control':'no-store'},
          body:JSON.stringify({error:{code:'REPORTS_UNAVAILABLE',
            message:'التقارير غير متاحة حالياً.'}})});
        return;
      }
      const data=report(who,validatedFilter);
      if(exportMode){
        if(format!=='excel'){
          await route.fulfill({status:503,contentType:'application/json',
            body:JSON.stringify({error:{code:'REPORT_PDF_NOT_APPROVED'}})});
          return;
        }
        const bytes=await realXlsx(data.rows);
        await route.fulfill({status:200,contentType:MIME,headers:{
          'cache-control':'no-store','x-content-type-options':'nosniff',
          'content-disposition':'attachment; filename="alsqaya-'+validatedFilter.reportType+'.xlsx"',
        },body:bytes});
      }else{
        await route.fulfill({status:200,contentType:'application/json',headers:{
          'cache-control':'no-store','x-content-type-options':'nosniff',
        },body:JSON.stringify(data)});
      }
    }catch(error){
      browserErrors.push('synthetic API fixture error: '+
        (error instanceof Error?error.message:String(error)));
      await route.fulfill({status:500,body:'Synthetic fixture failed'}).catch(()=>{});
    }
  });
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'واجهة التقارير — نسخة قبول غير مفعّلة'}).waitFor();
    assert.ok((await page.getByTestId('c7c-identity').innerText()).includes('employee-a'));
    const chooser=page.getByRole('combobox',{name:'نوع التقرير'});
    assert.equal(await chooser.inputValue(),'incoming');
    for(const blocked of ['monthly','outgoing','situation',
      'circularsAndAcknowledgements','researchers','professors']){
      assert.equal(await chooser.locator('option[value="'+blocked+'"]').count(),0,
        'Employee saw privileged or unavailable report type '+blocked);
    }
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'تصدير PDF'}).isDisabled(),true);
    assert.equal(await page.getByText('عدد السجلات:',{exact:false}).count(),0);

    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText('عدد السجلات: 2').waitFor();
    await page.getByText(PUBLIC,{exact:true}).waitFor();
    await page.getByText(A,{exact:true}).waitFor();
    assert.equal(await page.getByText(B,{exact:true}).count(),0);
    assert.equal(await page.getByText(PRIVATE,{exact:true}).count(),0);
    await screenshot(page,'01-employee-a-scoped');
    results.push('employee A: real React preview admits public and owner-only synthetic books');

    // Actual browser-originated Blob download, with real XLSX ZIP bytes.
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'تصدير Excel'}).click();
    const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),'alsqaya-incoming.xlsx');
    const xlsx=await readFile(await download.path());
    assert.equal(xlsx.subarray(0,2).toString(),'PK');
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx);
    assert.equal(wb.getWorksheet('التفاصيل')?.rowCount,3);
    assert.equal(wb.getWorksheet('الملخص')?.getCell('B3').text,'2');
    const xlsxText=JSON.stringify(wb.model);
    assert.ok(xlsxText.includes(A) && xlsxText.includes(PUBLIC));
    assert.ok(!xlsxText.includes(B) && !xlsxText.includes(PRIVATE));
    results.push('employee A: actual Chromium XLSX download contains exactly scoped rows/count');

    await page.getByLabel('حالة الكتاب').selectOption('قيد المراجعة');
    assert.equal(await page.getByText(A,{exact:true}).count(),0,
      'Changing filters must hide previously approved records');
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).isDisabled(),true);
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText('عدد السجلات: 0').waitFor();
    assert.equal(requests.at(-1)?.status,'قيد المراجعة');
    results.push('filter changed: old results invalidated and actual query scoped by status');

    // Reissue a delayed request under employee A, then switch same-role identity.
    await page.getByLabel('حالة الكتاب').selectOption('');
    pauseNext=true;
    const oldPreview=page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    // Wait until the delayed network request actually entered the interceptor.
    await page.waitForFunction(()=>false,null,{timeout:1}).catch(()=>{}); // event loop yield
    for(let i=0;i<100 && !resolvePause;i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(resolvePause,'A preview request must actually be in flight');
    await page.locator('#c7c-employee-b').click();
    assert.ok((await page.getByTestId('c7c-identity').innerText()).includes('employee-b'));
    assert.equal(await page.getByText(A,{exact:true}).count(),0);
    resolvePause();
    await oldPreview;
    await page.waitForTimeout(150);
    assert.equal(await page.getByText(A,{exact:true}).count(),0,
      'Old employee A data reappeared after same-role account switch');
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).isDisabled(),true);
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText(B,{exact:true}).waitFor();
    assert.equal(await page.getByText(A,{exact:true}).count(),0);
    await screenshot(page,'02-employee-b-session-isolated');
    results.push('same-role employee A→B: stale in-flight result rejected, new owner scope isolated');

    await page.locator('#c7c-director').click();
    const directorType=page.getByRole('combobox',{name:'نوع التقرير'});
    assert.equal(await directorType.locator('option[value="monthly"]').count(),1);
    assert.equal(await directorType.locator('option[value="circularsAndAcknowledgements"]').count(),1);
    assert.equal(await directorType.locator('option[value="researchers"]').count(),0);
    assert.equal(await directorType.locator('option[value="professors"]').count(),0);
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText('عدد السجلات: 4').waitFor();
    await page.getByText(PRIVATE,{exact:true}).waitFor();
    await page.getByText(A,{exact:true}).waitFor();
    await page.getByText(B,{exact:true}).waitFor();
    await screenshot(page,'03-director-scoped');
    results.push('director: read-only role can preview four synthetic books with server-mock scope');

    await directorType.selectOption('monthly');
    assert.equal(await page.getByText(PRIVATE,{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).isDisabled(),true);
    await page.getByLabel('اتجاه الكتاب').selectOption('صادر');
    assert.equal(await page.getByLabel('تاريخ الكتاب من').count(),1);
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText('عدد السجلات: 0').waitFor();
    assert.equal(requests.at(-1)?.reportType,'monthly');
    await directorType.selectOption('incoming');
    assert.equal(await page.getByLabel('اتجاه الكتاب').count(),0,
      'Type selector must remove an unsupported stale direction filter');
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText('عدد السجلات: 4').waitFor();
    assert.equal(requests.at(-1)?.reportType,'incoming');
    results.push('director: changing source clears obsolete filters and stale totals');

    // A bad date is stopped on the client before issuing another query.
    await page.getByLabel('تاريخ التسجيل من').fill('2026-12-31');
    await page.getByLabel('تاريخ التسجيل إلى').fill('2026-01-01');
    const beforeBad=requests.length;
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(requests.length,beforeBad);
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).isDisabled(),true);
    results.push('invalid registration range: fail before request with no previous approved data');

    await page.getByLabel('تاريخ التسجيل من').fill('');
    await page.getByLabel('تاريخ التسجيل إلى').fill('');
    failNext=true;
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByRole('alert').getByText('التقارير الرسمية ما زالت مغلقة حتى الاعتماد.').waitFor();
    assert.equal(await page.getByText(PRIVATE,{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).isDisabled(),true);
    results.push('503 from intercepted API: no fabricated success or export');

    await page.locator('#c7c-admin').click();
    await page.getByRole('button',{name:'معاينة مع صلاحيات الخادم'}).click();
    await page.getByText('عدد السجلات: 4').waitFor();
    assert.equal(await page.getByRole('button',{name:'تصدير PDF'}).isDisabled(),true);
    await screenshot(page,'04-admin-pdf-disabled');
    results.push('admin: privileged view and unapproved PDF remains disabled');

    await page.locator('#c7c-logout').click();
    await page.getByTestId('c7c-logged-out').waitFor();
    assert.equal(await page.getByText(PRIVATE,{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'تصدير Excel'}).count(),0);
    assert.deepEqual(browserErrors,[],'Browser emitted uncaught errors or fixture crashes');
    results.push('logout: candidate UI and prior privileged data fully unmounted');

    const summary={
      status:'PASS',sha:process.env.GITHUB_SHA??'untracked',
      browser:'real Chromium + Vite React component',
      network:'127.0.0.1 only',syntheticOnly:true,apiResponses:'PLAYWRIGHT_INTERCEPTED',
      candidateMountedInProduction:false,
      actualReport503VerifiedSeparately:true,
      screenshotFiles:[
        '01-employee-a-scoped.png','02-employee-b-session-isolated.png',
        '03-director-scoped.png','04-admin-pdf-disabled.png',
      ],cases:results,
    };
    await writeFile(DIR+'/summary.json',JSON.stringify(summary,null,2)+'\n');
    console.log('C7C_CHROMIUM_SYNTHETIC_ACCEPTANCE_PASS '+results.join(' | '));
  }finally{
    await context.close();
  }
}
let fatal=null;
try{await main();}
catch(error){
  fatal=error;
  await mkdir(DIR,{recursive:true});
  await writeFile(DIR+'/failure.txt',
    'C7c synthetic-only Chromium fixture failed: '+
    (error instanceof Error?error.stack:String(error))+'\n');
  console.error('C7c synthetic-only Chromium UAT FAILED:',error);
}finally{
  stopped=true;
  if(browser)await browser.close().catch(()=>{});
  if(vite)await vite.close().catch(()=>{});
}
if(fatal)process.exit(1);
