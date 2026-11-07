/**
 * Chromium + React/Vite + real Express + migrated embedded PostgreSQL acceptance.
 * All data is synthetic and the network is loopback-only.
 * CI: node --import tsx server/tests/browser/pilotBrowserUat.mjs
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {startApiSuite,stopApiSuite} from '../api/apiTestSuite.ts';
import {
  newAuthenticatedAccount,newRegisteredAccount,newTransaction,setAccountRole,
} from '../api/apiTestData.ts';
import {deleteJson,useTestSession} from '../api/apiTestHelpers.ts';

const SECRET='SyntheticBrowserOnlySecret9';
const ARTIFACTS='artifacts/phase23-browser-uat';
const results=[];
let api=null;
let vite=null;
let browser=null;

async function browserLogin(page,badge,url){
  const apiStatuses=[];
  page.on('response',response=>{
    try {
      const parsed=new URL(response.url());
      if (parsed.pathname.startsWith('/api/')) {
        apiStatuses.push({path:parsed.pathname,status:response.status()});
      }
    } catch { /* ignore non-HTTP browser internals */ }
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'السقاية — تسجيل الدخول'}).waitFor({state:'visible'});
  await page.locator('input[autocomplete="username"]').fill(badge);
  await page.locator('input[autocomplete="current-password"]').fill(SECRET);
  await page.getByRole('button',{name:'دخول',exact:true}).click();
  try {
    await page.locator('#btn-session-logout').waitFor({state:'visible',timeout:30000});
  } catch (error) {
    // Synthetic fixtures only. Never log credentials or Authorization headers.
    const visible=await page.locator('body').innerText().catch(()=>'<body unavailable>');
    await snapshot(page,'00-login-failure');
    throw new Error('Browser login failed: '+badge+
      '; API statuses='+JSON.stringify(apiStatuses)+
      '; visible UI='+visible.slice(0,1300)+
      '; cause='+(error instanceof Error?error.message:String(error)));
  }
}
async function snapshot(page,name){
  await page.screenshot({path:ARTIFACTS+'/'+name+'.png',fullPage:true,animations:'disabled'});
}
async function run(){
  await mkdir(ARTIFACTS,{recursive:true});
  api=await startApiSuite();
  const ctx=api.context;
  const admin=await newAuthenticatedAccount(ctx,{
    badgeNumber:'BROWSER-ADMIN-1',phone:'07718880001',
    role:'admin',secret:SECRET,name:'مسؤول تجريبي للمتصفح',
  });
  useTestSession(null);
  const director=await newRegisteredAccount(ctx,{
    badgeNumber:'BROWSER-DIRECTOR-1',phone:'07718880002',
    secret:SECRET,name:'مدير تجريبي للمتصفح',
  });
  await setAccountRole(ctx,director.account.id,'director');
  useTestSession(null);
  await newRegisteredAccount(ctx,{
    badgeNumber:'BROWSER-EMPLOYEE-1',phone:'07718880003',
    secret:SECRET,name:'منتسب تجريبي للمتصفح',
  });
  useTestSession(admin.sessionToken);

  const publicSubject='كتاب المتصفح العام الاصطناعي';
  const restrictedSubject='كتاب المتصفح الإداري السري الاصطناعي';
  const archivedSubject='كتاب المتصفح المؤرشف الاصطناعي';
  const baseBook={
    date:'2026-11-07',direction:'وارد',
    category:'إدارية',subType:'مراسلات',entity:'جهة اختبار اصطناعية',
    status:'قيد المراجعة',
  };
  await newTransaction(ctx,{
    ...baseBook,number:'BROW-100',sequence:'BROW-100',
    subject:publicSubject,visibility:'PublicToEmployees',
  });
  await newTransaction(ctx,{
    ...baseBook,number:'BROW-200',sequence:'BROW-200',
    subject:restrictedSubject,visibility:'Administrative',
  });
  const archiveCandidate=await newTransaction(ctx,{
    ...baseBook,number:'BROW-300',sequence:'BROW-300',
    subject:archivedSubject,visibility:'Administrative',
  });
  const archiveResponse=await deleteJson(ctx.baseUrl,
    '/api/transactions/'+encodeURIComponent(archiveCandidate.id)+
    '?expectedVersion='+archiveCandidate.version);
  assert.equal(archiveResponse.status,200,'synthetic archive seed must persist via real API');
  assert.equal(archiveResponse.body?.id,archiveCandidate.id);
  assert.ok(archiveResponse.body?.deletedAt);

  vite=await createServer({
    logLevel:'error',
    server:{
      host:'127.0.0.1',port:0,strictPort:false,
      proxy:{'/api':{target:api.baseUrl,changeOrigin:false}},
    },
  });
  await vite.listen();
  const address=vite.httpServer?.address();
  assert.ok(address && typeof address==='object' && address.port>0);
  const frontend='http://127.0.0.1:'+address.port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});

  async function pageForRole(){
    const context=await browser.newContext({viewport:{width:1400,height:900},
      locale:'ar-IQ',timezoneId:'Asia/Baghdad'});
    const page=await context.newPage();
    page.setDefaultTimeout(25000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    return {context,page,assertNoErrors:()=>assert.deepEqual(errors,[])};
  }

  {
    const {context,page,assertNoErrors}=await pageForRole();
    try{
      await browserLogin(page,'BROWSER-ADMIN-1',frontend);
      await page.getByText(publicSubject,{exact:true}).first().waitFor({state:'visible',timeout:30000});
      await page.getByText(restrictedSubject,{exact:true}).first().waitFor({state:'visible'});
      assert.equal(await page.locator('#btn-add-transaction').count(),1);
      assert.equal(await page.locator('#tab-daily-situations').count(),1);
      assert.equal(await page.locator('#tab-archivist-studio').count(),0);
      assert.equal(await page.locator('#role-admin').count(),0,'official mode must hide role switches');
      await snapshot(page,'01-admin-active');

      await page.getByRole('button',{name:'عرض الكتب المؤرشفة واستعادتها'}).click();
      await page.getByRole('heading',{name:'أرشيف الكتب الرسمية'}).waitFor({state:'visible'});
      const item=page.locator('article').filter({hasText:archivedSubject});
      await item.getByRole('button',{name:'استعادة',exact:true}).click();
      await page.getByRole('button',{name:'تأكيد الاستعادة'}).click();
      await page.getByText('تمت استعادة الكتاب رسميًا في الخادم.').waitFor({state:'visible'});
      await snapshot(page,'02-admin-restored');
      await page.getByRole('button',{name:'عودة إلى الكتب النشطة'}).first().click();
      await page.getByText(archivedSubject,{exact:true}).first().waitFor({state:'visible'});
      results.push('admin: login, scoped books, versioned restore and refresh');

      const report=await fetch(api.baseUrl+'/api/reports?reportType=monthly',{
        headers:{authorization:'Bearer '+admin.sessionToken},
      });
      assert.equal(report.status,503);
      assert.equal((await report.json()).error?.code,'REPORTS_UNAVAILABLE');
      await page.locator('#tab-monthly-report').click();
      await page.getByRole('heading',{name:'العرض الشهري الحالي — ليس تقريرًا رسميًا معتمدًا'})
        .waitFor({state:'visible'});
      await page.getByText('التقارير الرسمية المخطط لها',{exact:true}).first().waitFor({state:'visible'});
      await snapshot(page,'03-reports-unavailable');
      results.push('reports: real HTTP 503 and visible non-official notice');

      await page.locator('#btn-session-logout').click();
      await page.getByRole('heading',{name:'السقاية — تسجيل الدخول'}).waitFor({state:'visible'});
      assert.equal(await page.getByText(publicSubject,{exact:true}).count(),0);
      results.push('admin: logout clears staff and book UI');
      assertNoErrors();
    }finally{await context.close();}
  }
  for(const {role,badge,showDaily,showRestricted} of [
    {role:'director',badge:'BROWSER-DIRECTOR-1',showDaily:true,showRestricted:true},
    {role:'employee',badge:'BROWSER-EMPLOYEE-1',showDaily:false,showRestricted:false},
  ]){
    const {context,page,assertNoErrors}=await pageForRole();
    try{
      await browserLogin(page,badge,frontend);
      await page.getByText(publicSubject,{exact:true}).first().waitFor({state:'visible',timeout:30000});
      assert.equal(await page.locator('#btn-add-transaction').count(),0,role+' must not create');
      assert.equal(await page.getByRole('button',{name:'عرض الكتب المؤرشفة واستعادتها'}).count(),0);
      assert.equal(await page.locator('#tab-daily-situations').count(),showDaily?1:0);
      assert.equal(await page.getByText(restrictedSubject,{exact:true}).count(),showRestricted?1:0,
        role+' administrative book scope');
      assert.equal(await page.locator('#role-admin').count(),0,'no role override for '+role);
      await snapshot(page,'04-'+role+'-scope');
      await page.locator('#btn-session-logout').click();
      await page.getByRole('heading',{name:'السقاية — تسجيل الدخول'}).waitFor({state:'visible'});
      assertNoErrors();
      results.push(role+': real login, SQL book scope, read-only controls and logout');
    }finally{await context.close();}
  }
  const summary={status:'PASS',sha:process.env.GITHUB_SHA??'local-isolated',
    browser:'Chromium (Playwright)',roles:['admin','director','employee'],
    syntheticOnly:true,reportHttpGate:503,cases:results};
  await writeFile(ARTIFACTS+'/summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log('Phase23 browser acceptance PASS: '+results.join(' | '));
}
let fatalError=null;
try{await run();}
catch(error){
  fatalError=error;
  await mkdir(ARTIFACTS,{recursive:true});
  await writeFile(ARTIFACTS+'/failure.txt',
    'Synthetic browser UAT failed: '+(error instanceof Error?error.stack:String(error))+'\n');
  console.error('Phase23 browser acceptance FAILED:',error);
}
finally{
  if(browser) await browser.close().catch(()=>{});
  if(vite) await vite.close().catch(()=>{});
  if(api) await stopApiSuite(api).catch(()=>{});
}
// Test libraries may reset process.exitCode during teardown; a failed browser
// run MUST always leave this CI job nonzero.
if(fatalError) process.exit(1);
