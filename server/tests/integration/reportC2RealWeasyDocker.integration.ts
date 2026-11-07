/**
 * C2 synthetic-only real PDF integration, explicitly invoked by isolated CI.
 * Migrated disposable PostgreSQL → trusted report service and SQL scope →
 * strict data JSON stdin → no-network read-only Docker → WeasyPrint PDF stdout.
 *
 * Outside default DB/API/unit *.test.ts globs; no official HTTP activation.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { reportAccessFor, ReportScopeNotReadyError } from '../../src/authorization/reportAccess';
import { ReportApiService } from '../../src/api/services/reportService';
import { PgReportRepository } from '../../src/repositories/reportRepository';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from '../db/testDb';

const IMAGE = 'alsqaya-p1k-weasyprint-isolated:ci';
const MAX_PDF_BYTES = 12_000_000;
const VISUAL_DIR = join(process.cwd(), 'artifacts', 'phase23-c2-real-pdf');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
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

/**
 * Generate human-reviewable evidence from ACTUAL synthetic WeasyPrint bytes.
 * The manifest is unapproved by definition: raster availability is not a
 * substitute for checking bidirectional text and print fidelity visually.
 * These tests contain generated fixture records only, never staff documents.
 */
function captureSyntheticVisualEvidence(role: 'admin'|'employee'|'ack', pdf: Buffer, pages: number): void {
  assert.ok(pages > 0 && pages < 60, 'Unbounded PDF page count');
  mkdirSync(VISUAL_DIR, { recursive: true });
  const pdfPath = join(VISUAL_DIR, role + '.pdf');
  writeFileSync(pdfPath, pdf);
  const targets: Array<{ label: string; page: number }> = role !== 'employee'
    ? [
        { label: 'first', page: 1 },
        { label: 'middle', page: Math.ceil(pages / 2) },
        { label: 'last', page: pages },
      ]
    : [{ label: 'first', page: 1 }];
  const seen = new Set<number>();
  const images: Array<{ file: string; page: number; sha256: string }> = [];
  for (const target of targets) {
    if (seen.has(target.page)) continue;
    seen.add(target.page);
    const stem = role + '-' + target.label;
    const prefix = join(VISUAL_DIR, stem);
    runTool('pdftoppm', [
      '-f', String(target.page), '-l', String(target.page),
      '-singlefile', '-r', '130', '-png', pdfPath, prefix,
    ]);
    const png = prefix + '.png';
    assert.ok(existsSync(png) && statSync(png).size > 2000,
      'Missing raster sample ' + stem);
    images.push({file:stem+'.png',page:target.page,sha256:sha256(readFileSync(png))});
  }
  const manifest = {
    syntheticOnly: true,
    visualApproval: 'PENDING_HUMAN_REVIEW',
    engine: 'CI_ONLY_WEASYPRINT',
    reportType: role === 'ack' ? 'circularsAndAcknowledgements' : 'incoming',
    role: role === 'ack' ? 'admin' : role,
    sample: role,
    pages,
    pdf:role+'.pdf',
    pdfBytes:pdf.length,
    pdfSha256:sha256(pdf),
    images,
  };
  writeFileSync(join(VISUAL_DIR,'manifest-'+role+'.json'),
    JSON.stringify(manifest,null,2)+'\n','utf8');
  assert.ok(images.length >= 1);
}

function assertEveryRenderedPageHasText(text: string, pages: number): void {
  const chunks = text.split('\f').filter(chunk => chunk.trim().length > 0);
  assert.equal(chunks.length, pages, 'PDF has blank or missing rendered-text pages');
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
      "'مكتمل', '2026-11-06T09:00:00Z'::timestamptz - (n - 1) * interval '1 second'",
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

  async function render(role: 'employee'|'admin', marker: string,
    reportType: 'incoming'|'circularsAndAcknowledgements' = 'incoming') {
    const name = 'alsqaya-c2-ci-' + process.pid + '-' + marker;
    controllerNames.push(name);
    const args=[
      'run','-i','--rm','--pull=never','--name',name,
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
      {reportType},trustedAccess,
      {executable:dockerBin,args,timeoutMs:60_000,maxPdfBytes:MAX_PDF_BYTES},
    );
    assert.equal(exported.mimeType,'application/pdf');
    assert.equal(exported.fileName,'alsqaya-'+reportType+'.pdf');
    const parsed=extractPdf(exported.content);
    assert.ok(parsed.fonts.toLowerCase().includes('dejavu'),
      'Expected DejaVu glyph font must appear in the real PDF');
    assert.ok(noContainer(name),'Successful Docker invocation left a named container');
    assertEveryRenderedPageHasText(parsed.text, parsed.pages);
    captureSyntheticVisualEvidence(reportType==='circularsAndAcknowledgements'?'ack':role,
      exported.content,parsed.pages);
    return parsed;
  }

  it('employee real PDF contains only scoped book and escaped hostile text',{timeout:120_000},async()=>{
    const parsed=await render('employee','employee');
    assert.equal(parsed.pages,1);
    assert.equal(parsed.text.split('C2_FIRST_001').length - 1,1,
      'Employee book marker must occur once');
    assert.ok(!parsed.text.includes('C2_MIDDLE_021'));
    assert.ok(!parsed.text.includes('C2_LAST_042'));
    assert.ok(!parsed.text.includes('C2_ROW_042'));
    assert.ok(!parsed.text.includes('root:x:'),'Host file contents appeared in PDF');
    for(const id of created){assert.ok(!parsed.text.includes(id),'Internal ID leaked into PDF');}
  });

  it('admin real multi-page PDF preserves first, middle and last records',{timeout:120_000},async()=>{
    const parsed=await render('admin','admin');
    assert.ok(parsed.pages>=2,'Real PDF should span multiple pages');
    // Every one of the 42 authorized synthetic books must survive exactly once.
    for(let n=1;n<=42;n++){
      const label=n===1?'C2_FIRST_001':
        n===21?'C2_MIDDLE_021':
        n===42?'C2_LAST_042':
        'C2_ROW_'+String(n).padStart(3,'0');
      assert.equal(parsed.text.split(label).length-1,1,
        'Expected exactly one real PDF record: '+label);
    }
    // Controlled registration times make the actual first/middle/last page
    // markers reproducible; equal timestamps would sort by random UUID.
    const pageText = parsed.text.split('\f').filter(chunk => chunk.trim().length > 0);
    assert.equal(pageText.length, parsed.pages);
    assert.ok(pageText[0].includes('C2_FIRST_001'), 'Missing first-page record');
    assert.ok(pageText[Math.ceil(parsed.pages/2)-1].includes('C2_MIDDLE_021'),
      'Middle record moved off the sampled middle page');
    assert.ok(pageText[parsed.pages-1].includes('C2_LAST_042'), 'Missing last-page record');
    for(const id of created){assert.ok(!parsed.text.includes(id),'Internal ID leaked into PDF');}
  });

  it('real RTL circular PDF preserves 5 books, 38 verified ViewLog acknowledgements, and denied employee scope',
    {timeout:120_000},async()=>{
    // The first two incoming PDF tests run before this fixture. Creating
    // circulars only here prevents them altering the original 42-book reports.
    const circs=await pool.query<{id:string;number:string}>([
      'INSERT INTO transactions',
      '(number,sequence,document_date,month,direction,category,sub_type,',
      'entity,subject,visibility,status,created_at)',
      "SELECT 'C2-CIRC-'||n::text,'C2-ACK-'||n::text,",
      "'2026-11-06'::date,'2026-11','وارد','إدارية','تعميم',",
      "'SYNTH_CIRC_SOURCE','C2_CIRC_'||lpad(n::text,2,'0'),",
      "'\"PublicToEmployees\"'::jsonb,'مكتمل',",
      "'2026-11-06T07:00:00Z'::timestamptz - n * interval '1 second'",
      'FROM generate_series(1,5) AS n RETURNING id,number',
    ].join(' '));
    assert.equal(circs.rows.length,5);
    const circulars=circs.rows.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
    const employeeIds:string[]=[];
    const userIds:string[]=[];
    for(let n=1;n<=8;n++){
      const label='C2_ACK_EMP_'+String(n).padStart(2,'0');
      const e=await pool.query<{id:string}>(
        'INSERT INTO employees(name,title,department) VALUES($1,$2,$3) RETURNING id',
        [label,'منتسب تجريبي','قسم اصطناعي']);
      const id=e.rows[0].id;
      employeeIds.push(id);
      const u=await pool.query<{id:string}>(
        'INSERT INTO users(username,display_name,role,employee_id) VALUES($1,$2,$3,$4) RETURNING id',
        ['c2-ack-user-'+n,'حساب اختبار '+n,'employee',id]);
      userIds.push(u.rows[0].id);
    }
    let count=0;
    for(let c=0;c<5;c++){
      for(let e=0;e<8;e++){
        if(c===4 && e>=6)continue; // 5*8 - 2 = 38 unique logical operations.
        const instant=new Date(Date.UTC(2026,10,6,10,0,count)).toISOString();
        await pool.query(
          'INSERT INTO view_logs (transaction_id,user_id,employee_id,acknowledged_at,viewed_at,session_ref) '+
          'VALUES($1,$2,$3,$4::timestamptz,$4::timestamptz,$5)',
          [circulars[c].id,userIds[e],employeeIds[e],instant,
            'C2_PRIVATE_SESSION_NEVER_EXPORTED']);
        count++;
      }
    }
    assert.equal(count,38);
    const filter={reportType:'circularsAndAcknowledgements' as const};
    const admin=reportAccessFor({role:'admin',employeeId:null});
    const preview=await service.run(filter,admin);
    assert.equal(preview.rows.length,5);
    assert.equal(preview.circularAcknowledgements?.statistics.circularCount,5);
    assert.equal(preview.circularAcknowledgements?.statistics.acknowledgementOperations,38);
    assert.equal(preview.circularAcknowledgements?.statistics.uniqueEmployees,8);
    assert.equal(preview.circularAcknowledgements?.statistics.problemRecords,0);
    assert.equal(preview.circularAcknowledgements?.statistics.complete,true);
    assert.equal(preview.circularAcknowledgements?.acknowledgements.length,38);

    // The employee cannot ask the C2 worker to render other people's ViewLogs.
    // A non-existent executable proves rejection precedes any worker launch.
    await assert.rejects(
      service.exportIsolatedPdf(filter,reportAccessFor({role:'employee',employeeId:ownerId}),
        {executable:'/does-not-exist/c2-denied',args:[],
          timeoutMs:2000,maxPdfBytes:4096}),
      ReportScopeNotReadyError,
    );

    const parsed=await render('admin','ack','circularsAndAcknowledgements');
    assert.ok(parsed.pages>=2,'Acknowledgements need multiple rendered pages');
    for(let c=1;c<=5;c++){
      const mark='C2_CIRC_'+String(c).padStart(2,'0');
      assert.ok(parsed.text.includes(mark),'Circular missing from real PDF: '+mark);
    }
    for(let e=1;e<=8;e++){
      const label='C2_ACK_EMP_'+String(e).padStart(2,'0');
      const expected=e<=6?5:4;
      assert.equal(parsed.text.split(label).length-1,expected,
        'Verified formal acknowledgements repeated or omitted for '+label);
    }
    assert.ok(parsed.text.includes('الإقرارات الرسمية'),
      'Real PDF missing formal acknowledgement section');
    assert.ok(parsed.text.includes('عدد المنتسبين الفريدين'),
      'Real PDF missing independent unique employee indicator');
    assert.ok(parsed.text.includes('إجمالي عمليات الاطلاع المؤكدة'),
      'Real PDF missing formal operation total indicator');
    for(const id of [...circulars.map(x=>x.id),...employeeIds,...userIds]){
      assert.ok(!parsed.text.includes(id),'Internal UUID leaked into report PDF');
    }
    assert.ok(!parsed.text.includes('C2_PRIVATE_SESSION_NEVER_EXPORTED'),
      'Private ViewLog session leaked');
  });

});
