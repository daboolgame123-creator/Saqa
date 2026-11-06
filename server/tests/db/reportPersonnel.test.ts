/** Phase 23/P1d: real migrated PostgreSQL, generated test-only records, no external DB. */
import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';
import { ReportApiService } from '../../src/api/services/reportService';
import ExcelJS from 'exceljs';
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
    const result=await pool.query<{id:string;employee?:string}>(sql,params);
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
      assert.deepEqual(own.map(r => source === 'employees' ? r.id : r.employee), [owner], source);
      assert.ok(own.every(r => !Object.prototype.hasOwnProperty.call(r, 'employeeId')),
        source + ' leaks an internal identifier not declared in the response DTO');
      assert.deepEqual((await queryAs(source,{employee:stranger},'owner')).map(r=>r.id),[],source+' conflicting input');
      assert.deepEqual((await queryAs(source,{},'stranger')).map(r=>r.id),[records[source][1]],source+' stranger');
      assert.deepEqual((await queryAs(source,{employee:owner},'stranger')).map(r=>r.id),[],source+' conflicting input reverse');
    }
  });

  it('C1b1: actual service/export only includes own employee; conflicting filter never widens',async () => {
    const service=new ReportApiService(repo);
    const ownAccess=reportAccessFor({role:'employee',employeeId:owner});
    const otherAccess=reportAccessFor({role:'employee',employeeId:stranger});
    const own=await service.run({reportType:'employees'},ownAccess);
    assert.deepEqual(own.rows.map(r=>r.id),[owner]);
    assert.equal(own.summary.totalCount,1);
    assert.equal(own.rows[0].employee,'مالك');
    assert.ok(!JSON.stringify(own).includes('شخص آخر'));

    const foreign=await service.run({reportType:'employees',employee:stranger},ownAccess);
    assert.equal(foreign.summary.totalCount,0);
    assert.deepEqual(foreign.rows,[]);
    const reverse=await service.run({reportType:'employees',employee:owner},otherAccess);
    assert.equal(reverse.summary.totalCount,0);
    assert.deepEqual(reverse.rows,[]);
    const ownFiltered=await service.run({reportType:'employees',status:'active',section:'الإدارة'},ownAccess);
    assert.deepEqual(ownFiltered.rows.map(r=>r.id),[owner]);
    const wrongDepartment=await service.run({reportType:'employees',section:'المالية'},ownAccess);
    assert.equal(wrongDepartment.summary.totalCount,0);

    const output=await service.export({reportType:'employees'},ownAccess,'excel');
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(output.content as never);
    const sheet=workbook.getWorksheet('التفاصيل');
    assert.ok(sheet);
    assert.equal(sheet.rowCount,2);
    assert.equal(sheet.getCell('D2').value,'مالك');
    assert.ok(!JSON.stringify(workbook.model).includes('شخص آخر'));
    const filteredExport=await service.export({reportType:'employees',employee:stranger},ownAccess,'excel');
    const otherBook=new ExcelJS.Workbook();
    await otherBook.xlsx.load(filteredExport.content as never);
    assert.equal(otherBook.getWorksheet('التفاصيل')!.rowCount,1);
  });

  it('C1b1: employee forged identity or owner scope rejects before actual DB query',async () => {
    const legitimate=reportAccessFor({role:'employee',employeeId:owner});
    const attempts=[
      {...legitimate,employeeId:stranger},
      {...legitimate,personnelScope:{kind:'all'}},
      {...legitimate,personnelScope:{kind:'owner',employeeId:stranger}},
      {...legitimate,requestScope:{kind:'owner',ownerEmployeeId:stranger}},
      {...legitimate,transactionScope:null},
      {...legitimate,transactionScope:{...legitimate.transactionScope,availableToEmployeeId:stranger}},
    ];
    let dbCalls=0;
    const db={
      async query() {dbCalls++;throw Error('FORBIDDEN_QUERY');},
    };
    const protectedRepo=new PgReportRepository(db as never,localZone);
    const protectedService=new ReportApiService(protectedRepo);
    for(const scope of attempts) {
      await assert.rejects(protectedService.run({reportType:'employees'},scope as never),
        ReportScopeNotReadyError);
      await assert.rejects(protectedRepo.list('employees',{reportType:'employees'},scope as never),
        ReportScopeNotReadyError);
    }
    assert.equal(dbCalls,0);
  });

  it('C1b2: actual service, SQL and XLSX return only the employee own requests',async()=>{
    const service=new ReportApiService(repo);
    const ownAccess=reportAccessFor({role:'employee',employeeId:owner});
    const otherAccess=reportAccessFor({role:'employee',employeeId:stranger});
    const own=await service.run({reportType:'requests'},ownAccess);
    assert.deepEqual(own.rows.map(r=>r.id),[records.requests[0]]);
    assert.equal(own.summary.totalCount,1);
    assert.equal(own.rows[0].employee,owner,'request owner field is scoped to session identity');
    assert.ok(!JSON.stringify(own).includes(records.requests[1]));

    const other=await service.run({reportType:'requests'},otherAccess);
    assert.deepEqual(other.rows.map(r=>r.id),[records.requests[1]]);
    const filterForOther=await service.run({reportType:'requests',employee:stranger},ownAccess);
    assert.deepEqual(filterForOther.rows,[]);
    assert.equal(filterForOther.summary.totalCount,0);
    const filterForOwner=await service.run({reportType:'requests',employee:owner},otherAccess);
    assert.deepEqual(filterForOwner.rows,[]);
    const narrowed=await service.run({reportType:'requests',type:'leave',status:'submitted',dateTo:'2026-01-31'},ownAccess);
    assert.deepEqual(narrowed.rows.map(r=>r.id),[records.requests[0]]);
    const excluded=await service.run({reportType:'requests',dateFrom:'2026-02-01'},ownAccess);
    assert.deepEqual(excluded.rows,[]);
    const badKind=await service.run({reportType:'requests',type:'equipment'},ownAccess);
    assert.deepEqual(badKind.rows,[]);

    const exported=await service.export({reportType:'requests'},ownAccess,'excel');
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.content as never);
    const sheet=workbook.getWorksheet('التفاصيل');
    assert.ok(sheet);
    assert.equal(sheet.rowCount,2,'one header and one authorized request');
    const snapshot=JSON.stringify(workbook.model);
    assert.ok(snapshot.includes(records.requests[0]));
    assert.ok(!snapshot.includes(records.requests[1]),'foreign request ID must not leak');
    assert.ok(!snapshot.includes(stranger),'foreign owner identity must not leak');
    const emptyExport=await service.export({reportType:'requests',employee:stranger},ownAccess,'excel');
    const emptyBook=new ExcelJS.Workbook();
    await emptyBook.xlsx.load(emptyExport.content as never);
    assert.equal(emptyBook.getWorksheet('التفاصيل')!.rowCount,1);
  });

  it('C1b2: forged request identity/scope blocked at service and repository before DB reads',async()=>{
    const legitimate=reportAccessFor({role:'employee',employeeId:owner});
    const attempts=[
      {...legitimate,employeeId:stranger},
      {...legitimate,requestScope:{kind:'all'}},
      {...legitimate,requestScope:{kind:'owner',ownerEmployeeId:stranger}},
      {...legitimate,personnelScope:{kind:'owner',employeeId:stranger}},
      {...legitimate,transactionScope:null},
      {...legitimate,transactionScope:{...legitimate.transactionScope,availableToEmployeeId:stranger}},
    ];
    let queries=0;
    const guarded=new PgReportRepository({
      async query(){queries++;throw Error('UNAUTHORIZED_DB_QUERY');},
    } as never,localZone);
    const service=new ReportApiService(guarded);
    for(const access of attempts){
      await assert.rejects(service.run({reportType:'requests'},access as never),ReportScopeNotReadyError);
      await assert.rejects(guarded.list('requests',{reportType:'requests'},access as never),ReportScopeNotReadyError);
    }
    assert.equal(queries,0);
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
      await assert.rejects(repo.list(source,{
        reportType:source,documentDateFrom:'2020-01-01',
      },admin),ReportFilterUnavailableError);
      await assert.rejects(repo.list(source,{
        reportType:source,documentDateTo:'2020-01-01',
      },admin),ReportFilterUnavailableError);
      const noTimeZone = new PgReportRepository(pool);
      await assert.rejects(noTimeZone.list(source,{reportType:source,dateTo:'2026-01-31'},admin),ReportDateZoneRequiredError);
      const employee=reportAccessFor({role:'employee',employeeId:owner});
      if(source==='employees'||source==='requests') {
        const own=await repo.list(source,{reportType:source},employee);
        assert.deepEqual(own.map(r=>r.id),[records[source][0]],'own '+source+' only');
      } else {
        await assert.rejects(repo.list(source,{reportType:source},employee),ReportScopeNotReadyError);
      }
    }
  });
  it('bound filters cannot perform SQL injection or widen row ownership',async () => {
    for (const source of sources) {
      // Quotes, SQL comments, and logical operators remain literal parameter data.
      assert.deepEqual((await queryAs(source,{employee: owner + "' OR TRUE --"},'admin')).map(r=>r.id),[],source);
      assert.deepEqual((await queryAs(source,{type: "' OR TRUE --"},'admin')).map(r=>r.id),[],source);
      assert.deepEqual((await queryAs(source,{status: "approved' OR TRUE --"},'admin')).map(r=>r.id),[],source);
      assert.deepEqual((await queryAs(source,{employee: stranger + "' OR TRUE --"},'owner')).map(r=>r.id),[],source);
    }
  });

  it('direct builder refuses forged or cross-wired owner scopes even before HTTP is enabled',async () => {
    const legit=reportAccessFor({role:'employee',employeeId:owner});
    const invalid = [
      {...legit, requestScope:{kind:'all'}},
      {...legit, personnelScope:{kind:'all'}},
      {...legit, employeeId:stranger},
      {...legit, requestScope:{kind:'owner',ownerEmployeeId:stranger}},
      {...legit, personnelScope:{kind:'owner',employeeId:stranger}},
      {...admin, personnelScope:{kind:'owner',employeeId:owner}},
      {...admin, requestScope:{kind:'owner',ownerEmployeeId:owner}},
      {...admin, transactionScope:{visibilityIn:['PublicToEmployees']}},
    ];
    for(const source of sources) {
      for (const access of invalid) {
        assert.throws(
          () => buildScopedPersonnelReportQuery(source,{reportType:source},[],access as never,localZone),
          /scope|identity|inconsistent/i,source,
        );
      }
      await assert.rejects(
        repo.list(source,{reportType:'monthly'},admin),/Report type mismatch/,
      );
      assert.throws(
        () => buildScopedPersonnelReportQuery(source,{reportType:'monthly'},[],legit,localZone),
        /Report type mismatch/,
      );
    }
  });

  it('report DTO projection excludes internal identity alias on all source reads', async () => {
    for (const source of sources) {
      const rows=await queryAs(source,{},'admin');
      assert.equal(rows.length,2);
      assert.ok(rows.every(r => !Object.prototype.hasOwnProperty.call(r,'employeeId')),
        source + ' returned an uncontracted employeeId field');
    }
  });

});
