/**
 * C2 synthetic-only real PDF integration, explicitly invoked by isolated CI.
 * Migrated disposable PostgreSQL → trusted report service and SQL scope →
 * strict data JSON stdin → no-network read-only Docker → WeasyPrint PDF stdout.
 *
 * Outside default DB/API/unit *.test.ts globs; no official HTTP activation.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { reportAccessFor } from '../../src/authorization/reportAccess';
import { ReportApiService } from '../../src/api/services/reportService';
import { PgReportRepository } from '../../src/repositories/reportRepository';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from '../db/testDb';

const IMAGE = 'alsqaya-p1k-weasyprint-isolated:ci';
const MAX_PDF_BYTES = 12_000_000;
function runTool(binary: string, args: string[], input?: Buffer) {
  const r = spawnSync(binary, args, { input, maxBuffer: 14_000_000, encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0 || r.error) {
    throw new Error(binary + ' failed: ' + String(r.stderr).slice(0, 400));
  }
  return r.stdout;
}
const dockerBin = runTool('which', ['docker']).trim();
assert.ok(dockerBin.startsWith('/'), 'Docker CLI executable must be absolute');
const noContainer = (name: string): boolean => {
  const r = spawnSync(dockerBin, ['container','inspect',name], {stdio:'ignore',timeout:15_000});
  return r.status !== 0;
};
function extractPdf(pdf: Buffer): {text: string; pages: number; fonts: string} {
  assert.ok(pdf.length > 1000 && pdf.length < MAX_PDF_BYTES);
  assert.equal(pdf.subarray(0,5).toString('ascii'),'%PDF-');
  const text = runTool('pdftotext',['-layout','-enc','UTF-8','-','-'],pdf);
  const info = runTool('pdfinfo',['-'],pdf);
  const fonts = runTool('pdffonts',['-'],pdf);
  const match = /^Pages:\s+(\d+)/m.exec(info);
  assert.ok(match, 'PDF must be recognized by a real PDF parser');
  return {text,pages:Number(match[1]),fonts};
}

describe('C2 real WeasyPrint inside a CI-only isolated Docker candidate', () => {
  let pool: Pool;
  let service: ReportApiService;
  let ownerId: string;
  const created: string[] = [];
  const controllerNames: string[] = [];

  before(async () => {
    assert.equal(process.platform,'linux', 'Real Docker proof is Linux-only');
    ({pool} = await startTestDatabase());
    await resetDomainTables(pool);
    service = new ReportApiService(new PgReportRepository(pool,'Asia/Baghdad'));
    const person = await pool.query<{id:string}>(
      "INSERT INTO employees(name,title,department) VALUES('C2_DOCKER_EMPLOYEE','منتسب','اختبار') RETURNING id",
    );
    ownerId=person.rows[0].id;
    const rows=await pool.query<{id:string}>([
      "INSERT INTO transactions",
      "(number,sequence,document_date,month,direction,category,sub_type,",
      "entity,subject,visibility,status,created_at)",
      "SELECT 'C2-'||lpad(n::text,3,'0'), 'C2-'||n::text,",
      "'2026-11-06'::date, '2026-11','وارد','إدارية','اختبار',",
      "'SYNTH_ONLY',",
      "CASE n WHEN 1 THEN 'C2_FIRST_001 <img src=\"file:///etc/passwd\">'",
      "WHEN 21 THEN 'C2_MIDDLE_021'",
      "WHEN 42 THEN 'C2_LAST_042'",
      "ELSE 'C2_ROW_'||lpad(n::text,3,'0') END,",
      "CASE WHEN n=1 THEN '\"PublicToEmployees\"'::jsonb",
      "ELSE '\"Administrative\"'::jsonb END,",
      "'مكتمل', '2026-11-06T09:00:00Z'::timestamptz",
      "FROM generate_series(1,42) AS n RETURNING id",
    ].join(' '));
    created.push(...rows.rows.map(x=>x.id));
    assert.equal(created.length,42);
  },{timeout:120_000});
  after(async()=>{
    for (const name of controllerNames) {
      // Test-only emergency cleanup, NOT a production container lifecycle proof.
      spawnSync(dockerBin,['rm','-f',name],{stdio:'ignore',timeout:15_000});
    }
    await stopTestDatabase();
  });

  async function render(role: 'employee'|'admin', marker: string) {
    const name = 'alsqaya-c2-ci-' + process.pid + '-' + marker;
    controllerNames.push(name);
    const args=[
      'run','--rm','--pull=never','--name',name,
      '--network=none','--read-only','--user=10001:10001',
      '--cap-drop=ALL','--security-opt=no-new-privileges',
      '--pids-limit=64','--memory=768m','--cpus=1',
      '--ulimit=nofile=1024:1024','--ulimit=core=0:0',
      '--ulimit=fsize=12582912:12582912',
      '--tmpfs=/tmp:rw,nosuid,nodev,size=16m,mode=1777',
      '--entrypoint=python', IMAGE, '/opt/p1k/stdinworker.py',
    ];
    const trustedAccess=reportAccessFor({
      role,employeeId:role==='employee'?ownerId:null,
    });
    const exported=await service.exportIsolatedPdf(
      {reportType:'incoming'},trustedAccess,
      {executable:dockerBin,args,timeoutMs:60_000,maxPdfBytes:MAX_PDF_BYTES},
    );
    assert.equal(exported.mimeType,'application/pdf');
    assert.equal(exported.fileName,'alsqaya-incoming.pdf');
    const parsed=extractPdf(exported.content);
    assert.ok(parsed.fonts.toLowerCase().includes('dejavu'),
      'Expected DejaVu glyph font must appear in the real PDF');
    assert.ok(noContainer(name),'Successful Docker invocation left a named container');
    return parsed;
  }

  it('employee real PDF contains only scoped book and escaped hostile text',async()=>{
    const parsed=await render('employee','employee');
    assert.equal(parsed.pages,1);
    assert.ok(parsed.text.includes('C2_FIRST_001'));
    assert.ok(!parsed.text.includes('C2_MIDDLE_021'));
    assert.ok(!parsed.text.includes('C2_LAST_042'));
    assert.ok(!parsed.text.includes('C2_ROW_042'));
    assert.ok(!parsed.text.includes('root:x:'),'Host file contents appeared in PDF');
    for(const id of created){assert.ok(!parsed.text.includes(id),'Internal ID leaked into PDF');}
  },{timeout:120_000});

  it('admin real multi-page PDF preserves first, middle and last records',async()=>{
    const parsed=await render('admin','admin');
    assert.ok(parsed.pages>=2,'Real PDF should span multiple pages');
    for(const marker of ['C2_FIRST_001','C2_MIDDLE_021','C2_LAST_042']){
      assert.ok(parsed.text.includes(marker),'Missing synthetic record '+marker);
    }
    for(const id of created){assert.ok(!parsed.text.includes(id),'Internal ID leaked into PDF');}
  },{timeout:120_000});
});
