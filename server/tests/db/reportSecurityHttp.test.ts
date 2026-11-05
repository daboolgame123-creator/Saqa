/**
 * Phase 23 security review: REAL HTTP session middleware + permission guard
 * + reports 503 router, backed only by the embedded migrated test cluster.
 * This file does not enable reporting and never uses external DB credentials.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { startTestDatabase, stopTestDatabase } from './testDb';
import { startApiTestContext, useTestSession, type ApiTestContext } from '../api/apiTestHelpers';
import { newAuthenticatedAccount } from '../api/apiTestData';

describe('Phase 23 report route — real HTTP denial and service non-reachability', () => {
  let pool: Pool;
  let context: ApiTestContext;
  let adminToken: string;
  let directorToken: string;
  let employeeToken: string;

  before(async () => {
    ({ pool } = await startTestDatabase());
    context = await startApiTestContext(pool);
    const admin = await newAuthenticatedAccount(context,{
      role:'admin',badgeNumber:'P23-A',phone:'07795551001',name:'Report security admin',
    });
    const director = await newAuthenticatedAccount(context,{
      role:'director',badgeNumber:'P23-D',phone:'07795551002',name:'Report security director',
    });
    const employee = await newAuthenticatedAccount(context,{
      role:'employee',badgeNumber:'P23-E',phone:'07795551003',name:'Report security employee',
    });
    adminToken=admin.sessionToken;
    directorToken=director.sessionToken;
    employeeToken=employee.sessionToken;
    useTestSession(null);
  });

  after(async () => {
    try {
      if (context?.running) await context.running.shutdown();
    } finally {
      await stopTestDatabase();
      useTestSession(null);
    }
  });

  async function hit(method:string, path:string, token?:string) {
    const response = await fetch(context.baseUrl+path,{
      method,headers: token ? {authorization:'Bearer '+token} : {},
    });
    const text=await response.text();
    return {status:response.status,body: text ? JSON.parse(text) as {
      error?:{code?:string;message?:string};
      rows?:unknown;summary?:unknown;
    }:undefined};
  }
  function unavailable(response: Awaited<ReturnType<typeof hit>>, context:string) {
    assert.equal(response.status,503,context);
    assert.equal(response.body?.error?.code,'REPORTS_UNAVAILABLE',context);
    assert.ok(response.body?.rows === undefined && response.body?.summary === undefined,
      'Blocked report must not include any data or statistical metadata');
  }

  it('all valid roles receive 503 on valid and intentionally malformed report GETs', async t => {
    const serviceSpy=t.mock.method(context.services.report,'run', async () => {
      throw new Error('SECURITY FAILURE: report service reached behind HTTP 503');
    });
    const requests=[
      '/api/reports?reportType=monthly',
      '/api/reports?reportType=employees&employee=00000000-0000-0000-0000-000000000001',
      '/api/reports?reportType=requests&status=approved',
      '/api/reports?reportType=leaves&employee=some-other-person',
      '/api/reports?reportType=timePermissions&dateFrom=bad',
      '/api/reports?reportType=researchers',
      '/api/reports?reportType=circularsAndAcknowledgements',
      '/api/reports?reportType=nonexistent',
      '/api/reports/export?format=pdf',
    ];
    for(const [role,token] of [['admin',adminToken],['director',directorToken],['employee',employeeToken]] as const){
      for(const path of requests) unavailable(await hit('GET',path,token),role+' '+path);
    }
    assert.equal(serviceSpy.mock.callCount(),0,'No report service invocation is allowed');
  });

  it('administrative non-GET methods and arbitrary report subpaths remain unavailable',async t=>{
    const serviceSpy=t.mock.method(context.services.report,'run',async()=>{throw Error('Service reached');});
    for(const method of ['POST','PATCH','DELETE'] as const){
      unavailable(await hit(method,'/api/reports',adminToken),method+' root');
      unavailable(await hit(method,'/api/reports/export',adminToken),method+' export');
    }
    assert.equal(serviceSpy.mock.callCount(),0);
  });

  it('unauthenticated or invalid sessions are rejected upstream of report router',async t=>{
    const serviceSpy=t.mock.method(context.services.report,'run',async()=>{throw Error('Service reached');});
    for(const token of [undefined,'invalid-session']){
      const response=await hit('GET','/api/reports?reportType=employees',token);
      assert.equal(response.status,401);
      assert.notEqual(response.body?.error?.code,'REPORTS_UNAVAILABLE');
    }
    assert.equal(serviceSpy.mock.callCount(),0);
  });
});
