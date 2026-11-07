/**
 * Phase 23/C2: internal application → worker on disposable migrated PostgreSQL.
 * Synthetic-only: NOT real PDF, Docker, HTTP activation or institutional data.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { ReportApiService } from '../../src/api/services/reportService';
import { PgReportRepository } from '../../src/repositories/reportRepository';
import { reportAccessFor, ReportScopeNotReadyError } from '../../src/authorization/reportAccess';
import type { ReportRepository } from '../../src/repositories/contracts';
import { ReportPdfInputError } from '../../src/api/services/reportPdfInput';
import { ReportPdfWorkerError } from '../../src/api/services/reportPdfWorker';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

const sourceCode = [
  "const chunks=[];",
  "process.stdin.on('data',b=>chunks.push(b));",
  "process.stdin.on('end',()=>{",
  "const doc=JSON.parse(Buffer.concat(chunks).toString('utf8'));",
  "if(doc.schemaVersion!==1||!Array.isArray(doc.details)||Object.keys(doc).length!==6){process.exitCode=12;return;}",
  "const encoded=Buffer.from(JSON.stringify(doc),'utf8').toString('base64');",
  "process.stdout.write('%PDF-1.4\\n'+'x'.repeat(90)+'\\n'+encoded+'\\n%%EOF\\n');",
  "});",
].join('\n');

const worker = {
  executable: process.execPath, args: ['-e', sourceCode],
  timeoutMs: 5000, maxPdfBytes: 100_000,
};

function decodedTransport(content: Buffer): {
  schemaVersion: number; title: string; details: string[][]; summary: string[][];
} {
  // Test-only Base64 transport fixture, not a real PDF document.
  const lines = content.toString('utf8').trimEnd().split('\n');
  assert.equal(lines[0], '%PDF-1.4');
  assert.equal(lines[3], '%%EOF');
  return JSON.parse(Buffer.from(lines[2], 'base64').toString('utf8'));
}

describe('C2 internal authorized handoff on migrated synthetic PostgreSQL', () => {
  let pool: Pool;
  let service: ReportApiService;
  let ownerId: string;
  let publicId: string;
  let adminId: string;

  before(async () => {
    ({ pool } = await startTestDatabase());
    service = new ReportApiService(new PgReportRepository(pool, 'Asia/Baghdad'));
  });
  after(async () => { await stopTestDatabase(); });
  beforeEach(async () => {
    await resetDomainTables(pool);
    const person=await pool.query<{id:string}>(
      "INSERT INTO employees(name,title,department) VALUES('SYNTH_OWNER','منتسب','قسم') RETURNING id",
    );
    ownerId=person.rows[0].id;
    const addBook=async(title:string,visibility:string):Promise<string>=>{
      const result=await pool.query<{id:string}>(
        "INSERT INTO transactions (number,sequence,document_date,month,direction,category,sub_type,entity,subject,visibility,status,created_at) "+
        "VALUES ('C2-1','C2-1','2026-11-06','2026-11','وارد','إدارية','اختبار','مصدر اصطناعي',$1,$2::jsonb,'مكتمل','2026-11-06T09:00:00Z'::timestamptz) RETURNING id",
        [title,JSON.stringify(visibility)],
      );
      return result.rows[0].id;
    };
    publicId=await addBook('SYNTH_PUBLIC <img src="file:///etc/passwd">','PublicToEmployees');
    adminId=await addBook('SYNTH_ADMIN_ONLY','Administrative');
  });

  it('employee incoming PDF handoff contains only SQL-visible records and no IDs',async()=>{
    const employee=reportAccessFor({role:'employee',employeeId:ownerId});
    const exported=await service.exportIsolatedPdf({reportType:'incoming'},employee,worker);
    assert.equal(exported.format,'pdf');
    assert.equal(exported.mimeType,'application/pdf');
    assert.equal(exported.fileName,'alsqaya-incoming.pdf');
    const input=decodedTransport(exported.content);
    assert.equal(input.schemaVersion,1);
    assert.equal(input.details.length,1);
    assert.equal(input.details[0][6],'SYNTH_PUBLIC <img src="file:///etc/passwd">');
    assert.equal(input.summary.find(row=>row[0]==='عدد السجلات')?.[1],'1');
    for(const forbidden of ['SYNTH_ADMIN_ONLY',publicId,adminId,ownerId]){
      assert.ok(!JSON.stringify(input).includes(forbidden),'unauthorized or internal ID leaked');
    }
    const admin=reportAccessFor({role:'admin',employeeId:null});
    const adminInput=decodedTransport((await service.exportIsolatedPdf(
      {reportType:'incoming'},admin,worker,
    )).content);
    assert.equal(adminInput.details.length,2);
    assert.ok(JSON.stringify(adminInput).includes('SYNTH_ADMIN_ONLY'));
  });

  it('blocked employee report fails before repository or child process access',async()=>{
    let reads=0;
    const repository:ReportRepository={
      async list(){reads++;throw Error('REPOSITORY_REACHED');},
      async readCircularAcknowledgements(){reads++;throw Error('VIEWLOG_REACHED');},
    };
    const guarded=new ReportApiService(repository);
    const employee=reportAccessFor({role:'employee',employeeId:ownerId});
    for(const reportType of ['monthly','situation','outgoing'] as const){
      await assert.rejects(guarded.exportIsolatedPdf(
        {reportType},employee,{...worker,executable:'/nonexistent/never-start-c2-worker'},
      ),ReportScopeNotReadyError);
    }
    assert.equal(reads,0);
  });

  it('oversized input rejects before launch; cancellation rejects without a PDF',async()=>{
    const many:ReportRepository={
      async list(){return Array.from({length:251},(_,i)=>({
        id:'SYNTH_INTERNAL_'+i,date:'2026-11-06',type:'وارد',
        status:'مكتمل',title:'SYNTH_TITLE_'+i,
      }));},
      async readCircularAcknowledgements(){throw Error('UNEXPECTED_VIEWLOG');},
    };
    const admin=reportAccessFor({role:'admin',employeeId:null});
    await assert.rejects(new ReportApiService(many).exportIsolatedPdf(
      {reportType:'incoming'},admin,
      {...worker,executable:'/nonexistent/never-start-c2-worker'},
    ),ReportPdfInputError);

    const controller=new AbortController();
    controller.abort();
    await assert.rejects(service.exportIsolatedPdf(
      {reportType:'incoming'},admin,worker,controller.signal,
    ),ReportPdfWorkerError);
  });
});
