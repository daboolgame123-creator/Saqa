/** Bridge verification: actual Express /auth routes and migrated PostgreSQL,
 * real fetch over localhost with synthetic data (never institutional DB).
 */
import assert from 'node:assert/strict';
import {after,before,beforeEach,describe,it} from 'node:test';
import type {Pool} from 'pg';
import {createApiClient,ApiError} from '../../../src/api/apiClient';
import {getBearerToken,setBearerToken} from '../../../src/api/sessionToken';
import {loginWithServer,logoutFromServer} from '../../../src/api/pilotAuth';
import {newRegisteredAccount} from './apiTestData';
import {resetDomainTables} from '../db/testDb';
import {startApiSuite,stopApiSuite,type ApiTestSuite} from './apiTestSuite';

describe('pilot: browser-style auth bridge to real API and PostgreSQL',()=>{
  let suite:ApiTestSuite;
  let pool:Pool;
  before(async()=>{suite=await startApiSuite();pool=suite.pool;});
  after(async()=>{setBearerToken(null);await stopApiSuite(suite);});
  beforeEach(async()=>{setBearerToken(null);await resetDomainTables(pool);});

  it('login -> /me -> authorized employees -> real logout -> 401',async()=>{
    const {account}=await newRegisteredAccount(suite.context,{
      badgeNumber:'PILOT-01',phone:'07710000001',secret:'PilotSecret9',
    });
    const client=createApiClient({baseUrl:suite.baseUrl+'/api'});
    const logged=await loginWithServer(account.username,'PilotSecret9',client);
    assert.equal(logged.id,account.id);
    assert.equal(logged.employeeId,account.employeeId);
    assert.equal(logged.role,'employee');
    assert.ok(getBearerToken()?.length);
    const employees=await client.get<unknown[]>('/employees');
    assert.ok(Array.isArray(employees));
    await logoutFromServer(client);
    assert.equal(getBearerToken(),null);
    await assert.rejects(client.get('/employees'),error=>error instanceof ApiError && error.status===401);
  });

  it('incorrect login fails and never gives the frontend an authorized adapter session',async()=>{
    const {account}=await newRegisteredAccount(suite.context,{
      badgeNumber:'PILOT-02',phone:'07710000002',secret:'PilotSecret9',
    });
    const client=createApiClient({baseUrl:suite.baseUrl+'/api'});
    await assert.rejects(loginWithServer(account.username,'WrongSecret9',client),ApiError);
    assert.equal(getBearerToken(),null);
  });
});
