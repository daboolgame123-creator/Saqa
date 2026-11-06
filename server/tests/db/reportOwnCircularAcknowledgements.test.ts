/** Phase 23/C1d-S2 — migrated synthetic PostgreSQL proof for an internal-only
 * own-acknowledgements SQL reader. HTTP and employee report access stay denied.
 */
import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { reportAccessFor, ReportScopeNotReadyError } from '../../src/authorization/reportAccess';
import { readOwnCircularAcknowledgements } from '../../src/repositories/reportOwnCircularAcknowledgements';
import { ReportFilterUnavailableError } from '../../src/repositories/reportRepository';
import type { ReportAccessContext } from '../../src/repositories/contracts';
import { startTestDatabase, stopTestDatabase, resetDomainTables } from './testDb';

const base = { reportType: 'circularsAndAcknowledgements' } as const;

describe('Phase 23/C1d-S2 owner-only ViewLog (real migrated synthetic DB)', () => {
  let db: Pool;
  let serial = 0;

  before(async () => { ({pool: db} = await startTestDatabase()); });
  after(async () => { await stopTestDatabase(); });
  beforeEach(async () => { await resetDomainTables(db); serial = 0; });

  async function person(name: string): Promise<string> {
    const result = await db.query<{id:string}>(
      "INSERT INTO employees(name,title,department) VALUES ($1,'منتسب','قسم') RETURNING id",
      [name],
    );
    return result.rows[0].id;
  }

  async function account(employeeId: string | null): Promise<string> {
    const n = ++serial;
    const result = await db.query<{id:string}>(
      "INSERT INTO users(username,display_name,role,employee_id) VALUES ($1,$2,'employee',$3) RETURNING id",
      ['c1d-user-' + n, 'تجريبي ' + n, employeeId],
    );
    return result.rows[0].id;
  }

  async function book(options: {visibility?: string;subType?:string;direction?:string;
    daily?:boolean;deleted?:boolean; registered?:string;subject?:string} = {}): Promise<string> {
    const n = ++serial;
    const result = await db.query<{id:string}>(`
      INSERT INTO transactions (
        number,sequence,document_date,month,direction,category,
        sub_type,entity,subject,visibility,status,
        is_daily_situation,created_at,deleted_at
      ) VALUES (
        $1,$2,'2020-06-05'::date,'2020-06',$3,'إدارية',
        $4,'جهة',$5,$6::jsonb,'مكتمل',
        $7,$8::timestamptz,$9::timestamptz
      ) RETURNING id
    `, ['ت' + n,String(n),options.direction ?? 'وارد',
      options.subType ?? 'تعميم',options.subject ?? 'تعميم اصطناعي ' + n,
      JSON.stringify(options.visibility ?? 'PublicToEmployees'),options.daily ?? false,
      options.registered ?? '2020-01-05T12:00:00Z',
      options.deleted ? '2026-02-05T12:00:00Z' : null,
    ]);
    return result.rows[0].id;
  }

  async function log(transactionId:string,userId:string|null,employeeId:string|null,
    acknowledgedAt:string|null='2026-02-05T12:00:00Z') {
    await db.query(`
      INSERT INTO view_logs(transaction_id,user_id,employee_id,viewed_at,acknowledged_at,session_ref)
      VALUES ($1,$2,$3,'2026-02-01T12:00:00Z'::timestamptz,$4::timestamptz,$5)
    `,[transactionId,userId,employeeId,acknowledgedAt,'NEVER-EXPORT-SECRET']);
  }

  function read(id: string, options: Record<string,string> = {}) {
    const owner = reportAccessFor({role:'employee',employeeId:id});
    return readOwnCircularAcknowledgements(db, {...base,...options}, owner, 'Asia/Baghdad');
  }

  it('enforces SQL owner isolation: no coworkers, session tokens, identities or coworker totals',async()=>{
    const a=await person('موظف ألف'), b=await person('موظف باء');
    const ua=await account(a),ub=await account(b);
    const own=await book({subject:'موضوع يخص ألف'});
    const foreign=await book({subject:'معلومات محمية تخص باء'});
    await log(own,ua,a);
    await log(foreign,ub,b);
    const result=await read(a,{dateFrom:'2026-02-01',dateTo:'2026-02-28'});
    assert.deepEqual(result.map(x=>x.transactionId),[own]);
    assert.equal(result[0].title,'موضوع يخص ألف');
    const output=JSON.stringify(result);
    for(const forbidden of [b,foreign,'موظف باء','معلومات محمية تخص باء','NEVER-EXPORT-SECRET','userId','employeeId','problemRecords']) {
      assert.ok(!output.includes(forbidden),'Owner output must not include foreign or internal metadata');
    }
    assert.deepEqual((await read(b)).map(x=>x.transactionId),[foreign]);
  });

  it('deduplicates consistent multiple accounts, rejects conflicting history even across periods',async()=>{
    const a=await person('أ'), b=await person('ب');
    const ua=await account(a), second=await account(null), wrong=await account(b);
    const ok=await book(), disputed=await book(), mismatched=await book();
    await log(ok,ua,a,'2026-02-05T12:00:00Z');
    await log(ok,second,a,'2026-02-05T12:00:00Z');
    await log(disputed,ua,a,'2026-02-06T12:00:00Z');
    await log(disputed,second,a,'2025-02-06T12:00:00Z');
    await log(mismatched,wrong,a,'2026-02-07T12:00:00Z');
    const output=await read(a,{dateFrom:'2026-02-01',dateTo:'2026-02-28'});
    assert.deepEqual(output.map(x=>x.transactionId),[ok]);
    assert.equal(output[0].acknowledgedAt,'2026-02-05T12:00:00.000Z');
  });

  it('excludes nonpublic, deleted, daily, noncircular and unacknowledged rows',async()=>{
    const a=await person('أ'),ua=await account(a);
    const kept=await book();
    await log(kept,ua,a);
    for(const option of [
      {visibility:'Administrative'}, {daily:true}, {deleted:true},
      {subType:'كتاب'}, {direction:'صادر'},
    ]) {
      const id=await book(option);
      await log(id,ua,a);
    }
    const viewedOnly=await book();
    await log(viewedOnly,ua,a,null);
    assert.deepEqual((await read(a)).map(x=>x.transactionId),[kept]);
  });

  it('rejects forged session owner scopes and unsupported filter before SQL',async()=>{
    const a=await person('أ'),b=await person('ب');
    const owner=reportAccessFor({role:'employee',employeeId:a});
    for(const forged of [
      {...owner,employeeId:b},
      {...owner,personnelScope:{kind:'all'}},
      {...owner,transactionScope:{...owner.transactionScope,availableToEmployeeId:b}},
      reportAccessFor({role:'admin',employeeId:null}),
    ]) {
      await assert.rejects(readOwnCircularAcknowledgements(
        db,base,forged as ReportAccessContext,'Asia/Baghdad'),ReportScopeNotReadyError);
    }
    await assert.rejects(readOwnCircularAcknowledgements(
      db,{...base,employee:b},owner,'Asia/Baghdad'),ReportFilterUnavailableError);
  });
});
