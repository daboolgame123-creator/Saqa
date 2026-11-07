/** Pilot web client login contract: purely synthetic; no credentials in storage. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError, createApiClient, type FetchLike } from '../../src/api/apiClient';
import { getBearerToken, invalidateBearerToken, onBearerInvalidated, setBearerToken } from '../../src/api/sessionToken';
import {
  loginWithServer, logoutFromServer, changeSecretWithServer,
  userFromServerAccount, validateLoginResult,
} from '../../src/api/pilotAuth';
import { PilotLoginScreen, PilotChangeSecretScreen } from '../../src/components/views/PilotAuthScreens';
import { Header } from '../../src/components/layout/Header';

const account={id:'account-1',employeeId:'employee-1',username:'BADGE-1',displayName:'منتسب تجريبي',
  role:'employee' as const,status:'active' as const,mustChangeSecret:false};
const good={
  account,sessionToken:'TEST_TOKEN_ONLY',mustChangeSecret:false,
};
const me={userId:account.id,employeeId:account.employeeId,username:account.username,
  displayName:account.displayName,role:account.role};

function fakeFetch(behavior:(path:string,authorization:string|null)=>{status:number,body?:unknown}) {
  const seen:Array<{url:string,authorization:string|null}>=[];
  const fetchImpl:FetchLike=async(url,init)=>{
    const authorization=new Headers(init?.headers).get('authorization');
    seen.push({url,authorization});
    const result=behavior(url,authorization);
    return {ok:result.status>=200&&result.status<300,status:result.status,
      text:async()=>result.body===undefined?'':JSON.stringify(result.body)} as Response;
  };
  return {seen,client:createApiClient({baseUrl:'http://test.invalid/api',fetchImpl})};
}

test('pilot auth: real login verifies /me and attaches volatile Bearer to subsequent API calls',async()=>{
  setBearerToken(null);
  const f=fakeFetch((url,authorization)=>{
    if(url.endsWith('/auth/login')){assert.equal(authorization,null);return{status:200,body:good};}
    if(url.endsWith('/auth/me')){assert.equal(authorization,'Bearer TEST_TOKEN_ONLY');return{status:200,body:me};}
    if(url.endsWith('/employees'))return{status:200,body:[]};
    return {status:404};
  });
  try {
    const signed=await loginWithServer(' BADGE-1 ','ExampleSecret1',f.client);
    assert.deepEqual(signed,account);
    assert.equal(userFromServerAccount(signed).employeeId,'employee-1');
    assert.equal(getBearerToken(),'TEST_TOKEN_ONLY');
    assert.deepEqual(await f.client.get('/employees'),[]);
    assert.deepEqual(f.seen.map(x=>x.url.split('/').at(-1)),['login','me','employees']);
  } finally {setBearerToken(null);}
});

test('pilot auth: unknown, inactive, inconsistent and ownerless accounts fail closed',async()=>{
  for(const patch of [
    {role:'archivist'}, {role:'responsible'}, {status:'frozen'},
    {employeeId:null},{id:''},{username:''},{mustChangeSecret:'yes'},
  ]) {
    assert.throws(()=>validateLoginResult({...good,account:{...account,...patch}}));
  }
  assert.throws(()=>validateLoginResult({...good,mustChangeSecret:true}));
  setBearerToken(null);
  const mismatch=fakeFetch((url)=>url.endsWith('/auth/login')?{status:200,body:good}:
    {status:200,body:{...me,employeeId:'foreign-owner'}});
  await assert.rejects(loginWithServer('BADGE-1','ExampleSecret1',mismatch.client),/mismatch/);
  assert.equal(getBearerToken(),null);
});

test('pilot auth: 401 invalidates the same token and notifies UI, without local fallback',async()=>{
  setBearerToken('EXPIRED_SESSION');
  let expired=0;
  const unsubscribe=onBearerInvalidated(()=>{expired++;});
  const f=fakeFetch(()=>({status:401,body:{error:{code:'AUTH_REQUIRED',message:'انتهت الجلسة'}}}));
  try{
    await assert.rejects(f.client.get('/employees'),e=>e instanceof ApiError && e.status===401);
    assert.equal(getBearerToken(),null);
    assert.equal(expired,1);
    assert.equal(f.seen[0].authorization,'Bearer EXPIRED_SESSION');
  }finally{unsubscribe();setBearerToken(null);}
});

test('pilot auth: logout revokes server session and erases memory even on network error',async()=>{
  setBearerToken('TOKEN_LOGOUT');
  let invalidated=0;
  const unsubscribe=onBearerInvalidated(()=>invalidated++);
  try{
    const goodClient=fakeFetch((url,auth)=>{
      assert.ok(url.endsWith('/auth/logout'));
      assert.equal(auth,'Bearer TOKEN_LOGOUT');
      return {status:204};
    });
    await logoutFromServer(goodClient.client);
    assert.equal(getBearerToken(),null);
    assert.equal(invalidated,1);
    setBearerToken('TOKEN_NETWORK_DOWN');
    const badClient=createApiClient({baseUrl:'/api',fetchImpl:async()=>{throw new Error('disconnected');}});
    await assert.rejects(logoutFromServer(badClient),ApiError);
    assert.equal(getBearerToken(),null);
    assert.equal(invalidated,2);
  }finally{unsubscribe();setBearerToken(null);}
});

test('pilot auth: required secret change revokes old token, and errors never bypass guard',async()=>{
  setBearerToken('CHANGE_TOKEN');
  const client=fakeFetch((url,auth)=>{
    assert.ok(url.endsWith('/auth/secret'));
    assert.equal(auth,'Bearer CHANGE_TOKEN');
    return {status:200,body:{account:{...account,mustChangeSecret:false}}};
  });
  await changeSecretWithServer('CurrentSecret1','NextSecret2',client.client);
  assert.equal(getBearerToken(),null);
  setBearerToken('CHANGE_TOKEN');
  const denied=fakeFetch(()=>({status:400,body:{error:{code:'VALIDATION_ERROR'}}}));
  await assert.rejects(changeSecretWithServer('short','short',denied.client),ApiError);
  assert.equal(getBearerToken(),'CHANGE_TOKEN');
  setBearerToken(null);
});

test('pilot auth: login screen and official header have no mock role-switch controls',()=>{
  const loginMarkup=renderToStaticMarkup(React.createElement(PilotLoginScreen,{onLogin:async()=>{}}));
  const changeMarkup=renderToStaticMarkup(React.createElement(PilotChangeSecretScreen,{onChangeSecret:async()=>{}}));
  assert.match(loginMarkup,/السقاية — تسجيل الدخول/);
  assert.match(loginMarkup,/type="password"/);
  assert.doesNotMatch(loginMarkup,/role-archivist|role-director/);
  assert.match(changeMarkup,/تغيير الرمز السري مطلوب/);
  const headerMarkup=renderToStaticMarkup(React.createElement(Header,{
    currentView:'transactions',setCurrentView:()=>{},onOpenNewModal:()=>{},transactions:[],
    userRole:'employee',setUserRole:()=>{},allowRoleSwitch:false,
    sessionDisplayName:account.displayName,onLogout:()=>{},onMarkAllAsRead:()=>{},
    isDarkMode:false,onToggleDarkMode:()=>{},onOpenSearch:()=>{},
  }));
  assert.ok(headerMarkup.includes('btn-session-logout'));
  assert.ok(headerMarkup.includes(account.displayName));
  assert.doesNotMatch(headerMarkup,/id="role-director"|id="role-archivist"|id="role-admin"|id="role-employee"/);
  const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/if \(!isLocalDemo && serverAccount === null\)/);
  assert.match(app,/if \(!isLocalDemo && serverAccount\?\.mustChangeSecret === true\)/);
  assert.match(app,/allowRoleSwitch=\{isLocalDemo\}/);
  const token=readFileSync(new URL('../../src/api/sessionToken.ts',import.meta.url),'utf8');
  assert.doesNotMatch(token,/localStorage|sessionStorage|document\.cookie|window\.name/);
});
