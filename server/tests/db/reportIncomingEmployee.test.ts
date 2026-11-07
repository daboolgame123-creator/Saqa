/** C1c-S2 incoming-only integration test. Real migrated disposable PostgreSQL,
 * synthetic people/books only. Reporting HTTP remains 503.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import ExcelJS from 'exceljs';
import { reportAccessFor, ReportScopeNotReadyError } from '../../src/authorization/reportAccess';
import { ReportApiService } from '../../src/api/services/reportService';
import { PgReportRepository } from '../../src/repositories/reportRepository';
import { startTestDatabase, stopTestDatabase, resetDomainTables } from './testDb';

describe('C1c-S2 owner-scoped incoming reports (migrated synthetic DB)',()=>{
  let pool:Pool;
  let repo:PgReportRepository;
  let service:ReportApiService;
  let a:string;
  let b:string;
  let publicBook:string;
  let ownGranted:string;
  let coworkerGranted:string;
  let unavailable:string;
  let adminGranted:string;
  let directorGranted:string;
  const names={
    public:'SYNTH_PUBLIC_INCOMING',
    own:'SYNTH_OWN_GRANTED_INCOMING',
    coworker:'SYNTH_FOREIGN_GRANTED_INCOMING',
    ungranted:'SYNTH_UNGRANTED_INCOMING',
    adminGranted:'SYNTH_ADMIN_GRANTED_INCOMING',
    directorGranted:'SYNTH_DIRECTOR_GRANTED_INCOMING',
  };
  before(async()=>{
    ({pool}=await startTestDatabase());
    repo=new PgReportRepository(pool,'Asia/Baghdad');
    service=new ReportApiService(repo);
  });
  after(async()=>{await stopTestDatabase();});
  beforeEach(async()=>{
    await resetDomainTables(pool);
    async function person(name:string){
      const x=await pool.query<{id:string}>(
        "INSERT INTO employees(name,title,department) VALUES($1,'منتسب','قسم') RETURNING id",
        [name]);
      return x.rows[0].id;
    }
    a=await person('SYNTH_EMPLOYEE_A');
    b=await person('SYNTH_EMPLOYEE_B');
    async function book(subject:string,visibility='PublicToEmployees',
      direction='وارد',daily=false,deleted=false):Promise<string>{
      const x=await pool.query<{id:string}>(`
        INSERT INTO transactions(
          number,sequence,document_date,month,direction,category,
          sub_type,entity,subject,visibility,status,
          is_daily_situation,created_at,deleted_at,notes
        ) VALUES(
          '١٠٠','١','2020-06-05'::date,'2020-06',$1,'إدارية',
          'كتاب','جهة',$2,$3::jsonb,'مكتمل',
          $4,'2026-01-15T12:00:00Z'::timestamptz,$5::timestamptz,$6
        ) RETURNING id`,
        [direction,subject,JSON.stringify(visibility),daily,
         deleted?'2026-01-17T00:00:00Z':null,'NOTE_'+subject]);
      return x.rows[0].id;
    }
    publicBook=await book(names.public);
    ownGranted=await book(names.own,'SpecificEmployees');
    coworkerGranted=await book(names.coworker,'SpecificEmployees');
    unavailable=await book(names.ungranted,'SpecificEmployees');
    adminGranted=await book(names.adminGranted,'Administrative');
    directorGranted=await book(names.directorGranted,'DirectorOnly');
    await pool.query(`INSERT INTO transaction_availability(transaction_id,employee_id,revoked_at)
      VALUES ($1,$3,NULL),($2,$4,NULL),($5,$3,now()),($6,$3,NULL),($7,$3,NULL)`,
      [ownGranted,coworkerGranted,a,b,await book('SYNTH_REVOKED','SpecificEmployees'),
       adminGranted,directorGranted]);
    for(const [subject,visibility,direction,daily,deleted] of [
      ['SYNTH_ADMIN','Administrative','وارد',false,false],
      ['SYNTH_DIRECTOR','DirectorOnly','وارد',false,false],
      ['SYNTH_PUBLIC_DAILY','PublicToEmployees','وارد',true,false],
      ['SYNTH_PUBLIC_DELETED','PublicToEmployees','وارد',false,true],
      ['SYNTH_OUTGOING','PublicToEmployees','صادر',false,false],
      ['SYNTH_INTERNAL','PublicToEmployees','داخلي',false,false],
    ] as const){await book(subject,visibility,direction,daily,deleted);}
    // Linking without an availability grant must never authorize a book.
    await pool.query(`INSERT INTO transaction_employees(transaction_id,employee_id,relationship_type)
      VALUES($1,$2,'subject'),($1,$2,'recipient')`,[unavailable,a]);
  });

  it('SQL, service and count show only public and personally granted incoming books',async()=>{
    const owner=reportAccessFor({role:'employee',employeeId:a});
    const visible=await service.run({reportType:'incoming'},owner);
    assert.deepEqual(new Set(visible.rows.map(r=>r.id)),new Set([publicBook,ownGranted]));
    assert.equal(visible.summary.totalCount,2);
    const text=JSON.stringify(visible);
    for(const forbidden of [names.coworker,names.ungranted,'SYNTH_ADMIN',
      'SYNTH_DIRECTOR',names.adminGranted,names.directorGranted,'SYNTH_PUBLIC_DAILY','SYNTH_PUBLIC_DELETED',
      'SYNTH_OUTGOING','SYNTH_INTERNAL',coworkerGranted,unavailable,adminGranted,directorGranted,b]){
      assert.ok(!text.includes(forbidden),'foreign/blocked report content leaked');
    }
    const other=await service.run({reportType:'incoming'},
      reportAccessFor({role:'employee',employeeId:b}));
    assert.deepEqual(new Set(other.rows.map(r=>r.id)),new Set([publicBook,coworkerGranted]));
    const narrow=await service.run({reportType:'incoming',employee:b},owner);
    assert.equal(narrow.summary.totalCount,0,'filter.employee does not grant coworker records');
    assert.deepEqual(narrow.rows,[]);
  });

  it('XLSX details and summary reflect exactly same authorized incoming rows',async()=>{
    const owner=reportAccessFor({role:'employee',employeeId:a});
    const exported=await service.export({reportType:'incoming'},owner,'excel');
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.content as never);
    const details=workbook.getWorksheet('التفاصيل');
    assert.ok(details);
    assert.equal(details.rowCount,3);
    const snapshot=JSON.stringify(workbook.model);
    assert.ok(snapshot.includes(names.public));
    assert.ok(snapshot.includes(names.own));
    for(const forbidden of [names.coworker,names.ungranted,'SYNTH_ADMIN',
      'SYNTH_DIRECTOR',names.adminGranted,names.directorGranted,'SYNTH_PUBLIC_DAILY','SYNTH_PUBLIC_DELETED',
      'SYNTH_OUTGOING','SYNTH_INTERNAL',adminGranted,directorGranted,b]){
      assert.ok(!snapshot.includes(forbidden),'export leaked unauthorized content');
    }
    const empty=await service.export({reportType:'incoming',employee:b},owner,'excel');
    const zero=new ExcelJS.Workbook();
    await zero.xlsx.load(empty.content as never);
    assert.equal(zero.getWorksheet('التفاصيل')!.rowCount,1);
  });

  it('forge context cannot cause SQL read; other book report types remain denied',async()=>{
    const owner=reportAccessFor({role:'employee',employeeId:a});
    let reads=0;
    const guarded=new PgReportRepository({
      async query(){reads++;throw Error('FORBIDDEN_SQL');},
      async connect(){reads++;throw Error('FORBIDDEN_CONNECT');},
    } as never,'Asia/Baghdad');
    for(const bad of [
      {...owner,employeeId:b},
      {...owner,transactionScope:{...owner.transactionScope,availabilityScope:'Administrative'}},
      {...owner,transactionScope:{...owner.transactionScope,visibilityIn:['Administrative']}},
    ]){
      await assert.rejects(guarded.list('incoming',{reportType:'incoming'},bad as never),
        ReportScopeNotReadyError);
    }
    for(const type of ['monthly','outgoing','situation'] as const){
      await assert.rejects(guarded.list(type,{reportType:type},owner),ReportScopeNotReadyError);
    }
    assert.equal(reads,0);
  });
});
