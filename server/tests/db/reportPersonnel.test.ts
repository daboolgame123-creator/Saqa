/** Phase 23/P1d: real migrated PostgreSQL, generated test-only records, no external DB. */
import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { reportAccessFor, ReportScopeNotReadyError } from '../../src/authorization/reportAccess';
import { PgReportRepository, buildScopedPersonnelReportQuery,
  ReportDateZoneRequiredError, ReportFilterUnavailableError } from '../../src/repositories/reportRepository';
import type { ReportFilter, ReportType } from '../../src/repositories/contracts';
import { startTestDatabase, stopTestDatabase, resetDomainTables } from './testDb';

const sources = ['employees', 'leaves', 'timePermissions', 'requests'] as const;
type Source = typeof sources[number];
const admin = reportAccessFor({role:'admin',employeeId:null});
const director = reportAccessFor({role:'director',employeeId:null});
describe('Phase 23/P1d — migrated PostgreSQL independent resource ownership', () => {
  let pool: Pool;
  let repo: PgReportRepository;
  let owner: string;
  let stranger: string;
  let records: Record<Source, [string,string]>;
  const localZone = 'Asia/Baghdad'; // Deterministic test ONLY, not production configuration.

  before(async () => {
    ({pool} = await startTestDatabase());
    repo = new PgReportRepository(pool, localZone);
  });
  after(async () => { await stopTestDatabase(); });
  beforeEach(async () => {
    await resetDomainTables(pool);
    const ids: string[] = [];
    for (const [n,department,status] of [['مالك','الإدارة','active'], ['شخص آخر','المالية','former']]) {
      const r = await pool.query<{id:string}>(`
        INSERT INTO employees (name,title,department,status,category,created_at)
        VALUES ($1,'منتسب',$2,$3,'منتسب','2026-01-31T21:30:00Z') RETURNING id
      `,[n,department,status]);
      ids.push(r.rows[0].id);
    }
    [owner,stranger] = ids;
    records = {employees:[owner,stranger],leaves:['',''],timePermissions:['',''],requests:['','']};
    for(let i=0;i<2;i++){
      const who=ids[i];
      const date=i===0?'2026-01-31T20:30:00Z':'2026-01-31T21:30:00Z';
      const l=await pool.query<{id:string}>(`
        INSERT INTO leaves(employee_id,type,start_date,end_date,status,created_at)
        VALUES($1,'annual','2020-01-01','2020-01-02','approved',$2::timestamptz) RETURNING id
      `,[who,date]);
      const tp=await pool.query<{id:string}>(`
        INSERT INTO time_permissions(employee_id,date,time_out,status,created_at)
        VALUES($1,'2020-01-01','09:00','approved',$2::timestamptz) RETURNING id
      `,[who,date]);
      const req=await pool.query<{id:string}>(`
        INSERT INTO requests(employee_id,kind,payload,status,created_at)
        VALUES($1,'leave','{}'::jsonb,'submitted',$2::timestamptz) RETURNING id
      `,[who,date]);
      records.leaves[i]=l.rows[0].id;
      records.timePermissions[i]=tp.rows[0].id;
      records.requests[i]=req.rows[0].id;
    }
  });

  async function queryAs(source:Source, filter:Partial<ReportFilter>, who: 'owner'|'stranger'|'admin'|'director'='admin') {
    const full={reportType:source,...filter} as ReportFilter;
    const access=who==='owner'||who==='stranger'
      ? reportAccessFor({role:'employee',employeeId:who==='owner'?owner:stranger})
      : who==='admin'?admin:director;
    if (access.role!=='employee') return repo.list(source,full,access);
    const {sql,params}=buildScopedPersonnelReportQuery(source,full,[],access,localZone);
    const result=await pool.query<{id:string;employeeId:string;employee?:string}>(sql,params);
    return result.rows;
  }

  it('admin/director SQL reads real correct columns in all four tables', async () => {
    for(const source of sources){
      const all=await queryAs(source,{},'admin');
      assert.deepEqual(new Set(all.map(r=>r.id)),new Set(records[source]));
      assert.equal((await queryAs(source,{},'director')).length,2);
    }
    const own=await queryAs('employees',{section:'الإدارة',type:'منتسب',status:'active'});
    assert.deepEqual(own.map(r=>r.id),[owner]);
    assert.equal(own[0].employee,'مالك');
  });

  it('each source constrains employee to owner in SQL before SELECT', async () => {
    for(const source of sources){
      const own=await queryAs(source,{},'owner');
      assert.deepEqual(own.map(r=>r.id),[records[source][0]],source);
      assert.deepEqual(own.map(r=>r.employeeId),[owner],source);
      assert.deepEqual((await queryAs(source,{employee:stranger},'owner')).map(r=>r.id),[],source+' conflicting input');
      assert.deepEqual((await queryAs(source,{},'stranger')).map(r=>r.id),[records[source][1]],source+' stranger');
      assert.deepEqual((await queryAs(source,{employee:owner},'stranger')).map(r=>r.id),[],source+' conflicting input reverse');
    }
  });

  it('registration date bounds use the configured local date rather than leave/time business dates',async () => {
    for(const source of ['leaves','timePermissions','requests'] as const){
      assert.deepEqual((await queryAs(source,{dateTo:'2026-01-31'})).map(r=>r.id),[records[source][0]]);
      assert.deepEqual((await queryAs(source,{dateFrom:'2026-02-01'})).map(r=>r.id),[records[source][1]]);
      assert.equal((await queryAs(source,{dateFrom:'2026-01-31',dateTo:'2026-02-01'})).length,2);
    }
    assert.equal((await queryAs('employees',{dateFrom:'2026-02-01'})).length,2);
    assert.equal((await queryAs('employees',{dateTo:'2026-01-31'})).length,0);
  });

  it('kind, status, category, department and owner filters actually change results',async () => {
    assert.deepEqual((await queryAs('requests',{type:'leave',status:'submitted',employee:owner})).map(r=>r.id),[records.requests[0]]);
    assert.deepEqual((await queryAs('requests',{type:'equipment'})).map(r=>r.id),[]);
    assert.deepEqual((await queryAs('leaves',{type:'annual',status:'approved',employee:owner})).map(r=>r.id),[records.leaves[0]]);
    assert.deepEqual((await queryAs('leaves',{type:'sick'})).map(r=>r.id),[]);
    assert.deepEqual((await queryAs('timePermissions',{type:'approved',status:'approved',employee:owner})).map(r=>r.id),[records.timePermissions[0]]);
    assert.deepEqual((await queryAs('timePermissions',{type:'cancelled'})).map(r=>r.id),[]);
    assert.deepEqual((await queryAs('employees',{section:'المالية',status:'former'})).map(r=>r.id),[stranger]);
    assert.deepEqual((await queryAs('employees',{section:'غير موجود'})).map(r=>r.id),[]);
  });

  it('unsupported filters, unset timezone and employee entry guard all fail closed',async () => {
    for(const source of sources){
      await assert.rejects(repo.list(source,{reportType:source,source:'unspecified'},admin),ReportFilterUnavailableError);
      if(source!=='employees') await assert.rejects(repo.list(source,{reportType:source,section:'unmapped'},admin),ReportFilterUnavailableError);
      const noTimeZone = new PgReportRepository(pool);
      await assert.rejects(noTimeZone.list(source,{reportType:source,dateTo:'2026-01-31'},admin),ReportDateZoneRequiredError);
      const employee=reportAccessFor({role:'employee',employeeId:owner});
      await assert.rejects(repo.list(source,{reportType:source},employee),ReportScopeNotReadyError);
    }
  });
});
