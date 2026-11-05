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

/** Independent synthetic circular/ViewLog preview: no personnel or production data. */
const circularRows=Array.from({length:5},(_,i)=>({
  id:'circular-'+i,
  date:'2026-02-0'+(i+1)+'T10:00:00Z',
  type:'تعميم',title:'تعميم تجريبي طويل رقم '+(i+1)+' بشأن مراجعة السجلات الإدارية',
}));
const acknowledgements=Array.from({length:38},(_,i)=>({
  transactionId:'circular-'+(i%5),
  employeeId:'preview-employee-'+i,
  employeeName:'منتسب تجريبي ذو اسم عربي طويل '+(i+1),
  acknowledgedAt:'2026-03-'+String(1+(i%28)).padStart(2,'0')+'T14:35:00Z',
}));
const circularReport:ReportResponse={
  rows:circularRows,
  summary:{totalCount:5,generatedAt:'2026-11-05T19:00:00.000Z'},
  circularAcknowledgements:{
    acknowledgements,
    statistics:{
      circularCount:5,
      acknowledgementOperations:38,
      uniqueEmployees:38,
      verifiedAcknowledgementOperations:38,
      verifiedUniqueEmployees:38,
      problemRecords:0,
      problemReasons:{
        missingEmployeeId:0,identityMismatch:0,conflictingAcknowledgementTime:0,
      },
      complete:true,
    },
  },
};
const circularPdf=await renderReportExport(
  'pdf','circularsAndAcknowledgements',circularReport,{arabicPdfFont:font},
);
await writeFile(join(out,'alsqaya-arabic-acknowledgements-synthetic.pdf'),circularPdf.content);
console.log(JSON.stringify({syntheticAcknowledgements:38,circularPdfBytes:circularPdf.content.length}));
