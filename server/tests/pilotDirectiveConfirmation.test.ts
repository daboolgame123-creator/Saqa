/** Phase23 pilot admin directives: server-confirmed versioned PATCH, no false UI success. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createApiClient,type FetchLike} from '../../src/api/apiClient';
import {setBearerToken} from '../../src/api/sessionToken';
import {savePilotTransactionDirective} from '../../src/api/pilotTransactionActions';
import {TransactionsList} from '../../src/components/views/TransactionsList';
import {INITIAL_TRANSACTIONS} from '../../src/data/mockData';
import type {TransactionDto} from '../../src/api/mappers';

const id='synthetic-book-id';
const base:TransactionDto={
  id,number:'100',sequence:'100',date:'2026-11-07',month:'2026-11',
  direction:'وارد',category:'إدارية',subType:'مراسلات',entity:'اختبار',
  subject:'هامش تجريبي',employeeIds:[],status:'قيد المراجعة',
  attachments:[],version:8,
};

function fakeApi(status:number, transform:(body:Record<string,unknown>)=>unknown){
  const calls:Array<{path:string,method:string|undefined,body:Record<string,unknown>,auth:string|null}>=[];
  const fetchImpl:FetchLike=async(path,opts)=>{
    const request=JSON.parse(String(opts?.body??'{}')) as Record<string,unknown>;
    calls.push({path,method:opts?.method,body:request,
      auth:new Headers(opts?.headers).get('authorization')});
    return new Response(JSON.stringify(transform(request)),{status,headers:{'Content-Type':'application/json'}});
  };
  return {client:createApiClient({baseUrl:'http://test.invalid/api',fetchImpl}),calls};
}

test('directive PATCH includes exactly directive and expectedVersion, with authenticated Bearer',async()=>{
  const api=fakeApi(200,request=>({...base,version:9,directorDirective:request.directorDirective}));
  setBearerToken('SYNTHETIC_ADMIN_TOKEN');
  try{
    const saved=await savePilotTransactionDirective(id,'  يرجى المتابعة  ',true,8,api.client);
    assert.equal(saved.version,9);
    assert.equal(saved.directorDirective?.text,'يرجى المتابعة');
    assert.equal(api.calls.length,1);
    const call=api.calls[0];
    assert.equal(call?.path,'http://test.invalid/api/transactions/synthetic-book-id');
    assert.equal(call?.method,'PATCH');
    assert.equal(call?.auth,'Bearer SYNTHETIC_ADMIN_TOKEN');
    assert.deepEqual(Object.keys(call?.body??{}).sort(),['directorDirective','expectedVersion']);
    assert.equal(call?.body.expectedVersion,8);
    const dir=call?.body.directorDirective as Record<string,unknown>;
    assert.equal(dir?.text,'يرجى المتابعة');
    assert.equal(dir?.actionRequired,true);
    assert.ok(typeof dir?.date==='string'&&Number.isFinite(Date.parse(dir.date)));
    assert.ok(!('userId' in call!.body) && !('actor' in call!.body));
  }finally{setBearerToken(null);}
});

test('no directive mutation on blank, invalid version or oversized text',async()=>{
  const api=fakeApi(200,body=>({...base,version:9,directorDirective:body.directorDirective}));
  for(const [text,version] of [['',8],['good',0],['x'.repeat(2001),8]] as const){
    await assert.rejects(savePilotTransactionDirective(id,text,false,version,api.client));
  }
  assert.equal(api.calls.length,0);
});

test('backend response must confirm id, incremented version and exact directive',async()=>{
  const fixtures=[
    (r:Record<string,unknown>)=>({...base,id:'foreign',version:9,directorDirective:r.directorDirective}),
    (r:Record<string,unknown>)=>({...base,version:8,directorDirective:r.directorDirective}),
    ()=>({...base,version:9}),
    (r:Record<string,unknown>)=>({...base,version:9,directorDirective:{...r.directorDirective as object,text:'forged'}}),
    (r:Record<string,unknown>)=>({...base,version:9,directorDirective:{...r.directorDirective as object,actionRequired:false}}),
  ];
  for(const fixture of fixtures){
    await assert.rejects(savePilotTransactionDirective(id,'يرجى المتابعة',true,8,fakeApi(200,(r)=>fixture(r)).client),
      /Unverified directive persistence response/);
  }
});

test('HTTP denial, not-found, stale conflict and report-unavailable never produce local confirmation',async()=>{
  for(const status of [401,403,404,409,503]){
    const client=fakeApi(status,()=>({error:{code:'DENIED',message:'synthetic'}})).client;
    await assert.rejects(savePilotTransactionDirective(id,'يرجى المتابعة',true,8,client),
      (e:unknown)=>!!e&&typeof e==='object'&&'status' in e&&e.status===status);
  }
});

test('admin sees directive action in official card/table; director/employee cannot trigger',()=>{
  const transaction=INITIAL_TRANSACTIONS[0];
  assert.ok(transaction);
  const props={transactions:[transaction],onSelectTransaction:()=>{},onUpdateStatus:()=>{},
    onOpenNewModal:()=>{},isServerMode:true,onSaveDirective:async()=>{}};
  const render=(role:'admin'|'director'|'employee')=>renderToStaticMarkup(
    React.createElement(TransactionsList,{...props,userRole:role}));
  const admin=render('admin');
  assert.match(admin,/هامش المدير/);
  // Table mode is client state (SSR defaults to cards); verify its separate
  // role-gated action in source while SSR covers the default card mode.
  const view=readFileSync(new URL('../../src/components/views/TransactionsList.tsx',import.meta.url),'utf8');
  assert.match(view,/setActiveDirectiveCardId\(tr\.id\)/);
  assert.match(view,/>هامش<\/button>/);
  for(const role of ['director','employee'] as const){
    const html=render(role);
    assert.doesNotMatch(html,/هامش المدير|>هامش</);
  }
});

test('App official directive never updates UI before backend confirms; modal keeps entered text on failure',()=>{
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  const view=readFileSync(new URL('../../src/components/views/TransactionsList.tsx',import.meta.url),'utf8');
  const start=app.indexOf("  // Official admin directive:");
  const end=app.indexOf("  // PHASE 10: القراءة الأولية",start);
  assert.ok(start>0&&end>start);
  const code=app.slice(start,end);
  assert.match(code,/const saved = await savePilotTransactionDirective\(/);
  assert.match(code,/setTransactions\(\(prev\) => prev\.map/);
  assert.ok(code.indexOf('const saved = await')<code.indexOf('setTransactions((prev) => prev.map'));
  assert.match(code,/generation !== sessionGeneration\.current \|\| getBearerToken\(\) !== token/);
  assert.match(code,/transactionMutationLock\.current/);
  assert.match(view,/await onSaveDirective\(activeDirectiveCardId/);
  assert.match(view,/setDirectiveError\('تعذّر تأكيد التوجيه/);
  assert.match(view,/if \(!activeDirectiveCardId \|\| !customDirectiveText\.trim\(\)/);
  assert.match(view,/disabled=\{directiveBusy \|\| !customDirectiveText\.trim\(\) \|\| isActionBusy\}/);
});
