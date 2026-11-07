/** Phase 23/C1c-S2 — incoming-only authorization unit/negative tests.
 * This source remains inaccessible over HTTP (503 REPORTS_UNAVAILABLE).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import { buildTransactionsQuery, PgReportRepository } from '../src/repositories/reportRepository';
import { ReportApiService } from '../src/api/services/reportService';
import type { ReportAccessContext } from '../src/repositories/contracts';

const owner = reportAccessFor({role:'employee',employeeId:'synthetic-a'});
const admin = reportAccessFor({role:'admin',employeeId:null});
const director = reportAccessFor({role:'director',employeeId:null});

test('C1c-S2: incoming only uses bound employee scope and excludes daily/deleted',()=>{
  const sql=buildTransactionsQuery('incoming',{reportType:'incoming'},[],owner,'Asia/Baghdad');
  assert.match(sql.sql,/t.direction = 'وارد'/);
  assert.match(sql.sql,/t.is_daily_situation = false/);
  assert.match(sql.sql,/t.deleted_at IS NULL/);
  assert.match(sql.sql,/transaction_availability/);
  assert.match(sql.sql,/a.revoked_at IS NULL/);
  assert.ok(!sql.sql.includes('synthetic-a'));
  assert.deepEqual(sql.params, [['PublicToEmployees'],'SpecificEmployees','synthetic-a']);
  for(const type of ['monthly','outgoing','situation'] as const){
    assert.throws(()=>buildTransactionsQuery(type,{reportType:type},[],owner,'Asia/Baghdad'),
      ReportScopeNotReadyError);
  }
  assert.match(buildTransactionsQuery('incoming',{reportType:'incoming'},[],admin,null).sql,/TRUE/);
  assert.match(buildTransactionsQuery('incoming',{reportType:'incoming'},[],director,null).sql,/TRUE/);
});

test('C1c-S2: forged visibility/availability/identity rejected before SQL',async()=>{
  const forbidden=[
    {...owner,employeeId:'synthetic-b'},
    {...owner,personnelScope:{kind:'all'}},
    {...owner,requestScope:{kind:'owner',ownerEmployeeId:'synthetic-b'}},
    {...owner,transactionScope:null},
    {...owner,transactionScope:{...owner.transactionScope,availableToEmployeeId:'synthetic-b'}},
    {...owner,transactionScope:{...owner.transactionScope,visibilityIn:['Administrative']}},
    {...owner,transactionScope:{...owner.transactionScope,visibilityIn:['PublicToEmployees','Administrative']}},
    {...owner,transactionScope:{...owner.transactionScope,availabilityScope:'Administrative'}},
    {...owner,transactionScope:{...owner.transactionScope,excludeDailySituations:false}},
  ] as ReportAccessContext[];
  let reads=0;
  const repo=new PgReportRepository({
    async query(){reads++;throw Error('FORBIDDEN_DB_READ');},
    async connect(){reads++;throw Error('FORBIDDEN_DB_CONNECT');},
  } as never,'Asia/Baghdad');
  const service=new ReportApiService(repo);
  for(const access of forbidden){
    const params: unknown[]=[];
    assert.throws(()=>buildTransactionsQuery('incoming',{reportType:'incoming'},params,access,'Asia/Baghdad'),
      ReportScopeNotReadyError);
    assert.deepEqual(params,[]);
    await assert.rejects(repo.list('incoming',{reportType:'incoming'},access),ReportScopeNotReadyError);
    await assert.rejects(service.run({reportType:'incoming'},access),ReportScopeNotReadyError);
    await assert.rejects(service.export({reportType:'incoming'},access,'excel'),ReportScopeNotReadyError);
  }
  assert.equal(reads,0);
});

test('C1c-S2: employee filter narrows, never grants access',()=>{
  const sql=buildTransactionsQuery('incoming',{reportType:'incoming',employee:'synthetic-b'},[],
    owner,'Asia/Baghdad');
  assert.match(sql.sql,/EXISTS \(/);
  assert.deepEqual(sql.params.slice(0,1),['synthetic-b']);
  assert.ok(sql.params.includes('synthetic-a'));
  assert.ok(sql.params.includes('SpecificEmployees'));
});
