/** C8 bounded result security regression: synthetic only, no real DB or HTTP.
 * The established C5/C7 integration suite checks real migrated PostgreSQL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { PgReportRepository, readCircularAcknowledgements } from '../src/repositories/reportRepository';
import type {
  ReportAccessContext, ReportRecord, ReportRepository,
} from '../src/repositories/contracts';
import {
  boundReportSql, MAX_REPORT_ROWS, REPORT_SQL_SENTINEL_ROWS,
  ReportResultTooLargeError,
} from '../src/repositories/reportLimits';
import { reportAccessFor } from '../src/authorization/reportAccess';
import { ReportApiService } from '../src/api/services/reportService';
import { resolveError } from '../src/middleware/errorHandler';

const admin:ReportAccessContext=reportAccessFor({role:'admin',employeeId:null});
const incoming={reportType:'incoming' as const};
const circular={reportType:'circularsAndAcknowledgements' as const};
const reportRows=(count:number):ReportRecord[]=>
  Array.from({length:count},(_,i)=>({
    id:'synthetic-report-'+i,date:'2026-11-07T00:00:00.000Z',
    type:'وارد',status:'مكتمل',title:'SYNTH_C8_'+i,
  }));
type QueryCall={sql:string;params:unknown[]};

/** Minimal fake PG query; cast only at the edge. It does not touch institutions. */
function pgFake(next:(sql:string,params:unknown[],index:number)=>unknown[]) {
  const calls:QueryCall[]=[];
  return {
    calls,
    db:{
      query:async(sql:string,params:unknown[]=[])=>{
        calls.push({sql,params:[...params]});
        return {rows:next(sql,params,calls.length),rowCount:0};
      },
    } as unknown as Pool,
  };
}

test('C8 sentinel is parameterized, ordered and unambiguous',()=>{
  const params:unknown[]=['safe-filter'];
  const sql=boundReportSql('SELECT id FROM demo WHERE owner = $1 ORDER BY id DESC',params);
  assert.equal(sql,'SELECT id FROM demo WHERE owner = $1 ORDER BY id DESC LIMIT $2');
  assert.deepEqual(params,['safe-filter',REPORT_SQL_SENTINEL_ROWS]);
  assert.equal(MAX_REPORT_ROWS,2000);
  assert.throws(()=>boundReportSql('SELECT id FROM demo',[]));
  assert.throws(()=>boundReportSql('SELECT id FROM demo ORDER BY id LIMIT 50',[]));
  const classified=resolveError(new ReportResultTooLargeError());
  assert.equal(classified.statusCode,422);
  assert.equal(classified.code,'REPORT_RESULT_TOO_LARGE');
  assert.equal(classified.isOperational,true);
  assert.ok(!JSON.stringify(classified).includes('synthetic-report'));
});

test('C8 exactly 2000 scoped incoming rows produce a complete authorized count',async()=>{
  const fake=pgFake(()=>reportRows(MAX_REPORT_ROWS));
  const service=new ReportApiService(new PgReportRepository(fake.db));
  const result=await service.run(incoming,admin);
  assert.equal(result.rows.length,MAX_REPORT_ROWS);
  assert.equal(result.summary.totalCount,MAX_REPORT_ROWS);
  assert.equal(fake.calls.length,1);
  const {sql,params}=fake.calls[0];
  assert.ok(sql.includes('t.deleted_at IS NULL'));
  assert.ok(sql.includes("t.direction = 'وارد'"));
  assert.match(sql,/ORDER BY t\.created_at DESC, t\.id DESC LIMIT \$1$/);
  assert.deepEqual(params,[REPORT_SQL_SENTINEL_ROWS]);
});

test('C8 2001 ordinary SQL rows FAIL instead of generating a false summary',async()=>{
  const fake=pgFake(()=>reportRows(REPORT_SQL_SENTINEL_ROWS));
  const service=new ReportApiService(new PgReportRepository(fake.db));
  await assert.rejects(service.run(incoming,admin),ReportResultTooLargeError);
  await assert.rejects(service.export(incoming,admin,'excel'),ReportResultTooLargeError);
  assert.equal(fake.calls.length,2);
  assert.equal(fake.calls[0].params.at(-1),REPORT_SQL_SENTINEL_ROWS);
});

test('C8 direct/mock repository cannot evade the same preview/export cap',async()=>{
  const fakeRepo={
    async list(){return reportRows(REPORT_SQL_SENTINEL_ROWS);},
    async readCircularAcknowledgements(){throw new Error('unexpected ViewLog read');},
  } as ReportRepository;
  const service=new ReportApiService(fakeRepo);
  await assert.rejects(service.run(incoming,admin),ReportResultTooLargeError);
  await assert.rejects(service.export(incoming,admin,'excel'),ReportResultTooLargeError);
});

test('C8 2001 circulars fail BEFORE reading ViewLog or certifying circular totals',async()=>{
  const fake=pgFake((_sql,_params,index)=>{
    assert.equal(index,1,'ViewLog must not be scanned after circular overflow');
    return reportRows(REPORT_SQL_SENTINEL_ROWS);
  });
  await assert.rejects(
    readCircularAcknowledgements(fake.db,circular,admin,null),
    ReportResultTooLargeError,
  );
  assert.equal(fake.calls.length,1);
  assert.match(fake.calls[0].sql,/ORDER BY t\.created_at DESC, t\.id DESC LIMIT \$1$/);
  assert.deepEqual(fake.calls[0].params,[REPORT_SQL_SENTINEL_ROWS]);
});

test('C8 2001 eligible historical ViewLog rows fail instead of dropping conflicts',async()=>{
  const fake=pgFake((_sql,_params,index)=>{
    if(index===1)return reportRows(1);
    return Array.from({length:REPORT_SQL_SENTINEL_ROWS},(_,i)=>({
      id:'synthetic-log-'+i,transactionId:'synthetic-report-0',
      employeeId:'employee-a',linkedEmployeeId:'employee-a',
      employeeName:'موظف تجريبي',
      acknowledgedAt:'2026-11-07T10:00:00.000Z',
      timestampKey:'2026-11-07 10:00:00+00',
      inPeriod:true,
    }));
  });
  await assert.rejects(
    readCircularAcknowledgements(fake.db,circular,admin,null),
    ReportResultTooLargeError,
  );
  assert.equal(fake.calls.length,2);
  assert.match(fake.calls[1].sql,/ORDER BY vl\.transaction_id, vl\.employee_id, vl\.acknowledged_at, vl\.id LIMIT \$1$/);
  assert.ok(fake.calls[1].sql.includes('vl.acknowledged_at IS NOT NULL'));
  assert.deepEqual(fake.calls[1].params,[REPORT_SQL_SENTINEL_ROWS]);
});

test('C8 exactly 2000 historical identical ViewLog rows remain deduplicated, not truncated',async()=>{
  const fake=pgFake((_sql,_params,index)=>{
    if(index===1)return reportRows(1);
    return Array.from({length:MAX_REPORT_ROWS},(_,i)=>({
      id:'synthetic-ack-'+i,transactionId:'synthetic-report-0',
      employeeId:'employee-a',linkedEmployeeId:'employee-a',
      employeeName:'موظف تجريبي',
      acknowledgedAt:'2026-11-07T10:00:00.000Z',
      timestampKey:'2026-11-07 10:00:00+00',
      inPeriod:true,
    }));
  });
  const result=await readCircularAcknowledgements(fake.db,circular,admin,null);
  assert.equal(result.statistics.circularCount,1);
  assert.equal(result.statistics.acknowledgementOperations,1);
  assert.equal(result.statistics.uniqueEmployees,1);
  assert.equal(result.statistics.complete,true);
  assert.equal(result.acknowledgements.length,1);
});
