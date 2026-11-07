/** Phase 23 C9b: raw owner ViewLog bounded SQL before deduplication (synthetic). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import { MAX_REPORT_ROWS, REPORT_SQL_SENTINEL_ROWS, ReportResultTooLargeError } from '../src/repositories/reportLimits';
import { readOwnCircularAcknowledgements } from '../src/repositories/reportOwnCircularAcknowledgements';
import { runOwnAcknowledgementReport, OwnAcknowledgementExportError } from '../src/api/services/reportOwnAcknowledgements';

const owner = reportAccessFor({ role: 'employee', employeeId: 'c9b-owner' });
const filter = { reportType: 'circularsAndAcknowledgements' } as const;
type Q = { sql:string; params:unknown[] };
const history = (n:number) => Array.from({length:n},()=>({
  transactionId:'synthetic-circular', title:'موضوع خاص اصطناعي',
  linkedEmployeeId:'c9b-owner',
  acknowledgedAt:new Date('2026-03-08T12:00:00.000Z'),
  timestampKey:'2026-03-08 12:00:00+00', inPeriod:true,
}));
function fake(rows:ReturnType<typeof history>) {
  const calls:Q[]=[];
  const db={async query(sql:string,params:unknown[]) {
    calls.push({sql,params:[...params]});
    return {rows};
  }} as never;
  return {db,calls};
}

test('C9b exactly 2000 historical rows can certify one complete own acknowledgement',async()=>{
  const {db,calls}=fake(history(MAX_REPORT_ROWS));
  const result=await readOwnCircularAcknowledgements(db,filter,owner,'Asia/Baghdad');
  assert.equal(result.length,1);
  assert.equal(result[0].transactionId,'synthetic-circular');
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/WHERE vl\.employee_id = \$1/);
  assert.match(calls[0].sql,/ORDER BY vl\.transaction_id, vl\.acknowledged_at, vl\.id LIMIT \$2$/);
  assert.deepEqual(calls[0].params,['c9b-owner',REPORT_SQL_SENTINEL_ROWS]);
  assert.ok(!calls[0].sql.includes('c9b-owner'));
  assert.ok(!JSON.stringify(result).includes('c9b-owner'));
});

test('C9b 2001 raw rows reject before grouping even when they collapse to ONE distinct operation',async()=>{
  const {db,calls}=fake(history(REPORT_SQL_SENTINEL_ROWS));
  await assert.rejects(
    readOwnCircularAcknowledgements(db,filter,owner,'Asia/Baghdad'),
    ReportResultTooLargeError,
  );
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params,['c9b-owner',REPORT_SQL_SENTINEL_ROWS]);
  await assert.rejects(
    runOwnAcknowledgementReport(db,filter,owner,'Asia/Baghdad'),
    OwnAcknowledgementExportError,
  );
  assert.equal(calls.length,2);
});

test('C9b forged scopes still reject before SQL; period and status bind before sentinel',async()=>{
  const {db,calls}=fake([]);
  await assert.rejects(
    readOwnCircularAcknowledgements(db,filter,{...owner,employeeId:'foreign'},'Asia/Baghdad'),
    ReportScopeNotReadyError,
  );
  assert.equal(calls.length,0);
  const result=await readOwnCircularAcknowledgements(db,{
    ...filter,status:'مكتمل',dateFrom:'2026-03-01',dateTo:'2026-03-31',
  },owner,'Asia/Baghdad');
  assert.deepEqual(result,[]);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/t\.status = \$2/);
  assert.match(calls[0].sql,/ORDER BY vl\.transaction_id, vl\.acknowledged_at, vl\.id LIMIT \$6$/);
  assert.deepEqual(calls[0].params,
    ['c9b-owner','مكتمل','Asia/Baghdad','2026-03-01','2026-03-31',REPORT_SQL_SENTINEL_ROWS]);
});
