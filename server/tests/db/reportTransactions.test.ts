/** P1c: real PostgreSQL against the isolated migrated alsqaya_test database only. */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { reportAccessFor } from '../../src/authorization/reportAccess';
import { ReportApiService } from '../../src/api/services/reportService';
import {
  buildTransactionsQuery, PgReportRepository,
  ReportDateZoneRequiredError, ReportFilterUnavailableError, ReportNotImplementedError,
} from '../../src/repositories/reportRepository';
import type { ReportFilter, TransactionScopeFilter } from '../../src/repositories/contracts';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

const admin = reportAccessFor({ role: 'admin', employeeId: null });
const director = reportAccessFor({ role: 'director', employeeId: null });
type Direction = 'وارد' | 'صادر' | 'داخلي';
type BookOptions = {
  direction?: Direction;
  date?: string;
  registered?: string;
  status?: 'قيد المراجعة' | 'مكتمل';
  visibility?: string;
  imported?: boolean;
  deleted?: boolean;
  daily?: boolean;
};

describe('Phase 23/P1c — real PostgreSQL book-report SQL', () => {
  let pool: Pool;
  let repository: PgReportRepository;

  before(async () => {
    ({ pool } = await startTestDatabase());
    // Explicit test-only calendar policy; NOT a production timezone decision.
    repository = new PgReportRepository(pool, 'Asia/Baghdad');
  });
  after(async () => { await stopTestDatabase(); });
  beforeEach(async () => { await resetDomainTables(pool); });

  async function book(options: BookOptions = {}): Promise<string> {
    const documentDate = options.date ?? '2020-06-05';
    const registered = options.registered ?? '2026-01-15T12:00:00Z';
    const result = await pool.query<{ id: string }>(`
      INSERT INTO transactions (
        number, sequence, document_date, month, direction, category,
        sub_type, entity, subject, visibility, status,
        is_daily_situation, created_at, imported_at, deleted_at
      ) VALUES (
        '١٠٠', '١', $1::date, $2, $3, 'إدارية',
        'كتاب', 'الجهة', 'الموضوع', $4::jsonb, $5,
        $6, $7::timestamptz, $8::timestamptz, $9::timestamptz
      ) RETURNING id
    `, [
      documentDate, documentDate.slice(0, 7), options.direction ?? 'وارد',
      JSON.stringify(options.visibility ?? 'PublicToEmployees'),
      options.status ?? 'قيد المراجعة', options.daily ?? false, registered,
      options.imported ? '2026-01-16T00:00:00Z' : null,
      options.deleted ? '2026-01-17T00:00:00Z' : null,
    ]);
    return result.rows[0].id;
  }

  async function employee(name: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO employees(name, title, department)
       VALUES ($1, 'باحث', 'قسم') RETURNING id`, [name],
    );
    return result.rows[0].id;
  }

  async function rows(filter: ReportFilter, as = admin) {
    return repository.list(filter.reportType, filter, as);
  }

  it('registration date (not document date), inclusive local bounds and one-sided periods', async () => {
    const a = await book({ registered: '2025-12-31T22:30:00Z' }); // Jan 1 local
    const b = await book({ registered: '2026-01-31T20:59:00Z' }); // Jan 31 local
    const c = await book({ registered: '2026-01-31T21:01:00Z' }); // Feb 1 local
    const d = await book({ registered: '2025-12-31T20:59:00Z' }); // Dec 31 local
    const both = await rows({ reportType: 'monthly', dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    assert.deepEqual(new Set(both.map(r => r.id)), new Set([a, b]));
    const lower = await rows({ reportType: 'monthly', dateFrom: '2026-01-01' });
    assert.deepEqual(new Set(lower.map(r => r.id)), new Set([a, b, c]));
    const upper = await rows({ reportType: 'monthly', dateTo: '2026-01-31' });
    assert.deepEqual(new Set(upper.map(r => r.id)), new Set([a, b, d]));
    assert.equal(both[0].date !== '2020-06-05', true, 'Registration timestamp is exposed as date');
  });

  it('monthly excludes imports, soft deletes and daily books; direction and status are enforced', async () => {
    const incoming = await book({ direction: 'وارد', status: 'مكتمل' });
    const outgoingImported = await book({ direction: 'صادر', imported: true });
    const internal = await book({ direction: 'داخلي' });
    await book({ direction: 'وارد', deleted: true });
    await book({ direction: 'وارد', daily: true });
    const monthly = await rows({ reportType: 'monthly' });
    assert.deepEqual(new Set(monthly.map(r => r.id)), new Set([incoming, internal]));
    assert.deepEqual((await rows({ reportType: 'monthly', status: 'مكتمل' })).map(r => r.id), [incoming]);
    assert.deepEqual((await rows({ reportType: 'incoming' })).map(r => r.id), [incoming]);
    assert.deepEqual((await rows({ reportType: 'outgoing' })).map(r => r.id), [outgoingImported]);
    assert.deepEqual((await rows({ reportType: 'incoming', type: 'صادر' })).map(r => r.id), []);
    assert.deepEqual((await rows({ reportType: 'monthly', type: 'داخلي' })).map(r => r.id), [internal]);
    assert.equal((await rows({ reportType: 'monthly' }, director)).length, 2);
  });

  it('employee filter uses actual M:N link and does not multiply book rows', async () => {
    const person = await employee('منتسب أ');
    const other = await employee('منتسب ب');
    const selected = await book();
    const notSelected = await book();
    await pool.query(`
      INSERT INTO transaction_employees (transaction_id, employee_id, relationship_type)
      VALUES ($1, $2, 'subject'), ($1, $2, 'recipient'),
             ($1, $3, 'beneficiary'), ($4, $3, 'subject')
    `, [selected, person, other, notSelected]);
    assert.deepEqual(
      (await rows({ reportType: 'monthly', employee: person })).map(r => r.id), [selected],
    );
    assert.equal((await rows({ reportType: 'monthly', employee: 'not-a-uuid' })).length, 0);
  });

  it('shared scope SQL filters public, revoked, granted, administrative and daily data', async () => {
    const person = await employee('منتسب ج');
    const publicId = await book();
    const grantedId = await book({ visibility: 'SpecificEmployees' });
    const revokedId = await book({ visibility: 'SpecificEmployees' });
    await book({ visibility: 'Administrative' });
    await book({ daily: true });
    await pool.query(`
      INSERT INTO transaction_availability(transaction_id, employee_id, revoked_at)
      VALUES ($1, $3, NULL), ($2, $3, now())
    `, [grantedId, revokedId, person]);
    const scope: TransactionScopeFilter = {
      visibilityIn: ['PublicToEmployees'],
      availableToEmployeeId: person,
      availabilityScope: 'SpecificEmployees',
      excludeDailySituations: true,
    };
    // Exercise the shared scope predicate directly. The report SQL builder
    // now rejects employee book reports before SQL until each source is approved.
    const params: unknown[] = [];
    const { transactionScopeCondition } = await import('../../src/repositories/transactionScopeSql');
    const predicate = transactionScopeCondition(scope, 't', params);
    const actual = await pool.query<{ id: string }>(
      'SELECT t.id FROM transactions t WHERE t.deleted_at IS NULL AND t.is_daily_situation = false AND (' + predicate + ')',
      params,
    );
    assert.deepEqual(new Set(actual.rows.map(r => r.id)), new Set([publicId, grantedId]));
  });

  it('unsupported fields, missing calendar timezone and ViewLog report fail explicitly', async () => {
    for (const field of ['section', 'source'] as const) {
      await assert.rejects(
        rows({ reportType: 'monthly', [field]: 'غير محدد' }),
        ReportFilterUnavailableError,
      );
    }
    const noZone = new PgReportRepository(pool);
    await assert.rejects(
      noZone.list('monthly', { reportType: 'monthly', dateFrom: '2026-01-01' }, admin),
      ReportDateZoneRequiredError,
    );
    await assert.rejects(
      rows({ reportType: 'circularsAndAcknowledgements' }), ReportNotImplementedError,
    );
  });
  it('P1f: book-status report includes imports but excludes archived and daily records', async () => {
    const incoming=await book({direction:'وارد',status:'قيد المراجعة'});
    const imported=await book({direction:'صادر',status:'مكتمل',imported:true});
    const internal=await book({direction:'داخلي',status:'مكتمل'});
    await book({direction:'وارد',deleted:true});
    await book({direction:'صادر',daily:true});
    const service=new ReportApiService(repository);
    const situation=await service.run({reportType:'situation'},admin);
    assert.deepEqual(new Set(situation.rows.map(r=>r.id)),new Set([incoming,imported,internal]));
    assert.deepEqual(situation.summary.bookStatistics,{
      totalBooks:3,incoming:1,outgoing:1,internal:1,
      statuses:{'قيد المراجعة':1,'مكتمل':2},
    });
    assert.equal(situation.summary.totalCount,3);
    const monthly=await service.run({reportType:'monthly'},admin);
    assert.deepEqual(new Set(monthly.rows.map(r=>r.id)),new Set([incoming,internal]));
    assert.deepEqual(monthly.summary.bookStatistics,{
      totalBooks:2,incoming:1,outgoing:0,internal:1,
      statuses:{'قيد المراجعة':1,'مكتمل':1},
    });
    const directorResult=await service.run({reportType:'situation'},director);
    assert.deepEqual(directorResult.summary.bookStatistics,situation.summary.bookStatistics);
  });

  it('P1f: status and employee filters narrow both visible rows and all statistics',async()=>{
    const person=await employee('subject');
    const other=await employee('other');
    const a=await book({direction:'وارد',status:'مكتمل'});
    const b=await book({direction:'داخلي',status:'مكتمل'});
    const c=await book({direction:'صادر',status:'قيد المراجعة'});
    await pool.query(`
      INSERT INTO transaction_employees(transaction_id,employee_id,relationship_type)
      VALUES ($1,$4,'subject'),($1,$4,'recipient'),($2,$4,'assigned'),($3,$5,'subject')
    `,[a,b,c,person,other]);
    const service=new ReportApiService(repository);
    const result=await service.run({reportType:'situation',employee:person,status:'مكتمل'},admin);
    assert.deepEqual(new Set(result.rows.map(r=>r.id)),new Set([a,b]));
    assert.deepEqual(result.summary.bookStatistics,{
      totalBooks:2,incoming:1,outgoing:0,internal:1,
      statuses:{'قيد المراجعة':0,'مكتمل':2},
    });
    const none=await service.run({reportType:'situation',type:'صادر',employee:person},admin);
    assert.equal(none.summary.totalCount,0);
    assert.deepEqual(none.summary.bookStatistics,{
      totalBooks:0,incoming:0,outgoing:0,internal:0,
      statuses:{'قيد المراجعة':0,'مكتمل':0},
    });
  });

  it('P1f: book-status dates use local registration, and unavailable mappings remain closed',async()=>{
    const old=await book({registered:'2026-01-31T20:30:00Z',date:'2020-01-01'});
    const recent=await book({registered:'2026-01-31T21:30:00Z',date:'2019-01-01'});
    const result=await repository.list('situation',{
      reportType:'situation',dateFrom:'2026-02-01',
    },admin);
    assert.deepEqual(result.map(r=>r.id),[recent]);
    assert.deepEqual((await repository.list('situation',{
      reportType:'situation',dateTo:'2026-01-31',
    },admin)).map(r=>r.id),[old]);
    await assert.rejects(repository.list('situation',{
      reportType:'situation',section:'unknown',
    },admin),ReportFilterUnavailableError);
    await assert.rejects(repository.list('situation',{
      reportType:'situation',source:'unknown',
    },admin),ReportFilterUnavailableError);
    const repoNoZone=new PgReportRepository(pool);
    await assert.rejects(repoNoZone.list('situation',{
      reportType:'situation',dateTo:'2026-01-31',
    },admin),ReportDateZoneRequiredError);
  });


  it('P1g: independent original document-date bounds never change registration date filtering',async()=>{
    const a=await book({date:'2019-01-15',registered:'2026-01-15T10:00:00Z'});
    const b=await book({date:'2020-01-15',registered:'2026-01-15T10:00:00Z'});
    const c=await book({date:'2019-01-15',registered:'2026-02-15T10:00:00Z'});
    const service=new ReportApiService(repository);
    const q=await service.run({
      reportType:'monthly',dateFrom:'2026-01-01',dateTo:'2026-01-31',
      documentDateFrom:'2019-01-01',documentDateTo:'2019-12-31',
    },admin);
    assert.deepEqual(q.rows.map(r=>r.id),[a]);
    assert.equal(q.summary.totalCount,1);
    assert.equal(q.summary.bookStatistics?.incoming,1);
    assert.equal(q.summary.appliedFilters?.['تاريخ الكتاب من'],'2019-01-01');
    assert.equal(q.summary.appliedFilters?.['تاريخ الكتاب إلى'],'2019-12-31');
    const docOnly=await repository.list('monthly',{
      reportType:'monthly',documentDateFrom:'2020-01-01',
    },admin);
    assert.deepEqual(docOnly.map(r=>r.id),[b]);
    const dateTo=await repository.list('situation',{
      reportType:'situation',documentDateTo:'2019-12-31',
    },admin);
    assert.deepEqual(new Set(dateTo.map(r=>r.id)),new Set([a,c]));
    const noZone=new PgReportRepository(pool);
    assert.deepEqual((await noZone.list('monthly',{
      reportType:'monthly',documentDateTo:'2019-12-31',
    },admin)).map(r=>r.id).sort(),[a,c].sort(),
      'Pure PostgreSQL DATE filtering is independent from configured registration timezone');
  });

  it('P1g: original document-date values are SQL bind parameters, not interpolated',async()=>{
    const params:unknown[]=[];
    const sql=buildTransactionsQuery('incoming',{
      reportType:'incoming',documentDateFrom:"2020-05-01' OR TRUE --",
    },params,admin,null);
    assert.ok(!sql.sql.includes("OR TRUE --"));
    assert.ok(sql.sql.includes('t.document_date >= $1::date'));
    assert.deepEqual(sql.params,["2020-05-01' OR TRUE --"]);
  });

});
