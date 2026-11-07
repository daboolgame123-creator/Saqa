/** Synthetic concurrent-auth and delayed 401 regression — no real credentials. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createApiClient, ApiError, type FetchLike} from '../../src/api/apiClient';
import {getBearerToken,setBearerToken} from '../../src/api/sessionToken';
import {loginWithServer,logoutFromServer} from '../../src/api/pilotAuth';

function deferred<T>() {
  let resolve!: (value:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {promise,resolve};
}
const account={id:'synthetic-01',employeeId:'emp-01',username:'TEST-01',
  displayName:'منتسب اختبار',role:'employee' as const,status:'active' as const,mustChangeSecret:false};
const me={userId:account.id,employeeId:account.employeeId,username:account.username,
  displayName:account.displayName,role:account.role};
const loginResult=(token:string)=>({account,sessionToken:token,mustChangeSecret:false});
const ok=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json'},
});

test('two simultaneous logins have one server POST and never override the first verified account',async()=>{
  const pending=deferred<Response>();
  let posts=0;
  const fetchImpl:FetchLike=async(path)=>{
    if(path.endsWith('/auth/login')) {posts++;return pending.promise;}
    if(path.endsWith('/auth/me')) return ok(me);
    throw new Error('unexpected route');
  };
  const client=createApiClient({baseUrl:'http://synthetic.invalid/api',fetchImpl});
  setBearerToken(null);
  const first=loginWithServer('TEST-01','SyntheticSecret9',client);
  try{
    await assert.rejects(loginWithServer('TEST-02','SyntheticSecret9',client),
      /Existing or pending session must be closed first/);
    assert.equal(posts,1);
    pending.resolve(ok(loginResult('FIRST_TOKEN')));
    assert.deepEqual(await first,account);
    assert.equal(getBearerToken(),'FIRST_TOKEN');
  }finally{setBearerToken(null);}
});

test('logout before delayed login response prevents session resurrection',async()=>{
  const pending=deferred<Response>();
  let loginPosts=0;
  const client=createApiClient({baseUrl:'/api',fetchImpl:async(path)=>{
    if(path.endsWith('/auth/login')) {loginPosts++;return pending.promise;}
    if(path.endsWith('/auth/me')) throw new Error('stale login must not check me');
    throw new Error('unexpected path');
  }});
  setBearerToken(null);
  const first=loginWithServer('TEST-01','SyntheticSecret9',client);
  await logoutFromServer(client); // no active bearer yet, but cancels pending login
  pending.resolve(ok(loginResult('CANCELLED_TOKEN')));
  await assert.rejects(first,/Session changed during login/);
  assert.equal(loginPosts,1);
  assert.equal(getBearerToken(),null);
});

test('cancelled old login may finish after a new verified login without revoking the new token',async()=>{
  const firstPending=deferred<Response>();
  let loginPosts=0;
  const client=createApiClient({baseUrl:'/api',fetchImpl:async(path)=>{
    if(path.endsWith('/auth/login')){
      loginPosts++;
      return loginPosts===1 ? firstPending.promise : ok(loginResult('NEW_TOKEN'));
    }
    if(path.endsWith('/auth/me')) return ok(me);
    throw new Error('unexpected path');
  }});
  setBearerToken(null);
  const old=loginWithServer('TEST-01','SyntheticSecret9',client);
  try{
    await logoutFromServer(client); // cancel old pending authorization
    const fresh=await loginWithServer('TEST-01','SyntheticSecret9',client);
    assert.deepEqual(fresh,account);
    firstPending.resolve(ok(loginResult('OLD_TOKEN')));
    await assert.rejects(old,/Session changed during login/);
    assert.equal(loginPosts,2);
    assert.equal(getBearerToken(),'NEW_TOKEN');
  }finally{setBearerToken(null);}
});

test('logout erases the active session before its revocation HTTP response returns',async()=>{
  const pending=deferred<Response>();
  let authorization:string|null=null;
  const client=createApiClient({baseUrl:'/api',fetchImpl:async(path,opts)=>{
    assert.ok(path.endsWith('/auth/logout'));
    authorization=new Headers(opts?.headers).get('authorization');
    return pending.promise;
  }});
  setBearerToken('SIGN_OUT_TOKEN');
  const closing=logoutFromServer(client);
  assert.equal(authorization,'Bearer SIGN_OUT_TOKEN');
  assert.equal(getBearerToken(),null,'sign-out must be immediate, not wait for the network');
  pending.resolve(ok({}));
  await closing;
  assert.equal(getBearerToken(),null);
});

test('late 401 for old Bearer never invalidates a replacement user session',async()=>{
  const pending=deferred<Response>();
  const client=createApiClient({baseUrl:'/api',fetchImpl:async()=>pending.promise});
  setBearerToken('OLD_AUTH_TOKEN');
  const request=client.get('/employees');
  try{
    setBearerToken('NEW_AUTH_TOKEN');
    pending.resolve(ok({error:{code:'AUTH_REQUIRED',message:'synthetic'}},401));
    await assert.rejects(request,(error:unknown)=>
      error instanceof ApiError && error.status===401);
    assert.equal(getBearerToken(),'NEW_AUTH_TOKEN');
  }finally{setBearerToken(null);}
});
