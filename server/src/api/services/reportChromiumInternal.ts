/**
 * Phase 23/P1k — experimental INTERNAL-ONLY Chromium PDF renderer.
 * Not wired to ReportApiService or any HTTP route.
 * Caller must pass ONLY buildReportExportModel() output from an authorized
 * ReportResponse; this module cannot grant permission to access data.
 *
 * Browser process sandboxing and network isolation need independent production
 * security review. Never enable as a production exporter based on these tests.
 */
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {ReportExportModel} from './reportExport';
import {ReportExportUnavailableError} from './reportExport';

const DETAIL_HEADERS=['التاريخ','النوع','القسم','المنتسب','الحالة','المصدر','العنوان','الملاحظات'] as const;
const ACK_HEADERS=['المنتسب','تاريخ الإقرار','موضوع الكتاب'] as const;
const MAX_ROWS=250;
const MAX_ROW_CHARACTERS=1200;
const MAX_TEXT_CHARACTERS=180_000;
const MAX_HTML_BYTES=1_000_000;
const MAX_PDF_BYTES=12_000_000;
const DEFAULT_TIMEOUT_MS=30_000;

function escapeHtml(s:string):string {
  return s.replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
function assertText(value:unknown):asserts value is string {
  if(typeof value!=='string') throw new ReportExportUnavailableError('Invalid PDF model text');
}
function validate(model:ReportExportModel):void {
  if(!model || !Array.isArray(model.summary) || !Array.isArray(model.details) ||
     !Array.isArray(model.acknowledgements) || typeof model.hasAcknowledgements!=='boolean'){
    throw new ReportExportUnavailableError('Invalid PDF export model');
  }
  assertText(model.title);
  if(model.details.length>MAX_ROWS || model.acknowledgements.length>MAX_ROWS ||
    (!model.hasAcknowledgements && model.acknowledgements.length!==0)){
    throw new ReportExportUnavailableError('PDF exceeds approved row budget');
  }
  let characters=model.title.length;
  for(const [rows,columns] of [
    [model.summary,2],
    [model.details,DETAIL_HEADERS.length],
    [model.acknowledgements,ACK_HEADERS.length],
  ] as const) {
    for(const row of rows){
      if(!Array.isArray(row) || row.length!==columns) {
        throw new ReportExportUnavailableError('Invalid PDF row width');
      }
      let rowLength=0;
      for(const value of row){assertText(value);rowLength+=value.length;}
      if(rowLength>(columns===2?4000:MAX_ROW_CHARACTERS)){
        throw new ReportExportUnavailableError('PDF row exceeds text budget');
      }
      characters+=rowLength;
    }
  }
  if(characters>MAX_TEXT_CHARACTERS){
    throw new ReportExportUnavailableError('PDF exceeds total text budget');
  }
}
const isLtr=(s:string)=>/^(?:\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?|\d+(?:[.,/:-]\d+)*)$/u.test(s);
function field(label:string,value:string):string {
  return '<div class="field"><span class="label">'+escapeHtml(label)+'</span>'+
    '<bdi class="value" dir="'+(isLtr(value)?'ltr':'auto')+'">'+escapeHtml(value)+'</bdi></div>';
}
function record(index:number,headers:readonly string[],row:readonly string[],kind:string):string {
  return '<section class="record"><div class="record-title">'+kind+' رقم '+(index+1)+'</div>'+
    row.map((v,i)=>v?field(headers[i],v):'').join('')+'</section>';
}
/** Escapes every user-derived cell; creates a self-contained printable document. */
export function renderSafeReportHtml(model:ReportExportModel):string {
  validate(model);
  const summary=model.summary.map(([key,value])=>field(key,value)).join('');
  const details=model.details.map((r,i)=>record(i,DETAIL_HEADERS,r,'سجل')).join('');
  const acks=model.hasAcknowledgements
    ?'<h2>الإقرارات الرسمية</h2>'+
      model.acknowledgements.map((r,i)=>record(i,ACK_HEADERS,r,'إقرار')).join('')
    :'';
  const page='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
    '<title>تقرير السقاية</title><style>'+
    '@page{size:A4;margin:14mm}html{direction:rtl;font-family:"DejaVu Sans","Noto Naskh Arabic",sans-serif}'+
    'body{color:#203447;font-size:9.5pt;line-height:1.5}h1{font-size:16pt}h2{font-size:12pt;break-after:avoid}'+
    '.record{padding:2mm 3mm;margin:2.5mm 0;border:1px solid #cdd9e2;break-inside:avoid;page-break-inside:avoid}'+
    '.record-title{font-weight:bold}.field{display:flex;gap:3mm;align-items:baseline;overflow-wrap:anywhere}'+
    '.label{font-weight:600;min-width:30mm;flex:none}.value{unicode-bidi:isolate;min-width:0}'+
    '.value[dir=ltr]{direction:ltr;text-align:left}'+
    '</style></head><body><h1>'+escapeHtml(model.title)+'</h1><h2>الملخص الإحصائي</h2>'+
    '<section class="summary">'+summary+'</section><h2>جدول التفاصيل</h2>'+details+acks+'</body></html>';
  if(Buffer.byteLength(page,'utf8')>MAX_HTML_BYTES){
    throw new ReportExportUnavailableError('PDF print HTML exceeds byte budget');
  }
  return page;
}
export interface ChromiumInternalOptions {
  /** Trusted deployment executable absolute path, not supplied by a request. */
  executablePath: string;
  timeoutMs?: number;
  /** CI-only: runner sandbox is already isolated. Never approve for production. */
  ciDisableSandbox?: boolean;
}
async function executeChromium(executable:string,args:string[],timeoutMs:number):Promise<void>{
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(executable,args,{shell:false,stdio:['ignore','ignore','pipe'],env:{
      PATH:process.env.PATH??'',HOME:process.env.HOME??'',LANG:'C.UTF-8',
    }});
    let ended=false;
    let errorMessage='';
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    const finish=(error?:Error)=>{
      if(ended)return;
      ended=true;clearTimeout(timer);
      if(error)reject(error);else resolve();
    };
    child.stderr?.on('data',(buf:Buffer)=>{
      if(errorMessage.length<4096)errorMessage+=buf.toString('utf8').slice(0,512);
    });
    child.once('error',()=>finish(new ReportExportUnavailableError('PDF browser unavailable')));
    child.once('close',code=>{
      if(timedOut)return finish(new ReportExportUnavailableError('PDF browser timeout'));
      if(code!==0)return finish(new ReportExportUnavailableError('PDF browser failed: '+errorMessage.slice(0,250)));
      finish();
    });
  });
}
/**
 * Experimental process boundary: temp files, deadline, output cap, signature
 * and cleanup. Deployment requires independent OS sandbox/network isolation.
 */
export async function renderInternalChromiumPreview(
  model:ReportExportModel,options:ChromiumInternalOptions,
):Promise<Buffer>{
  const html=renderSafeReportHtml(model);
  if(!options || typeof options.executablePath!=='string' ||
     !options.executablePath.startsWith('/') || options.executablePath.includes('\0')){
    throw new ReportExportUnavailableError('Trusted absolute browser path required');
  }
  const timeoutMs=options.timeoutMs??DEFAULT_TIMEOUT_MS;
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>90_000){
    throw new ReportExportUnavailableError('Invalid PDF print deadline');
  }
  if(options.ciDisableSandbox && process.env.CI!=='true'){
    throw new ReportExportUnavailableError('Disabling Chromium sandbox is restricted to CI');
  }
  const dir=await mkdtemp(join(tmpdir(),'alsqaya-p1k-'));
  try {
    const input=join(dir,'report.html'),output=join(dir,'report.pdf');
    await writeFile(input,html,{encoding:'utf8',mode:0o600,flag:'wx'});
    const args=[
      '--headless','--disable-gpu','--disable-extensions','--disable-background-networking',
      '--no-first-run','--no-default-browser-check','--disable-sync',
      '--disable-dev-shm-usage','--no-pdf-header-footer',
      '--user-data-dir='+join(dir,'profile'),
      '--print-to-pdf='+output,
      ...(options.ciDisableSandbox?['--no-sandbox']:[]),
      pathToFileURL(input).href,
    ];
    await executeChromium(options.executablePath,args,timeoutMs);
    const pdf=await readFile(output);
    if(pdf.length<50||pdf.length>MAX_PDF_BYTES||pdf.subarray(0,5).toString()!=='%PDF-'){
      throw new ReportExportUnavailableError('PDF browser produced invalid or oversized output');
    }
    return pdf;
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
}
