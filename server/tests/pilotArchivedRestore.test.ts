/** Official archive browser/restore — synthetic, server-authoritative regression tests. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApiClient, type FetchLike } from '../../src/api/apiClient';
import { listPilotArchivedTransactions, restorePilotArchivedTransaction } from '../../src/api/pilotArchive';
import { setBearerToken } from '../../src/api/sessionToken';
import { ArchivedTransactionsPanel } from '../../src/components/views/ArchivedTransactionsPanel';
import type { TransactionDto } from '../../src/api/mappers';

const archived = {
  id:'archived-synthetic-id', number:'23/10', sequence:'100',
  date:'2026-10-20', month:'2026-10', direction:'وارد', category:'إدارية',
  subType:'مراسلات', entity:'جهة اصطناعية', subject:'كتاب اختبار الأرشفة',
  employeeIds:[], status:'قيد المراجعة', attachments:[], version:7,
  deletedAt:'2026-11-07T10:05:30.000Z', deletedBy:'synthetic-admin',
  deleteReason:'سبب تجريبي',
};
const restored: TransactionDto = {
  id: archived.id, number: archived.number, sequence: archived.sequence,
  date: archived.date, month: archived.month, direction: archived.direction,
  category: archived.category, subType: archived.subType, entity: archived.entity,
  subject: archived.subject, employeeIds: [], status: archived.status,
  attachments: [], version: 8,
};

function fakeApi(status: number, value: unknown) {
  const calls: Array<{url:string,method:string|undefined,body:BodyInit|null|undefined,auth:string|null}> = [];
  const fetchImpl: FetchLike = async (url, opt) => {
    calls.push({url,method:opt?.method,body:opt?.body,
      auth:new Headers(opt?.headers).get('authorization')});
    return new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}});
  };
  return {client:createApiClient({baseUrl:'http://unit.invalid/api',fetchImpl}),calls};
}

test('archive pages query the admin-only server route with limit/offset and Bearer, not actor parameters', async()=>{
  const api=fakeApi(200,[archived]);
  setBearerToken('TOKEN_FOR_SYNTHETIC_ADMIN');
  try{
    const result=await listPilotArchivedTransactions(25,25,api.client);
    assert.equal(result.length,1);
    assert.deepEqual(result[0],{
      id:archived.id,number:archived.number,sequence:archived.sequence,
      subject:archived.subject,date:archived.date,status:archived.status,
      version:7,deletedAt:archived.deletedAt,deleteReason:archived.deleteReason,
    });
    assert.equal(api.calls[0]?.method,'GET');
    assert.equal(api.calls[0]?.auth,'Bearer TOKEN_FOR_SYNTHETIC_ADMIN');
    assert.match(api.calls[0]?.url??'',/^http:\/\/unit\.invalid\/api\/transactions\/archived\?/);
    assert.match(api.calls[0]?.url??'',/limit=25/);
    assert.match(api.calls[0]?.url??'',/offset=25/);
    assert.doesNotMatch(api.calls[0]?.url??'',/actor|userId|employeeId/);
    assert.equal(api.calls[0]?.body,undefined);
  }finally{setBearerToken(null);}
});

test('archive list rejects malformed, oversized, duplicated or non-archived rows', async()=>{
  const failures:unknown[]=[
    {},[{...archived,deletedAt:null}],
    [{...archived,version:0}],
    [archived,archived],
    [{...archived,deletedAt:'not-a-date'}],
    [archived,{...archived,id:'second-id'}],
  ];
  for(let i=0;i<failures.length;i++){
    const api=fakeApi(200,failures[i]);
    await assert.rejects(listPilotArchivedTransactions(0,i===5?1:25,api.client));
  }
  const api=fakeApi(200,[]);
  await assert.rejects(listPilotArchivedTransactions(-1,25,api.client),/Invalid archive page/);
  await assert.rejects(listPilotArchivedTransactions(0,101,api.client),/Invalid archive page/);
});

test('restore POST uses query version, no body/actor, and validates version advancement',async()=>{
  const api=fakeApi(200,restored);
  setBearerToken('TOKEN_FOR_SYNTHETIC_ADMIN');
  try{
    const result=await restorePilotArchivedTransaction(archived.id,7,api.client);
    assert.equal(result.id,archived.id);
    assert.equal(result.version,8);
    assert.equal(api.calls.length,1);
    assert.equal(api.calls[0]?.url,'http://unit.invalid/api/transactions/archived-synthetic-id/restore?expectedVersion=7');
    assert.equal(api.calls[0]?.method,'POST');
    assert.equal(api.calls[0]?.body,undefined);
    assert.equal(api.calls[0]?.auth,'Bearer TOKEN_FOR_SYNTHETIC_ADMIN');
  }finally{setBearerToken(null);}
});

test('restore rejects forged/inconsistent success and expectedVersion conflict, no local fallback',async()=>{
  for(const row of [
    {...restored,id:'different-id'},
    {...restored,version:7},
    {...restored,deletedAt:archived.deletedAt},
    {...restored,employeeIds:null},
    {...restored,attachments:null},
  ]) {
    await assert.rejects(restorePilotArchivedTransaction(archived.id,7,fakeApi(200,row).client),
      /Unverified transaction restore response/);
  }
  for(const code of [401,403,404,409,503]){
    const client=fakeApi(code,{error:{code:'DENIED',message:'no'}}).client;
    await assert.rejects(listPilotArchivedTransactions(0,25,client),
      (e:unknown)=>!!e&&typeof e==='object'&&'status' in e&&e.status===code);
    await assert.rejects(restorePilotArchivedTransaction(archived.id,7,client),
      (e:unknown)=>!!e&&typeof e==='object'&&'status' in e&&e.status===code);
  }
});

test('archive UI has an explicit confirmation; App mounts it only for authenticated admin API',()=>{
  const markup=renderToStaticMarkup(React.createElement(ArchivedTransactionsPanel,{
    onClose:()=>{},onRestored:async()=>{},
  }));
  assert.match(markup,/أرشيف الكتب الرسمية/);
  assert.doesNotMatch(markup,/تمت استعادة الكتاب رسميًا/);
  assert.doesNotMatch(markup,/تأكيد الاستعادة/);
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.ok(app.includes("serverAccount?.role === 'admin' && ("));
  assert.ok(app.includes('<ArchivedTransactionsPanel'));
  assert.ok(app.includes('onRestored={handleRestoredTransaction}'));
  assert.ok(app.includes("if (isLocalDemo || serverAccount?.role !== 'admin')"));
  assert.ok(app.includes("loadPilotStartupData(getDataAdapter(), 'admin')"));
  assert.ok(app.includes('sessionGeneration.current !== generation'));
  const ui=readFileSync(new URL('../../src/components/views/ArchivedTransactionsPanel.tsx',import.meta.url),'utf8');
  assert.ok(ui.includes('getBearerToken() !== token'));
  assert.ok(ui.includes('await restorePilotArchivedTransaction(item.id, item.version)'));
  assert.ok(ui.includes('await onRestored(restored)'));
  assert.ok(ui.includes('تمت الاستعادة، لكن تعذّر تحديث قائمة الكتب النشطة'));
});
