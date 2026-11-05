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
import {constants as fsConstants} from 'node:fs';
import {mkdtemp, open, rm, writeFile} from 'node:fs/promises';
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
// Prototype-only process-local backpressure; does NOT replace distributed job limits.
const MAX_CONCURRENT_BROWSER_JOBS=1;
let activeBrowserJobs=0;

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
    // Linux process-group isolation permits terminating the whole browser tree
    // on timeout, not just the Chromium parent PID. Unsupported hosts fail closed.
    if(process.platform!=='linux'){
      reject(new ReportExportUnavailableError('PDF browser requires reviewed Linux process isolation'));
      return;
    }
    const child=spawn(executable,args,{
      shell:false,detached:true,stdio:['ignore','ignore','pipe'],
      env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',LANG:'C.UTF-8'},
    });
    let ended=false;
    let errorMessage='';
    let timedOut=false;
    const killGroup=()=>{
      if(child.pid){
        try{process.kill(-child.pid,'SIGKILL');}
        catch(error){
          // ESRCH: already exited. A failed group kill must not be mistaken for
          // reliable containment; operational isolation remains unapproved.
          if((error as NodeJS.ErrnoException).code!=='ESRCH')child.kill('SIGKILL');
        }
      } else child.kill('SIGKILL');
    };
    const timer=setTimeout(()=>{timedOut=true;killGroup();},timeoutMs);
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
  if(activeBrowserJobs>=MAX_CONCURRENT_BROWSER_JOBS){
    throw new ReportExportUnavailableError('PDF browser busy: concurrency limit reached');
  }
  activeBrowserJobs++;
  let dir:string|undefined;
  try {
    dir=await mkdtemp(join(tmpdir(),'alsqaya-p1k-'));
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
    // The renderer is untrusted. O_NOFOLLOW rejects a PDF output symlink
    // before opening it, so a browser cannot redirect this file read.
    const file=await open(output,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW)
      .catch(()=>{throw new ReportExportUnavailableError('PDF browser output not readable');});
    let pdf:Buffer;
    try {
      const before=await file.stat();
      if(!before.isFile() || !Number.isSafeInteger(before.size) || before.size<50){
        throw new ReportExportUnavailableError('PDF browser produced invalid output');
      }
      if(before.size>MAX_PDF_BYTES){
        throw new ReportExportUnavailableError('PDF browser produced oversized output');
      }
      pdf=Buffer.alloc(before.size);
      let offset=0;
      // FileHandle.read can legally return fewer bytes than requested.
      // Read until the validated size is reached, or reject a short file.
      while(offset<pdf.length){
        const {bytesRead}=await file.read(pdf,offset,pdf.length-offset,offset);
        if(bytesRead===0){
          throw new ReportExportUnavailableError('PDF browser output was truncated');
        }
        offset+=bytesRead;
      }
      const after=await file.stat();
      if(after.size!==before.size){
        throw new ReportExportUnavailableError('PDF browser output changed while reading');
      }
    }finally{await file.close();}
    // Signature and trailer checks reject obvious partial/corrupt output.
    // They are not a substitute for PDF parsing or sandboxing.
    if(pdf.subarray(0,5).toString('ascii')!=='%PDF-' ||
       !/%%EOF\s*$/u.test(pdf.subarray(-2048).toString('latin1'))){
      throw new ReportExportUnavailableError('PDF browser produced invalid output');
    }
    return pdf;
  } finally {
    try {if(dir)await rm(dir,{recursive:true,force:true});}
    finally {activeBrowserJobs--;}
  }
}
