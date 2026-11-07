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

  it('limits unpaged active and archived SQL queries to 100 without hiding the next page',async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'PAGE-ADMIN-03',phone:'07718880013',
      secret:'SyntheticPagingSecret9',role:'admin',
    });
    await suite.pool.query(`INSERT INTO transactions
      (number, sequence, document_date, month, direction, category, sub_type, entity, subject)
      SELECT 'PG-' || n::text, 'PG-' || n::text, '2026-11-07'::date,
        '2026-11', 'وارد', 'إدارية', 'مراسلات', 'Fixture', 'Synthetic ' || n::text
      FROM generate_series(1,101) AS n`);
    const active=await getJson<any[]>(suite.baseUrl,'/api/transactions');
    const activeNext=await getJson<any[]>(suite.baseUrl,'/api/transactions?limit=100&offset=100');
    assert.equal(active.status,200);assert.equal(activeNext.status,200);
    assert.equal(active.body.length,100);assert.equal(activeNext.body.length,1);
    assert.equal(new Set([...active.body,...activeNext.body].map(r=>r.id)).size,101);
    await suite.pool.query('UPDATE transactions SET deleted_at=now()');
    const archived=await getJson<any[]>(suite.baseUrl,'/api/transactions/archived');
    const archivedNext=await getJson<any[]>(suite.baseUrl,'/api/transactions/archived?limit=100&offset=100');
    assert.equal(archived.status,200);assert.equal(archivedNext.status,200);
    assert.equal(archived.body.length,100);assert.equal(archivedNext.body.length,1);
    assert.equal(new Set([...archived.body,...archivedNext.body].map(r=>r.id)).size,101);
  });

  it('keyset survives archived first-page book and concurrent newer insertion', async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'CURSOR-ADMIN-01',phone:'07718880021',secret:'SyntheticPagingSecret9',role:'admin',
    });
    await suite.pool.query(`INSERT INTO transactions
      (number,sequence,document_date,month,direction,category,sub_type,entity,subject,created_at)
      SELECT 'CUR-'||n::text,'CUR-'||n::text,'2026-11-07'::date,
        '2026-11','وارد','إدارية','مراسلات','Fixture','Before '||n::text,
        now()-n*interval '1 second'
      FROM generate_series(1,101) AS n`);
    const first=await getJson<any[]>(suite.baseUrl,'/api/transactions/cursor?limit=100');
    assert.equal(first.status,200);
    assert.equal(first.body.length,100);
    const last=first.body[99];
    assert.match(last.createdAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    await suite.pool.query('UPDATE transactions SET deleted_at=now() WHERE id=$1',[first.body[0].id]);
    await suite.pool.query(`INSERT INTO transactions
      (number,sequence,document_date,month,direction,category,sub_type,entity,subject)
      VALUES ('NEW','NEW','2022-01-01','2022-01','وارد','إدارية','مراسلات','Fixture','New while paging')`);
    const path='/api/transactions/cursor?limit=100&cursorCreatedAt='
      +encodeURIComponent(last.createdAt)+'&cursorId='+encodeURIComponent(last.id);
    const next=await getJson<any[]>(suite.baseUrl,path);
    assert.equal(next.status,200);
    assert.equal(next.body.length,1);
    assert.equal(next.body[0].number,'CUR-101');
    assert.equal(new Set([...first.body,...next.body].map((r:any)=>r.id)).size,101);
  });

  it('cursor keeps full PostgreSQL microseconds at a 100-row boundary',async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'CURSOR-ADMIN-02',phone:'07718880022',secret:'SyntheticPagingSecret9',role:'admin',
    });
    await suite.pool.query(`INSERT INTO transactions
      (number,sequence,document_date,month,direction,category,sub_type,entity,subject,created_at)
      SELECT 'SAME-'||n::text,'SAME-'||n::text,'2026-11-07'::date,
        '2026-11','وارد','إدارية','مراسلات','Fixture','Same microsecond',
        '2026-11-07T13:37:01.123456Z'::timestamptz
      FROM generate_series(1,105) AS n`);
    const first=await getJson<any[]>(suite.baseUrl,'/api/transactions/cursor?limit=100');
    assert.equal(first.status,200);
    assert.equal(first.body.length,100);
    const last=first.body[99];
    assert.equal(last.createdAt,'2026-11-07T13:37:01.123456Z');
    const next=await getJson<any[]>(suite.baseUrl,
      '/api/transactions/cursor?limit=100&cursorCreatedAt='+encodeURIComponent(last.createdAt)
      +'&cursorId='+encodeURIComponent(last.id));
    assert.equal(next.status,200);
    assert.equal(next.body.length,5);
    assert.equal(new Set([...first.body,...next.body].map((r:any)=>r.id)).size,105);
  });

  it('cursor keeps employee SQL visibility scope and rejects invalid query controls',async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'CURSOR-ADMIN-03',phone:'07718880023',secret:'SyntheticPagingSecret9',role:'admin',
    });
    const hidden=await newTransaction(suite.context,{number:'HIDDEN',visibility:'Administrative'});
    const publicBook=await newTransaction(suite.context,{number:'PUBLIC',visibility:'PublicToEmployees'});
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'CURSOR-EMP-04',phone:'07718880024',secret:'SyntheticPagingSecret9',role:'employee',
    });
    const visible=await getJson<any[]>(suite.baseUrl,'/api/transactions/cursor?limit=100');
    assert.equal(visible.status,200);
    assert.ok(visible.body.some((row:any)=>row.id===publicBook.id));
    assert.ok(visible.body.every((row:any)=>row.id!==hidden.id));
    for(const query of [
      'cursorId='+publicBook.id,
      'cursorCreatedAt=2026-11-07T13%3A37%3A01.123456Z',
      'cursorCreatedAt=bad&cursorId='+publicBook.id,
      'cursorCreatedAt=2026-11-07T13%3A37%3A01.123456Z&cursorId=garbage',
      'offset=1','limit=101','archived=only',
    ]){
      const r=await getJson(suite.baseUrl,'/api/transactions/cursor?'+query);
      assert.equal(r.status,400,'reject '+query);
    }
  });

  it('malformed, negative and unsafe URL pagination is rejected with HTTP 400',async()=>{
    await newAuthenticatedAccount(suite.context,{
      badgeNumber:'PAGE-ADMIN-02',phone:'07718880012',
      secret:'SyntheticPagingSecret9',role:'admin',
    });
    for(const query of [
      'limit=0','limit=101','limit=999999','limit=-1','limit=abc','limit=1.1','limit=01',
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
