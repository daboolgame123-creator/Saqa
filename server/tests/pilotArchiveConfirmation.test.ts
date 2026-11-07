/** Soft archive must confirm exact server row, not just HTTP success. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createApiClient, type FetchLike} from '../../src/api/apiClient';
import {setBearerToken} from '../../src/api/sessionToken';
import {archivePilotTransaction} from '../../src/api/pilotTransactionActions';

const id='SYNTH-BOOK-1';
const archived={
  id,number:'1/TEST',sequence:'1',date:'2026-11-07',month:'2026-11',
  direction:'وارد',category:'إدارية',subType:'مراسلات',entity:'اختبار',
  subject:'كتاب اختبار',employeeIds:[],status:'قيد المراجعة',attachments:[],
  version:9,deletedAt:'2026-11-07T11:10:00.000Z',
  deletedBy:'SYNTHETIC-ADMIN',deleteReason:null,
};

function server(status:number,reply:unknown) {
  const calls:Array<{url:string,method:string|undefined,body:BodyInit|null|undefined,auth:string|null}>=[];
  const fetchImpl:FetchLike=async(url,opts)=>{
    calls.push({url,method:opts?.method,body:opts?.body,
      auth:new Headers(opts?.headers).get('authorization')});
    return status===204
      ? new Response(null,{status})
      : new Response(JSON.stringify(reply),{status,headers:{'Content-Type':'application/json'}});
  };
  return {calls,client:createApiClient({baseUrl:'http://synthetic.invalid/api',fetchImpl})};
}

test('archive accepts exact server-managed deletion stamp and increased version; request is query-only',async()=>{
  const api=server(200,archived);
  setBearerToken('SYNTHETIC-ADMIN-TOKEN');
  try{
    await archivePilotTransaction(id,8,api.client);
    assert.deepEqual(api.calls,[{
      url:'http://synthetic.invalid/api/transactions/SYNTH-BOOK-1?expectedVersion=8',
      method:'DELETE',body:undefined,auth:'Bearer SYNTHETIC-ADMIN-TOKEN',
    }]);
  }finally{setBearerToken(null);}
});

test('archive rejects malformed 2xx success: absent/wrong id, missing stamp and stale or forged version',async()=>{
  const cases:unknown[]=[
    null,{},'ok',
    {...archived,id:'OTHER-BOOK'},
    {...archived,version:8},
    {...archived,version:10},
    {...archived,version:'9'},
    {...archived,deletedAt:null},
    {...archived,deletedAt:''},
    {...archived,deletedAt:'not-a-date'},
  ];
  for(const reply of cases){
    const api=server(200,reply);
    await assert.rejects(archivePilotTransaction(id,8,api.client),
      /Unverified transaction archive response/);
    assert.equal(api.calls.length,1,'invalid response must not cause a retrying DELETE');
  }
  await assert.rejects(archivePilotTransaction(id,8,server(204,null).client),
    /Unverified transaction archive response/);
});

test('archive rejects 400/401/403/404/409/503 without local success',async()=>{
  for(const status of [400,401,403,404,409,503]){
    const api=server(status,{error:{code:'DENIED',message:'Synthetic denial'}});
    await assert.rejects(archivePilotTransaction(id,8,api.client),(e:unknown)=>
      typeof e==='object' && e!==null && 'status' in e && e.status===status);
  }
});

test('typed DELETE can return server DTO; default remove still callable without a result',async()=>{
  const api=server(200,archived);
  const typed=await api.client.remove<typeof archived>('/transactions/SYNTH-BOOK-1?expectedVersion=8');
  assert.equal(typed.deletedAt,archived.deletedAt);
  // Existing callers of remove() are still typed as Promise<void>.
  const untyped:Promise<void>=api.client.remove('/unrelated-synthetic-resource');
  await untyped;
});
