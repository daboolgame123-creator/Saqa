/** Phase 23 pilot: stale network responses must never cross session boundary. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createApiClient, type FetchLike} from '../../src/api/apiClient';
import {getBearerToken,setBearerToken} from '../../src/api/sessionToken';
import {loginWithServer,logoutFromServer,changeSecretWithServer} from '../../src/api/pilotAuth';
import {loadPilotStartupData,type PilotBootstrapSource} from '../../src/api/pilotBootstrap';
import type {Transaction,TransactionEmployee} from '../../src/core/models';

const account={id:'synthetic-account',employeeId:'synthetic-employee',username:'B-SYNTH',displayName:'Test Only',
  role:'employee',status:'active',mustChangeSecret:false};
const loginBody={account,sessionToken:'OLD_TOKEN',mustChangeSecret:false};
const me={userId:account.id,employeeId:account.employeeId,username:account.username,
  displayName:account.displayName,role:account.role};

function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function success(body:unknown,status=200):Response {
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
}

test('a late /auth/me reply from a logged-out session cannot authorize or resurrect an account',async()=>{
  const pending=deferred<Response>();
  const entered=deferred<void>();
  const fetchImpl:FetchLike=async(url)=>{
    if(url.endsWith('/auth/login')) return success(loginBody);
    if(url.endsWith('/auth/me')) {entered.resolve();return pending.promise;}
    throw new Error('unexpected path');
  };
  setBearerToken(null);
  const client=createApiClient({baseUrl:'http://synthetic.invalid/api',fetchImpl});
  const login=loginWithServer('B-SYNTH','SyntheticSecret9',client);
  try {
    await entered.promise;
    assert.equal(getBearerToken(),'OLD_TOKEN');
    setBearerToken(null); // logout while /me is still in flight
    pending.resolve(success(me));
    await assert.rejects(login,/Session changed during verification/);
    assert.equal(getBearerToken(),null);
  } finally {setBearerToken(null);}
});

test('old login failure never revokes a newer token installed before its /auth/me returned',async()=>{
  const pending=deferred<Response>();
  const entered=deferred<void>();
  const client=createApiClient({baseUrl:'/api',fetchImpl:async(url)=>{
    if(url.endsWith('/auth/login')) return success(loginBody);
    if(url.endsWith('/auth/me')){entered.resolve();return pending.promise;}
    throw new Error('unexpected path');
  }});
  setBearerToken(null);
  const login=loginWithServer('B-SYNTH','SyntheticSecret9',client);
  try {
    await entered.promise;
    setBearerToken('NEW_TOKEN');
    pending.resolve(success({...me,role:'director'}));
    await assert.rejects(login);
    assert.equal(getBearerToken(),'NEW_TOKEN');
  } finally {setBearerToken(null);}
});

test('delayed logout must not erase a newer Bearer session',async()=>{
  const pending=deferred<Response>();
  const entered=deferred<void>();
  let sentToken='';
  const client=createApiClient({baseUrl:'/api',fetchImpl:async(_url,init)=>{
    sentToken=new Headers(init?.headers).get('authorization')??'';
    entered.resolve();return pending.promise;
  }});
  setBearerToken('LOGOUT_OLD');
  const task=logoutFromServer(client);
  try{
    await entered.promise;
    setBearerToken('NEW_ACTIVE_TOKEN');
    pending.resolve(success({}));
    await task;
    assert.equal(sentToken,'Bearer LOGOUT_OLD');
    assert.equal(getBearerToken(),'NEW_ACTIVE_TOKEN');
  }finally{setBearerToken(null);}
});

test('delayed password change cannot invalidate a different active session',async()=>{
  const pending=deferred<Response>();
  const entered=deferred<void>();
  const client=createApiClient({baseUrl:'/api',fetchImpl:async()=>{entered.resolve();return pending.promise;}});
  setBearerToken('CHANGE_OLD');
  const changing=changeSecretWithServer('SyntheticSecret9','NewSyntheticSecret10',client);
  try{
    await entered.promise;
    setBearerToken('NEW_ACTIVE_TOKEN');
    pending.resolve(success({account:{...account,mustChangeSecret:false}}));
    await assert.rejects(changing,/Session changed during secret update/);
    assert.equal(getBearerToken(),'NEW_ACTIVE_TOKEN');
  }finally{setBearerToken(null);}
});

function sourceWithBooks(count:number):{source:PilotBootstrapSource,metrics:{links:number}} {
  const metrics={links:0};
  const transactions=Array.from({length:count},(_,i)=>({id:`test-tx-${i}`}) as Transaction);
  const source:PilotBootstrapSource={
    kind:'api',
    async loadEmployees(){return [];},
    async loadTransactions(){return transactions;},
    async loadDailySituations(){return [];},
    async loadLeaves(){return [];},
    async loadTimePermissions(){return [];},
    async loadAssignments(){return [];},
    async loadCourses(){return [];},
    async loadLinksByTransaction(id){
      metrics.links++;
      return [{id:`link-${id}`,transactionId:id,employeeId:'synthetic-employee'}] as TransactionEmployee[];
    },
  };
  return {source,metrics};
}

test('session revoked during parallel resource loading fails startup without reading any links',async()=>{
  const {source,metrics}=sourceWithBooks(32);
  let active=true;
  source.loadTransactions=async()=>{active=false;return Array.from({length:32},(_,i)=>({id:`tx-${i}`}) as Transaction);};
  await assert.rejects(loadPilotStartupData(source,'admin',()=>active),/PILOT_STARTUP_SESSION_CHANGED/);
  assert.equal(metrics.links,0);
});

test('session revoked during link reads blocks remaining fanout and rejects partial data',async()=>{
  const {source,metrics}=sourceWithBooks(60);
  let active=true;
  const pending=deferred<void>();
  const started=deferred<void>();
  source.loadLinksByTransaction=async(id)=>{
    metrics.links++;
    if(metrics.links===8) started.resolve();
    await pending.promise;
    return [{id:`link-${id}`,transactionId:id,employeeId:'synthetic'}] as TransactionEmployee[];
  };
  const loading=loadPilotStartupData(source,'employee',()=>active);
  await started.promise;
  assert.equal(metrics.links,8);
  active=false;
  pending.resolve();
  await assert.rejects(loading,/PILOT_STARTUP_SESSION_CHANGED/);
  assert.equal(metrics.links,8,'no link requests started after session invalidation');
});

test('App guards success and failure paths with the initiating session identity',()=>{
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/const generation = sessionGeneration\.current/);
  assert.match(app,/const token = isLocalDemo \? null : getBearerToken\(\)/);
  assert.match(app,/const isCurrent = \(\) => !cancelled/);
  assert.match(app,/getBearerToken\(\) === token/);
  assert.match(app,/if \(!isCurrent\(\)\) return/);
  assert.match(app,/if \(isCurrent\(\)\) \{/);
  assert.match(app,/isCurrent, \/\/ never process data/);
  assert.match(app,/generation !== sessionGeneration\.current \|\| getBearerToken\(\) === null/);
});
