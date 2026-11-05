/** P1j: Synthetic Arabic export preview only; no production data or secrets.
 * Used by GitHub Actions to make a PDF and page rasters available for review.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReportResponse } from '../src/api/dto/report';
import { renderReportExport } from '../src/api/services/reportExport';

const out=process.env.ALSQAYA_PREVIEW_DIR;
if (!out) throw new Error('ALSQAYA_PREVIEW_DIR is required for preview output');
const fontPath=process.env.ALSQAYA_PREVIEW_FONT;
if (!fontPath) throw new Error('ALSQAYA_PREVIEW_FONT is required');
const rows=Array.from({length:85},(_,i)=>({
  id:'synthetic-'+i,
  date:'2026-01-'+String(1+(i%28)).padStart(2,'0')+'T12:00:00Z',
  type: i%3===0?'وارد':i%3===1?'صادر':'داخلي',
  status:i%2===0?'مكتمل':'قيد المراجعة',
  title:i%11===0
    ?'طلب إداري طويل للتأكد من التفاف الكلمات العربية داخل صفحات التقرير الرسمي والتأكد من عدم تداخل الأسطر مع بعضها عند الطباعة'
    :'الموضوع الإداري التجريبي رقم '+(i+1),
  notes:i%9===0
    ?'ملاحظة تجريبية متعددة الكلمات: يرجى مراعاة ترتيب العربية والأرقام 2026/001 وعلامات الترقيم في هذه الصفحة.'
    :'ملاحظة اختبار',
}));
const summary:ReportResponse={
  rows,summary:{
    totalCount:rows.length,
    generatedAt:'2026-11-05T19:00:00.000Z',
    period:'من 2026-01-01 إلى 2026-01-31',
    appliedFilters:{'نوع التقرير':'monthly','تاريخ الكتاب من':'2020-01-01'},
    bookStatistics:{
      totalBooks:rows.length,
      incoming:rows.filter(r=>r.type==='وارد').length,
      outgoing:rows.filter(r=>r.type==='صادر').length,
      internal:rows.filter(r=>r.type==='داخلي').length,
      statuses:{
        'قيد المراجعة':rows.filter(r=>r.status==='قيد المراجعة').length,
        'مكتمل':rows.filter(r=>r.status==='مكتمل').length,
      },
    },
  },
};
await mkdir(out,{recursive:true});
const font=await readFile(fontPath);
const pdf=await renderReportExport('pdf','monthly',summary,{arabicPdfFont:font});
await writeFile(join(out,'alsqaya-arabic-report-synthetic.pdf'),pdf.content);
const xlsx=await renderReportExport('excel','monthly',summary);
await writeFile(join(out,'alsqaya-arabic-report-synthetic.xlsx'),xlsx.content);
console.log(JSON.stringify({syntheticRows:rows.length,pdfBytes:pdf.content.length,xlsxBytes:xlsx.content.length}));
