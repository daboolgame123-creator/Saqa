/** URL query pagination regression, with real Express + migrated PostgreSQL. */
import assert from 'node:assert/strict';
import {after,before,beforeEach,describe,it} from 'node:test';
import {resetDomainTables} from '../db/testDb';
import {deleteJson,getJson} from './apiTestHelpers';
import {newAuthenticatedAccount,newTransaction} from './apiTestData';
import {startApiSuite,stopApiSuite,type ApiTestSuite} from './apiTestSuite';

describe('Phase 23: official archived/active URL pagination strings',()=>{
  let suite:ApiTestSuite;
  before(async()=>{suite=await startApiSuite();});
  after(async()=>{await stopApiSuite(suite);});
  beforeEach(async()=>{await resetDomainTables(suite.pool);});

  it('GET transaction list and admin archived list both parse limit=25&offset=0',async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'PAGE-ADMIN-01',phone:'07718880011',
      secret:'SyntheticPagingSecret9',role:'admin',
    });
    const first=await newTransaction(suite.context,{
      number:'PAGE-1',sequence:'PAGE-1',subject:'الأول للتجربة',
      visibility:'PublicToEmployees',
    });
    const second=await newTransaction(suite.context,{
      number:'PAGE-2',sequence:'PAGE-2',subject:'الثاني للأرشفة',
      visibility:'Administrative',
    });
    const visible=await getJson<unknown[]>(suite.baseUrl,'/api/transactions?limit=25&offset=0');
    assert.equal(visible.status,200);
    assert.ok(visible.body.some((r:any)=>r.id===first.id));
    assert.ok(visible.body.some((r:any)=>r.id===second.id));

    const one=await getJson<unknown[]>(suite.baseUrl,'/api/transactions?limit=1&offset=1');
    assert.equal(one.status,200);
    assert.equal(one.body.length,1);
    const archived=await deleteJson(suite.baseUrl,
      '/api/transactions/'+encodeURIComponent(second.id)+'?expectedVersion='+second.version);
    assert.equal(archived.status,200);
    assert.ok(archived.body);
    const page=await getJson<unknown[]>(suite.baseUrl,
      '/api/transactions/archived?limit=25&offset=0');
    assert.equal(page.status,200);
    assert.ok(Array.isArray(page.body));
    assert.equal(page.body.length,1);
    assert.equal((page.body[0] as any).id,second.id);
    assert.equal((page.body[0] as any).version,second.version+1);
    assert.ok((page.body[0] as any).deletedAt);
  });

  it('malformed, negative and unsafe URL pagination is rejected with HTTP 400',async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'PAGE-ADMIN-02',phone:'07718880012',
      secret:'SyntheticPagingSecret9',role:'admin',
    });
    for(const query of [
      'limit=0','limit=-1','limit=abc','limit=1.1','limit=01',
      'offset=-1','offset=abc','offset=1.1','offset=01',
      'limit=9007199254740993','offset=9007199254740993',
    ]){
      const a=await getJson(suite.baseUrl,'/api/transactions?'+query);
      const b=await getJson(suite.baseUrl,'/api/transactions/archived?'+query);
      assert.equal(a.status,400,'active route should reject '+query);
      assert.equal(b.status,400,'archived route should reject '+query);
    }
  });
});
