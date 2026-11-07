/** Phase 23 official transaction mutations: no optimistic or unauthorized local writes. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApiClient, type FetchLike } from '../../src/api/apiClient';
import { archivePilotTransaction, transitionPilotTransactionStatus } from '../../src/api/pilotTransactionActions';
import { setBearerToken } from '../../src/api/sessionToken';
import { TransactionsList } from '../../src/components/views/TransactionsList';
import type { TransactionDto } from '../../src/api/mappers';
import { INITIAL_TRANSACTIONS } from '../../src/data/mockData';

const id = 'synthetic-book';
const row: TransactionDto = {
  id, number:'1', sequence:'1', date:'2026-11-07', month:'2026-11',
  direction:'وارد', category:'إدارية', subType:'مراسلات', entity:'مؤسسة تجريبية',
  subject:'اختبار', employeeIds:[], status:'مكتمل', attachments:[], version:4,
};

function fakeApi(status: number, body: unknown) {
  const calls: Array<{path:string,method:string|undefined,body:BodyInit|null|undefined,authorization:string|null}> = [];
  const fetchImpl: FetchLike = async (path, options) => {
    calls.push({
      path, method:options?.method, body:options?.body,
      authorization:new Headers(options?.headers).get('authorization'),
    });
    return new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
  };
  return {calls,client:createApiClient({baseUrl:'http://test.invalid/api',fetchImpl})};
}

test('status transition POST uses server version, validates id/status/version, returns authoritative row', async () => {
  const api=fakeApi(200,row);
  setBearerToken('SYNTHETIC_TOKEN');
  try {
    const saved=await transitionPilotTransactionStatus(id,'مكتمل',3,api.client);
    assert.equal(saved.version,4);
    assert.equal(saved.status,'مكتمل');
    assert.deepEqual(api.calls,[{
      path:'http://test.invalid/api/transactions/synthetic-book/status',
      method:'POST', body:JSON.stringify({status:'مكتمل',expectedVersion:3}),
      authorization:'Bearer SYNTHETIC_TOKEN',
    }]);
  }finally{setBearerToken(null);}
});

test('status transition rejects unsupported state or incorrect server confirmation',async()=>{
  const invalids=[
    {...row,id:'wrong-book'}, {...row,status:'قيد المراجعة'}, {...row,version:3},
  ];
  for(const value of invalids){
    const api=fakeApi(200,value);
    await assert.rejects(transitionPilotTransactionStatus(id,'مكتمل',3,api.client),
      /Unverified transaction status response/);
  }
  const api=fakeApi(200,row);
  await assert.rejects(transitionPilotTransactionStatus(id,'invalid' as TransactionDto['status'] & never,3,api.client),
    /Invalid transaction status/);
  await assert.rejects(transitionPilotTransactionStatus(id,'مكتمل',0,api.client),/expectedVersion/);
});

test('archive is server DELETE with expectedVersion query and no body, never local hard delete',async()=>{
  const api=fakeApi(200,{...row,deletedAt:'2026-11-07T08:00:00Z'});
  setBearerToken('SYNTHETIC_TOKEN');
  try {
    await archivePilotTransaction(id,3,api.client);
    assert.deepEqual(api.calls,[{
      path:'http://test.invalid/api/transactions/synthetic-book?expectedVersion=3',
      method:'DELETE', body:undefined, authorization:'Bearer SYNTHETIC_TOKEN',
    }]);
  }finally{setBearerToken(null);}
});

test('failed or conflicting status/archive operations reject without simulated success',async()=>{
  for(const code of [403,404,409,503]){
    const client=fakeApi(code,{error:{code:'PERMISSION_DENIED',message:'blocked'}}).client;
    await assert.rejects(transitionPilotTransactionStatus(id,'مكتمل',3,client),
      (e:unknown)=>!!e&&typeof e==='object'&&'status' in e&&e.status===code);
    await assert.rejects(archivePilotTransaction(id,3,client),
      (e:unknown)=>!!e&&typeof e==='object'&&'status' in e&&e.status===code);
  }
});

test('real admin sees archive/status controls, director and employee remain read-only',()=>{
  const transaction = INITIAL_TRANSACTIONS[0];
  assert.ok(transaction);
  const props={transactions:[transaction],onSelectTransaction:()=>{},onUpdateStatus:()=>{},
    onOpenNewModal:()=>{},onDeleteTransaction:()=>{},isServerMode:true};
  const render=(role:'admin'|'director'|'employee')=>
    renderToStaticMarkup(React.createElement(TransactionsList,{...props,userRole:role}));
  assert.match(render('admin'),/أرشفة/);
  assert.match(render('admin'),/select/);
  for(const role of ['director','employee'] as const) {
    assert.doesNotMatch(render(role),/title="أرشفة المعاملة"|title="أرشفة الكتاب دون حذفه نهائيًا"/);
  }
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/transitionPilotTransactionStatus\(id, newStatus, record.version\)/);
  assert.match(app,/archivePilotTransaction\(id, record.version\)/);
  assert.match(app,/transactionMutationLock\.current/);
  assert.match(app,/generation === sessionGeneration\.current/);
  assert.match(app,/setTransactionActionError\(message\)/);
});
