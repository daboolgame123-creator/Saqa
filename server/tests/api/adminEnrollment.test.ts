/**
 * C15 — in-person administrator-assisted account activation.
 * Uses real HTTP sessions, RBAC and an actual migrated disposable PostgreSQL
 * cluster. No SMS, institutional accounts, fake authorizations or public issue.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createAdminOtpProvider, createOtpProvider } from '../../src/auth/otpProvider';
import { createAuthServiceOnPool } from '../../src/auth/authService';
import { createAuthRouter } from '../../src/auth/authRoutes';
import { useAuthService } from '../../src/auth/serviceContext';
import { useApiServices } from '../../src/api/serviceContext';
import { createApiRouter } from '../../src/api/routes';
import { createErrorHandler, notFoundHandler } from '../../src/middleware';
import { resetDomainTables } from '../db/testDb';
import { listenApp, type RunningApp } from '../helpers';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import {
  newAuthenticatedAccount, newEmployeeWithIdentity, issueOtp,
} from './apiTestData';
import { postJson, getJson, requestWithToken, useTestSession } from './apiTestHelpers';

const ADMIN_SECRET = 'C15-Admin-Secret';
const EMPLOYEE_SECRET = 'C15-Employee-Secret';
const ISSUE_PATH = '/api/auth/registration/admin-issue';
const VERIFY_PATH = '/api/auth/registration/verify';

describe('C15: administrator-only in-person registration, production-compatible OTP',()=>{
  let suite: ApiTestSuite;
  let adminMode: RunningApp;
  let seq = 0;
  before(async()=>{
    suite=await startApiSuite();
    const app=express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.use(useApiServices(suite.context.services));
    app.use(useAuthService(createAuthServiceOnPool(suite.pool,createAdminOtpProvider())));
    app.use('/api/auth',createAuthRouter());
    app.use('/api',createApiRouter());
    app.use(notFoundHandler);
    app.use(createErrorHandler({exposeDetails:true}));
    adminMode=await listenApp(app);
  });
  after(async()=>{
    try{if(adminMode)await adminMode.shutdown();}
    finally{useTestSession(null);if(suite)await stopApiSuite(suite);}
  });
  beforeEach(async()=>{
    await resetDomainTables(suite.pool);
    useTestSession(null);
  });
  async function fixtures(){
    seq++;
    const admin=await newAuthenticatedAccount(suite.context,{
      role:'admin',badgeNumber:'C15-ADMIN-'+seq,
      phone:'077000030'+String(seq).padStart(2,'0'),
      secret:ADMIN_SECRET,name:'Synthetic approving admin',
    });
    useTestSession(null);
    const employee=await newEmployeeWithIdentity(suite.context,{
      badgeNumber:'C15-STAFF-'+seq,
      phone:'077000040'+String(seq).padStart(2,'0'),
      name:'Synthetic eligible employee',
    });
    return {admin,employee};
  }
  function issue(token:string,employee:{badgeNumber:string;phone:string}){
    useTestSession(token);
    return postJson<{code:string;expiresInMinutes:number}|{error:{code:string}}>(
      adminMode.baseUrl,ISSUE_PATH,
      {badgeNumber:employee.badgeNumber,phone:employee.phone},
    );
  }
  async function activate(employee:{phone:string},code:string,secret=EMPLOYEE_SECRET){
    useTestSession(null);
    return postJson<{account:{id:string;role:string;username:string}}|{error:{code:string}}>(
      adminMode.baseUrl,VERIFY_PATH,{phone:employee.phone,code,secret},
    );
  }

  it('production selects admin mode; log/no provider still fails closed and never prints code',async()=>{
    const provider=createOtpProvider({NODE_ENV:'production',AUTH_OTP_PROVIDER:'admin'});
    assert.equal(provider.name,'admin');
    await assert.rejects(provider.send({phone:'07700000000',code:'123456',purpose:'registration'}),
      /authorized in-person endpoint/);
    assert.throws(()=>createOtpProvider({NODE_ENV:'production',AUTH_OTP_PROVIDER:'log'}));
    assert.throws(()=>createOtpProvider({NODE_ENV:'production'}));
  });

  it('public phone self-registration and phone recovery are forbidden in admin mode',async()=>{
    const {employee}=await fixtures();
    useTestSession(null);
    for(const [path,body] of [
      ['/api/auth/registration/otp',{badgeNumber:employee.badgeNumber,phone:employee.phone}],
      ['/api/auth/recovery/otp',{phone:employee.phone}],
      ['/api/auth/recovery/verify',{phone:employee.phone,code:'123456',secret:EMPLOYEE_SECRET}],
    ] as const){
      const denied=await postJson<{error:{code:string}}>(adminMode.baseUrl,path,body);
      assert.equal(denied.status,403,path);
      assert.equal(denied.body.error.code,'ADMIN_VERIFICATION_REQUIRED');
    }
    assert.equal((await suite.pool.query('SELECT id FROM auth_otp_codes')).rowCount,0);
  });

  it('unverified caller, employee and director cannot issue an activation code',async()=>{
    const {admin,employee}=await fixtures();
    const actor=await newAuthenticatedAccount(suite.context,{
      role:'employee',badgeNumber:'C15-OTHER-'+seq,
      phone:'077000050'+String(seq).padStart(2,'0'),secret:ADMIN_SECRET,
    });
    const director=await newAuthenticatedAccount(suite.context,{
      role:'director',badgeNumber:'C15-DIR-'+seq,
      phone:'077000060'+String(seq).padStart(2,'0'),secret:ADMIN_SECRET,
    });
    for(const [token,code] of [
      [null,'AUTHENTICATION_REQUIRED'],
      [actor.sessionToken,'PERMISSION_DENIED'],
      [director.sessionToken,'PERMISSION_DENIED'],
    ] as const){
      const denied=await requestWithToken<{error:{code:string}}>(
        adminMode.baseUrl,ISSUE_PATH,{
          method:'POST',token,body:{badgeNumber:employee.badgeNumber,phone:employee.phone},
        },
      );
      assert.equal(denied.status,token===null?401:403);
      assert.equal(denied.body?.error.code,code);
    }
    assert.equal((await suite.pool.query('SELECT id FROM auth_otp_codes')).rowCount,0);
    assert.ok(admin.sessionToken);
  });

  it('admin approves physically verified active employee; one-use 5 minute code activates employee-only account',async()=>{
    const {admin,employee}=await fixtures();
    const approved=await issue(admin.sessionToken,employee);
    assert.equal(approved.status,200,JSON.stringify(approved.body));
    assert.match((approved.body as {code:string}).code,/^[0-9]{6}$/);
    assert.equal((approved.body as {expiresInMinutes:number}).expiresInMinutes,5);
    assert.equal((await suite.pool.query('SELECT id FROM users')).rowCount,1,'only admin exists before activation');
    const code=(approved.body as {code:string}).code;
    const activated=await activate(employee,code);
    assert.equal(activated.status,201,JSON.stringify(activated.body));
    const account=(activated.body as {account:{role:string;username:string}}).account;
    assert.equal(account.role,'employee');
    assert.equal(account.username,employee.badgeNumber);
    assert.equal((await activate(employee,code,'Another-Secret')).status,400,'replay must be denied');
    useTestSession(null);
    const login=await postJson<{sessionToken:string;account:{role:string}}>(
      adminMode.baseUrl,'/api/auth/login',
      {identifier:employee.badgeNumber,secret:EMPLOYEE_SECRET},
    );
    assert.equal(login.status,200);
    assert.equal(login.body.account.role,'employee');
    assert.ok(login.body.sessionToken.length>20);
    const log=await suite.pool.query<{data:string}>(
      'SELECT row_to_json(a)::text AS data FROM audit_logs a',
    );
    assert.ok(log.rows.some(r=>r.data.includes('admin_approved')),'approval audit is present');
    assert.ok(log.rows.every(r=>!r.data.includes(code)),'raw code must never appear in audit');
    const rows=await suite.pool.query<{codeHash:string}>(
      'SELECT code_hash AS "codeHash" FROM auth_otp_codes WHERE employee_id=$1',
      [employee.id],
    );
    assert.ok(rows.rows.every(r=>r.codeHash.startsWith('admin:')));
    assert.ok(rows.rows.every(r=>!r.codeHash.includes(code)));
  });

  it('reissue invalidates earlier code; wrong code and expired code cannot activate',async()=>{
    const {admin,employee}=await fixtures();
    const a=await issue(admin.sessionToken,employee);
    const b=await issue(admin.sessionToken,employee);
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    const first=(a.body as {code:string}).code;
    const second=(b.body as {code:string}).code;
    // Extremely unlikely 1-in-1e6 collision; if equal the prior code was
    // invalidated, but the same numerical value is technically still valid.
    if(first!==second)assert.equal((await activate(employee,first)).status,400);
    await suite.pool.query(
      "UPDATE auth_otp_codes SET expires_at=now()-interval '1 minute' WHERE employee_id=$1",
      [employee.id],
    );
    assert.equal((await activate(employee,second)).status,400);
    const existing=await suite.pool.query('SELECT id FROM users WHERE employee_id=$1',[employee.id]);
    assert.equal(existing.rowCount,0);
  });

  it('historical test/log provider codes cannot be consumed after admin-mode cutover',async()=>{
    const {employee}=await fixtures();
    const oldCode=await issueOtp(suite.context,employee.phone,'registration',employee.badgeNumber);
    const rejected=await activate(employee,oldCode);
    assert.equal(rejected.status,400);
    assert.equal((rejected.body as {error:{code:string}}).error.code,'OTP_INVALID');
    const exists=await suite.pool.query('SELECT id FROM users WHERE employee_id=$1',[employee.id]);
    assert.equal(exists.rowCount,0);
  });

  it('employee moving to former status before activation fails closed',async()=>{
    const {admin,employee}=await fixtures();
    const approved=await issue(admin.sessionToken,employee);
    await suite.pool.query("UPDATE employees SET status='former' WHERE id=$1",[employee.id]);
    const result=await activate(employee,(approved.body as {code:string}).code);
    assert.equal(result.status,400);
    assert.equal((await suite.pool.query('SELECT id FROM users WHERE employee_id=$1',[employee.id])).rowCount,0);
  });

  it('parallel registration verification accepts only one winner',async()=>{
    const {admin,employee}=await fixtures();
    const approved=await issue(admin.sessionToken,employee);
    const code=(approved.body as {code:string}).code;
    useTestSession(null);
    const request=(secret:string)=>postJson(adminMode.baseUrl,VERIFY_PATH,
      {phone:employee.phone,code,secret});
    const responses=await Promise.all([request('C15-WINNER-ONE'),request('C15-WINNER-TWO')]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,400]);
    assert.equal((await suite.pool.query('SELECT id FROM users WHERE employee_id=$1',[employee.id])).rowCount,1);
  });

  it('admin can reset using verified official badge while non-admin requests are denied',async()=>{
    const {admin,employee}=await fixtures();
    const target=await newAuthenticatedAccount(suite.context,{
      role:'employee',badgeNumber:'C15-RESET-TARGET-'+seq,
      phone:'077000070'+String(seq).padStart(2,'0'),
      secret:EMPLOYEE_SECRET,
    });
    useTestSession(target.sessionToken);
    const denied=await postJson<{error:{code:string}}>(
      adminMode.baseUrl,'/api/auth/accounts/by-badge/reset',
      {badgeNumber:target.account.username},
    );
    assert.equal(denied.status,403);
    assert.equal(denied.body.error.code,'PERMISSION_DENIED');
    useTestSession(admin.sessionToken);
    const success=await postJson<{temporarySecret:string;account:{id:string}}>(
      adminMode.baseUrl,'/api/auth/accounts/by-badge/reset',
      {badgeNumber:target.account.username},
    );
    assert.equal(success.status,200);
    assert.equal(success.body.account.id,target.account.id);
    assert.ok(success.body.temporarySecret.length>=8);
    const previous=await requestWithToken(adminMode.baseUrl,'/api/auth/me',{
      token:target.sessionToken,
    });
    assert.equal(previous.status,401);
    assert.ok(employee.badgeNumber);
  });

  it('admin reset recovers credential, revokes sessions, and forces own-secret change',async()=>{
    const {admin,employee}=await fixtures();
    const approved=await issue(admin.sessionToken,employee);
    const activation=await activate(employee,(approved.body as {code:string}).code);
    assert.equal(activation.status,201);
    const userId=(activation.body as {account:{id:string}}).account.id;
    useTestSession(null);
    const logged=await postJson<{sessionToken:string}>(adminMode.baseUrl,'/api/auth/login',
      {identifier:employee.badgeNumber,secret:EMPLOYEE_SECRET});
    assert.equal(logged.status,200);
    useTestSession(admin.sessionToken);
    const reset=await postJson<{temporarySecret:string}>(adminMode.baseUrl,
      '/api/auth/accounts/'+userId+'/reset');
    assert.equal(reset.status,200);
    assert.ok(reset.body.temporarySecret.length>=8);
    const old=await requestWithToken(adminMode.baseUrl,'/api/auth/me',
      {token:logged.body.sessionToken});
    assert.equal(old.status,401);
    useTestSession(null);
    const tmp=await postJson<{sessionToken:string;mustChangeSecret:boolean}>(
      adminMode.baseUrl,'/api/auth/login',
      {identifier:employee.badgeNumber,secret:reset.body.temporarySecret});
    assert.equal(tmp.status,200);
    assert.equal(tmp.body.mustChangeSecret,true);
    const forbidden=await requestWithToken(adminMode.baseUrl,'/api/employees',
      {token:tmp.body.sessionToken});
    assert.equal(forbidden.status,403);
    const changed=await requestWithToken<{account:{mustChangeSecret:boolean}}>(
      adminMode.baseUrl,'/api/auth/secret',{
        method:'POST',token:tmp.body.sessionToken,
        body:{currentSecret:reset.body.temporarySecret,newSecret:'C15-New-Personal-Secret'},
      });
    assert.equal(changed.status,200);
    assert.equal(changed.body?.account.mustChangeSecret,false);
  });
});
