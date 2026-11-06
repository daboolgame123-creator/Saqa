/** C1d-S3: migrated two-employee PostgreSQL + XLSX scope proof, synthetic only. */
import assert from 'node:assert/strict';
import {before,after,beforeEach,describe,it} from 'node:test';
import ExcelJS from 'exceljs';
import type {Pool} from 'pg';
import {reportAccessFor,ReportScopeNotReadyError} from '../../src/authorization/reportAccess';
import {
  exportOwnAcknowledgementsExcel,
  runOwnAcknowledgementReport,
} from '../../src/api/services/reportOwnAcknowledgements';
import {startTestDatabase,stopTestDatabase,resetDomainTables} from './testDb';
import type {ReportAccessContext} from '../../src/repositories/contracts';

describe('C1d-S3 actual PostgreSQL owner XLSX isolation',()=>{
  let pool:Pool;
  let seq=0;
  const base={reportType:'circularsAndAcknowledgements'} as const;
  before(async()=>{({pool}=await startTestDatabase());});
  after(async()=>{await stopTestDatabase();});
  beforeEach(async()=>{await resetDomainTables(pool);seq=0;});

  async function person(name:string){
    const r=await pool.query<{id:string}>(
      "INSERT INTO employees(name,title,department) VALUES ($1,'منتسب','قسم') RETURNING id",[name]);
    return r.rows[0].id;
  }
  async function user(employeeId:string) {
    const n=++seq;
    const r=await pool.query<{id:string}>(
      "INSERT INTO users(username,display_name,role,employee_id) VALUES ($1,$2,'employee',$3) RETURNING id",
      ['c1d-s3-user-'+n,'تجريبي '+n,employeeId]);
    return r.rows[0].id;
  }
  async function circular(title:string) {
    const n=++seq;
    const r=await pool.query<{id:string}>(`
      INSERT INTO transactions(
        number,sequence,document_date,month,direction,category,
        sub_type,entity,subject,visibility,status,
        is_daily_situation,created_at
      ) VALUES(
        $1,$2,'2020-06-05'::date,'2020-06','وارد','إدارية',
        'تعميم','جهة',$3,'"PublicToEmployees"'::jsonb,'مكتمل',
        false,'2020-01-05T12:00:00Z'::timestamptz
      ) RETURNING id`,['ت'+n,String(n),title]);
    return r.rows[0].id;
  }
  async function acknowledge(bookId:string,userId:string,employeeId:string) {
    await pool.query(`
      INSERT INTO view_logs(transaction_id,user_id,employee_id,viewed_at,acknowledged_at,session_ref)
      VALUES ($1,$2,$3,'2026-02-01T12:00:00Z','2026-02-05T12:00:00Z',$4)`,
    [bookId,userId,employeeId,'SENSITIVE_NEVER_EXPORTED']);
  }

  it('exports only session-owner acknowledged circular; no coworker strings/counts or session reference',async()=>{
    const a=await person('ألف'), b=await person('باء');
    const ua=await user(a),ub=await user(b);
    const own=await circular('تعميم خاص بألف'),foreign=await circular('عنوان سرّي يخص باء');
    await acknowledge(own,ua,a);
    await acknowledge(foreign,ub,b);
    const access=reportAccessFor({role:'employee',employeeId:a});
    const report=await runOwnAcknowledgementReport(pool,base,access,'Asia/Baghdad');
    assert.equal(report.ownAcknowledgementCount,1);
    assert.deepEqual(report.entries.map(x=>x.transactionId),[own]);
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportOwnAcknowledgementsExcel(pool,base,access,'Asia/Baghdad'));
    assert.equal(workbook.getWorksheet('الملخص')!.getCell('B2').value,'1');
    assert.equal(workbook.getWorksheet('إقراراتي')!.getCell('A2').value,'تعميم خاص بألف');
    const values=JSON.stringify(workbook.worksheets.map(w=>w.getSheetValues()));
    for(const secret of ['عنوان سرّي يخص باء','باء',b,foreign,ua,ub,'SENSITIVE_NEVER_EXPORTED','problemRecords']) {
      assert.ok(!values.includes(secret),'forbidden leakage: '+secret);
    }
    const other=await runOwnAcknowledgementReport(pool,base,reportAccessFor({role:'employee',employeeId:b}),'Asia/Baghdad');
    assert.deepEqual(other.entries.map(x=>x.transactionId),[foreign]);
  });

  it('forged cross-owner and privileged role fail before report reader returns data',async()=>{
    const a=await person('أ'),b=await person('ب');
    const owner=reportAccessFor({role:'employee',employeeId:a});
    const bad=[{...owner,employeeId:b},
      {...owner,requestScope:{kind:'all'}},
      {...owner,transactionScope:{...owner.transactionScope,availableToEmployeeId:b}},
      reportAccessFor({role:'admin',employeeId:null}),
    ];
    for(const access of bad) {
      await assert.rejects(
        exportOwnAcknowledgementsExcel(pool,base,access as ReportAccessContext,'Asia/Baghdad'),
        ReportScopeNotReadyError);
    }
  });
});
