/** Phase 23/P1k experimental HTML print probe, NOT a production PDF renderer.
 * Offline / synthetic-only. No HTTP routes, network assets, user data or fonts.
 * Chromium (if present in CI) supplies Unicode bidi and shaping.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir=process.env.ALSQAYA_PREVIEW_DIR;
if(!dir) throw new Error('ALSQAYA_PREVIEW_DIR is required');
function html(value:unknown):string {
  return String(value).replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[char]!);
}
function block(label:string,value:string,ltr=false):string {
  // Unicode bidi isolation is performed by <bdi>, not by reversing text.
  return '<div class="field"><span class="field-label">'+html(label)+'</span>'+
    '<bdi dir="'+(ltr?'ltr':'auto')+'" class="field-value">'+html(value)+'</bdi></div>';
}
function page(title:string,summary:string,body:string):string {
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
  '<title>'+html(title)+'</title><style>'+
  '@page{size:A4;margin:14mm 14mm 16mm 14mm}'+
  'html{direction:rtl;font-family:"DejaVu Sans","Noto Naskh Arabic",sans-serif;color:#152b3e}'+
  'body{margin:0;font-size:10pt;line-height:1.55}h1{font-size:17pt;margin:0 0 4mm}'+
  '.subtitle{color:#536475;font-size:9pt;margin-bottom:5mm}.record{border:1px solid #ccd8e2;'+
  'border-radius:4px;margin:0 0 2mm;padding:1.5mm 3mm;break-inside:avoid;page-break-inside:avoid}'+
  '.record-title{font-weight:700;margin:0 0 1mm;font-size:10pt}.field{display:flex;'+
  'gap:4mm;align-items:flex-start;overflow-wrap:anywhere}.field-label{font-weight:600;'+
  'flex:0 0 29mm}.field-value{display:block;flex:1 1 0;min-width:0;unicode-bidi:isolate}'+
  '.field-value[dir=ltr]{direction:ltr;text-align:left;white-space:nowrap}'+
  '</style></head><body><h1>'+html(title)+'</h1><div class="subtitle">'+html(summary)+
  '</div>'+body+'</body></html>';
}
const details=Array.from({length:85},(_,i)=>{
  const number=i+1;
  const title=i%11===0
    ? 'طلب إداري طويل للتأكد من التفاف الكلمات العربية داخل صفحات التقرير الرسمي والتأكد من عدم تداخل الأسطر مع بعضها عند الطباعة'
    :'الموضوع الإداري التجريبي رقم '+number;
  return '<section class="record"><div class="record-title">سجل رقم '+number+'</div>'+
  block('تاريخ التسجيل','2026-01-'+String(1+(i%28)).padStart(2,'0')+'T12:00:00Z',true)+
  block('النوع',i%3===0?'وارد':i%3===1?'صادر':'داخلي')+
  block('الحالة',i%2===0?'مكتمل':'قيد المراجعة')+
  block('العنوان',title)+
  block('الملاحظات',i%9===0?'ملاحظة فيها رقم 2026/001 والفاصلة، والنقطة.':'ملاحظة اختبار')+
  '</section>';
}).join('');
const ack=Array.from({length:38},(_,i)=>
  '<section class="record"><div class="record-title">إقرار رقم '+(i+1)+'</div>'+
  block('المنتسب','منتسب تجريبي ذو اسم عربي طويل '+(i+1))+
  block('تاريخ الإقرار','2026-03-'+String(1+(i%28)).padStart(2,'0')+'T14:35:00Z',true)+
  block('موضوع الكتاب','تعميم تجريبي طويل بشأن مراجعة السجلات الإدارية رقم '+(1+i%5))+
  '</section>'
).join('');
await mkdir(dir,{recursive:true});
await writeFile(join(dir,'chromium-details-probe.html'),
  page('جدول التفاصيل','بيانات اصطناعية — 85 سجلًا للتجربة فقط',details));
await writeFile(join(dir,'chromium-ack-probe.html'),
  page('الإقرارات الرسمية','بيانات اصطناعية — 38 إقرارًا للتجربة فقط',ack));
console.log('Created two offline synthetic Arabic/RTL HTML print probes');
