/** Phase 23/P1e — real PostgreSQL, synthetic records only, not the institution DB. */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { reportAccessFor, ReportScopeNotReadyError } from '../../src/authorization/reportAccess';
import {
  PgReportRepository, ReportFilterUnavailableError, ReportDateZoneRequiredError,
} from '../../src/repositories/reportRepository';
import type { ReportAccessContext, ReportFilter } from '../../src/repositories/contracts';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

const filter: ReportFilter = { reportType: 'circularsAndAcknowledgements' };
const admin = reportAccessFor({role:'admin', employeeId:null});
const director = reportAccessFor({role:'director', employeeId:null});

describe('Phase 23/P1e — registered circulars and verified formal acknowledgements', () => {
  let pool: Pool;
  let repo: PgReportRepository;
  let counter=0;
  before(async () => {
    ({pool}=await startTestDatabase());
    repo=new PgReportRepository(pool, 'Asia/Baghdad'); // Test-only calendar, not approved production.
  });
  after(async()=>{await stopTestDatabase();});
  beforeEach(async()=>{await resetDomainTables(pool);counter=0;});

  async function book(opts: {
    registered?:string; direction?:string; subType?:string; visibility?:string;
    status?:string; deleted?:boolean; daily?:boolean;
  } = {}):Promise<string>{
    const r=await pool.query<{id:string}>(
      'INSERT INTO transactions '+
      '(number,sequence,document_date,month,direction,category,sub_type,entity,subject,visibility,status,created_at,deleted_at,is_daily_situation) '+
      'VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::timestamptz,$13::timestamptz,$14) RETURNING id',
      [
        'م'+(++counter), String(counter),'2020-06-01','2020-06',
        opts.direction ?? 'وارد', 'إدارية',opts.subType ?? 'تعميم','جهة',
        'تعميم تجريبي '+counter,JSON.stringify(opts.visibility ?? 'PublicToEmployees'),
        opts.status ?? 'قيد المراجعة',opts.registered ?? '2026-01-15T12:00:00Z',
        opts.deleted ? '2026-01-20T00:00:00Z' : null, opts.daily ?? false,
      ],
    );
    return r.rows[0].id;
  }
  async function person(name:string):Promise<string>{
    const r=await pool.query<{id:string}>(
      'INSERT INTO employees(name,title,department) VALUES($1,$2,$3) RETURNING id',
      [name,'منتسب','القسم'],
    );
    return r.rows[0].id;
  }
  async function account(employeeId:string|null):Promise<string>{
    counter++;
    const r=await pool.query<{id:string}>(
      'INSERT INTO users(username,display_name,role,employee_id) VALUES($1,$2,$3,$4) RETURNING id',
      ['test-user-'+counter,'حساب '+counter,'employee',employeeId],
    );
    return r.rows[0].id;
  }
  async function log(
    transactionId:string, userId:string|null, employeeId:string|null,
    acknowledgedAt:string|null='2026-02-05T12:00:00Z',
    viewedAt='2026-02-01T12:00:00Z',
  ){
    return pool.query(
      'INSERT INTO view_logs (transaction_id,user_id,employee_id,acknowledged_at,viewed_at,session_ref) '+
      'VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6)',
      [transactionId,userId,employeeId,acknowledgedAt,viewedAt,'private-session-NEVER-RETURN'],
    );
  }
  function read(partial:Partial<ReportFilter>={},access:ReportAccessContext=admin){
    return repo.readCircularAcknowledgements({...filter,...partial},access);
  }

  it('counts registered circulars even without an acknowledgement; each clock is independent',async()=>{
    const recent=await book({registered:'2026-02-03T12:00:00Z'});
    const old=await book({registered:'2020-06-03T12:00:00Z'});
    const e=await person('أحمد');const u=await account(e);
    await log(old,u,e,'2026-02-04T12:00:00Z');
    const result=await read({dateFrom:'2026-02-01',dateTo:'2026-02-28'});
    assert.deepEqual(result.circulars.map(r=>r.id),[recent]);
    assert.equal(result.statistics.circularCount,1,'A circular with zero reads still counts');
    assert.equal(result.statistics.acknowledgementOperations,1,'New acknowledgement for old circular counts');
    assert.equal(result.statistics.uniqueEmployees,1);
    assert.deepEqual(result.acknowledgements.map(r=>r.transactionId),[old]);
    assert.equal(result.acknowledgements[0].employeeName,'أحمد');
    assert.equal(result.statistics.complete,true);
    assert.ok(result.acknowledgements.every(r=>!('sessionRef' in r)&&!('userId' in r)));
  });

  it('one employee across three circulars counts three operations and one unique employee',async()=>{
    const a=await person('موظف أ'), b=await person('موظف ب');
    const ua=await account(a), ub=await account(b), legacy=await account(null);
    const c1=await book(),c2=await book(),c3=await book();
    const stamp='2026-02-05T12:00:00Z';
    await log(c1,ua,a,stamp);await log(c1,legacy,a,stamp);
    await log(c2,ua,a,stamp);await log(c3,ua,a,stamp);
    await log(c2,ub,b,stamp);
    const result=await read();
    assert.equal(result.statistics.circularCount,3);
    assert.equal(result.statistics.acknowledgementOperations,4);
    assert.equal(result.statistics.uniqueEmployees,2);
    assert.equal(result.statistics.problemRecords,0);
    assert.equal(result.acknowledgements.filter(e=>e.employeeId===a).length,3);
  });

  it('excludes non-circular, non-public, deleted and daily books from both counts',async()=>{
    const personId=await person('مالك'),userId=await account(personId);
    for(const opts of [
      {direction:'صادر'}, {visibility:'Administrative'}, {subType:'كتاب'},
      {deleted:true},{daily:true},
    ]) {
      const id=await book(opts);
      await log(id,userId,personId);
    }
    const result=await read();
    assert.equal(result.statistics.circularCount,0);
    assert.equal(result.statistics.acknowledgementOperations,0);
    assert.deepEqual(result.acknowledgements,[]);
    assert.equal(result.statistics.problemRecords,0);
  });

  it('viewed_at without acknowledged_at is not a formal acknowledgement',async()=>{
    const e=await person('معاين'),u=await account(e),id=await book();
    await log(id,u,e,null,'2026-02-05T12:00:00Z');
    const result=await read({dateFrom:'2026-02-01',dateTo:'2026-02-28'});
    assert.equal(result.statistics.circularCount,0,'The book was registered in January');
    assert.equal(result.statistics.acknowledgementOperations,0);
    assert.equal(result.statistics.uniqueEmployees,0);
  });

  it('missing employee identity marks totals uncertified without guessing from user account',async()=>{
    const c=await book();
    const confirmed=await person('مؤكد'),u=await account(confirmed);
    const missingUser=await account(null);
    await log(c,u,confirmed);
    await log(c,missingUser,null);
    const result=await read();
    assert.equal(result.statistics.complete,false);
    assert.equal(result.statistics.acknowledgementOperations,null);
    assert.equal(result.statistics.uniqueEmployees,null);
    assert.equal(result.statistics.verifiedAcknowledgementOperations,1);
    assert.equal(result.statistics.verifiedUniqueEmployees,1);
    assert.equal(result.statistics.problemRecords,1);
    assert.equal(result.statistics.problemReasons.missingEmployeeId,1);
    assert.equal(result.acknowledgements.length,1);
  });

  it('different acknowledgement timestamps on one employee/circular remain unresolved even across periods',async()=>{
    const c=await book();
    const a=await person('موظف'),u=await account(a),oldAccount=await account(null);
    await log(c,u,a,'2026-02-05T12:00:00Z');
    await log(c,oldAccount,a,'2025-12-05T12:00:00Z');
    const result=await read({dateFrom:'2026-02-01',dateTo:'2026-02-28'});
    assert.equal(result.statistics.acknowledgementOperations,null);
    assert.equal(result.statistics.problemRecords,1,'Only the in-range problematic row is tallied');
    assert.equal(result.statistics.problemReasons.conflictingAcknowledgementTime,1);
    assert.equal(result.acknowledgements.length,0);
  });

  it('contradictory user-employee identity is a flagged historical anomaly, not another employee',async()=>{
    const c=await book();
    const e1=await person('أ'),e2=await person('ب'),wrongUser=await account(e2);
    await log(c,wrongUser,e1);
    const result=await read();
    assert.equal(result.statistics.problemRecords,1);
    assert.equal(result.statistics.problemReasons.identityMismatch,1);
    assert.equal(result.statistics.acknowledgementOperations,null);
    assert.equal(result.statistics.uniqueEmployees,null);
    assert.deepEqual(result.acknowledgements,[]);
  });

  it('status is scoped on circulars AND acknowledgements and totals ignore unrelated rows',async()=>{
    const completed=await book({status:'مكتمل'});
    const underReview=await book({status:'قيد المراجعة'});
    const e=await person('شخص'),u=await account(e);
    await log(completed,u,e);await log(underReview,u,e);
    const result=await read({status:'مكتمل'});
    assert.deepEqual(result.circulars.map(r=>r.id),[completed]);
    assert.deepEqual(result.acknowledgements.map(r=>r.transactionId),[completed]);
    assert.equal(result.statistics.acknowledgementOperations,1);
  });

  it('unauthorized, unapproved filters and missing calendar timezone fail before any SQL',async()=>{
    const e=await person('ممنوع');
    const employee=reportAccessFor({role:'employee',employeeId:e});
    await assert.rejects(read({},employee),ReportScopeNotReadyError);
    for(const field of ['type','section','source','employee'] as const){
      await assert.rejects(read({[field]: 'unapproved'}),ReportFilterUnavailableError);
    }
    const missingZone=new PgReportRepository(pool);
    await assert.rejects(
      missingZone.readCircularAcknowledgements({...filter,dateTo:'2026-02-01'},admin),
      ReportDateZoneRequiredError,
    );
    await assert.rejects(read({reportType:'monthly'}),/Report type mismatch/);
    const directorReport=await read({},director);
    assert.equal(directorReport.statistics.circularCount,0);
  });
});
