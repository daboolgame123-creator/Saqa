/** C1d-S1: no real personnel data; tests internal owner-only repository function.
 * This does NOT exercise PostgreSQL migrations, service, XLSX, HTTP or production.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import { ReportDateZoneRequiredError, ReportFilterUnavailableError } from '../src/repositories/reportRepository';
import { readOwnCircularAcknowledgements } from '../src/repositories/reportOwnCircularAcknowledgements';
import type { ReportAccessContext } from '../src/repositories/contracts';

const owner = reportAccessFor({ role: 'employee', employeeId: 'owner-synthetic' });
const filter = { reportType: 'circularsAndAcknowledgements' } as const;

function fixture(rows: Array<Record<string, unknown>>) {
  const queries: Array<{sql:string; params:unknown[]}> = [];
  const db = {
    async query(sql:string, params:unknown[]) {
      queries.push({sql,params});
      return {rows};
    },
  };
  return {db: db as never, queries};
}
const item = (overrides: Record<string, unknown> = {}) => ({
  transactionId: 'old-circular', title: 'موضوع تعميم اصطناعي',
  linkedEmployeeId: 'owner-synthetic',
  acknowledgedAt: new Date('2026-02-03T12:00:00Z'),
  timestampKey: '2026-02-03 12:00:00+00',
  inPeriod: true,
  ...overrides,
});

test('C1d-S1: own-only SQL constrains employee ID before any rows are fetched', async () => {
  const {db,queries}=fixture([item()]);
  const result=await readOwnCircularAcknowledgements(db, filter, owner, 'Asia/Baghdad');
  assert.deepEqual(result,[{
    transactionId:'old-circular',title:'موضوع تعميم اصطناعي',
    acknowledgedAt:'2026-02-03T12:00:00.000Z',
  }]);
  assert.equal(queries.length,1);
  assert.equal(queries[0].params[0],'owner-synthetic');
  assert.match(queries[0].sql,/vl\.employee_id = \$1/);
  assert.match(queries[0].sql,/vl\.acknowledged_at IS NOT NULL/);
  assert.match(queries[0].sql,/t\.deleted_at IS NULL/);
  assert.match(queries[0].sql,/t\.is_daily_situation = false/);
  assert.match(queries[0].sql,/PublicToEmployees/);
  assert.ok(!queries[0].sql.includes('session_ref'));
  assert.ok(!queries[0].sql.includes('vl.user_id AS'));
  assert.ok(!JSON.stringify(result).includes('owner-synthetic'));
});

test('C1d-S1: rejects forged role/scope and unsupported filters with zero DB calls', async () => {
  const {db,queries}=fixture([]);
  const malformed = [
    reportAccessFor({role:'admin', employeeId:null}),
    {...owner,employeeId:'another'},
    {...owner,personnelScope:{kind:'all'}},
    {...owner,requestScope:{kind:'all'}},
    {...owner,transactionScope:{...owner.transactionScope,availableToEmployeeId:'other'}},
    {...owner,transactionScope:{...owner.transactionScope,visibilityIn:['Administrative']}},
    undefined,
  ];
  for(const context of malformed) {
    await assert.rejects(
      readOwnCircularAcknowledgements(db,filter,context as ReportAccessContext,'Asia/Baghdad'),
      ReportScopeNotReadyError,
    );
  }
  for(const key of ['employee','type','source','section','documentDateFrom','documentDateTo'] as const){
    await assert.rejects(
      readOwnCircularAcknowledgements(db,{...filter,[key]:'intrusion'},owner,'Asia/Baghdad'),
      ReportFilterUnavailableError,
    );
  }
  await assert.rejects(readOwnCircularAcknowledgements(
    db,{...filter,dateFrom:'2026-02-01'},owner,null,
  ),ReportDateZoneRequiredError);
  assert.equal(queries.length,0);
});

test('C1d-S1: duplicate accounts collapse only for equal timestamps and unconflicted identity',async()=>{
  const {db}=fixture([
    item(),
    item({linkedEmployeeId:null}),
    item({transactionId:'second-circular',title:'موضوع آخر',
      acknowledgedAt:'2026-02-04T12:00:00Z',timestampKey:'2026-02-04 12:00:00+00'}),
  ]);
  const results=await readOwnCircularAcknowledgements(db,filter,owner,'Asia/Baghdad');
  assert.equal(results.length,2);
  assert.deepEqual(results.map(x=>x.transactionId),['old-circular','second-circular']);
});

test('C1d-S1: cross-period conflict and contradictory account identity never produce an invented acknowledgement',async()=>{
  const {db,queries}=fixture([
    item(),
    item({inPeriod:false,timestampKey:'2025-02-03 12:00:00+00',
      acknowledgedAt:'2025-02-03T12:00:00Z'}),
    item({transactionId:'different-circular',linkedEmployeeId:'another'}),
  ]);
  const results=await readOwnCircularAcknowledgements(
    db,{...filter,dateFrom:'2026-02-01',dateTo:'2026-02-28'},owner,'Asia/Baghdad',
  );
  assert.deepEqual(results,[]);
  assert.equal(queries.length,1);
  assert.ok(queries[0].sql.includes('AS "inPeriod"'));
  assert.ok(!queries[0].sql.includes('vl.acknowledged_at >='));
  assert.equal(queries[0].params[0],'owner-synthetic');
  assert.ok(queries[0].params.includes('Asia/Baghdad'));
});

test('C1d-S1: status uses parameter binding and never interpolates caller values into SQL',async()=>{
  const suspicious="مكتمل' OR TRUE --";
  const {db,queries}=fixture([]);
  await readOwnCircularAcknowledgements(db,{...filter,status:suspicious},owner,'Asia/Baghdad');
  assert.equal(queries.length,1);
  assert.ok(queries[0].sql.includes('t.status = $2'));
  assert.ok(!queries[0].sql.includes(suspicious));
  assert.equal(queries[0].params[1],suspicious);
});
