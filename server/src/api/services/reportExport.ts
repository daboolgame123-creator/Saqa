/** Phase 23/P1h — export only an already scoped ReportResponse.
 * Never take rows, names, permissions, or metrics from request bodies.
 * All HTTP report/export routes remain blocked by the independent 503 gate.
 */
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import type { ExportResult, ReportResponse } from '../dto/report';
import type { ReportType } from '../../repositories/contracts';

const require = createRequire(import.meta.url);

interface PdfDocument {
  font(font: Buffer): this;
  fontSize(size: number): this;
  readonly y: number;
  readonly page: { height: number; margins: { top: number; bottom: number } };
  heightOfString(value: string, options?: Record<string, unknown>): number;
  text(value: string, options?: Record<string, unknown>): this;
  moveDown(lines?: number): this;
  addPage(): this;
  on(event: string, cb: (data?: Buffer) => void): this;
  end(): void;
}
const PdfKit = require('pdfkit') as new (options: Record<string, unknown>) => PdfDocument;

export class ReportExportUnavailableError extends Error {
  readonly code = 'REPORT_EXPORT_UNAVAILABLE';
  constructor(message: string) { super(message); this.name = 'ReportExportUnavailableError'; }
}

const MAX_ROWS = 2000;
const MAX_CELL_LENGTH = 4000;
// Separate resource budgets: XLSX is bounded in both rows and total text;
// PDFKit embeds glyphs, wraps content and buffers pages, so it has a more
// conservative preflight limit pending operational font/layout approval.
const MAX_TOTAL_CHARACTERS = 2_000_000;
const MAX_PDF_ROWS = 250;
const MAX_PDF_ROW_CHARACTERS = 1200;
const MAX_PDF_CHARACTERS = 180_000;
const DETAIL_HEADERS = ['التاريخ', 'النوع', 'القسم', 'المنتسب', 'الحالة', 'المصدر', 'العنوان', 'الملاحظات'] as const;
const ACK_HEADERS = ['المنتسب', 'تاريخ الإقرار', 'موضوع الكتاب'] as const;
type TextRow = readonly string[];
export interface ReportExportModel {
  title: string;
  summary: readonly (readonly [string, string])[];
  details: readonly TextRow[];
  acknowledgements: readonly TextRow[];
  hasAcknowledgements: boolean;
}

function safeText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean'
      && !(value instanceof Date)) {
    throw new ReportExportUnavailableError('Non-scalar report field cannot be exported');
  }
  const content = value instanceof Date ? value.toISOString() : String(value);
  if (content.length > MAX_CELL_LENGTH) {
    throw new ReportExportUnavailableError('Report cell exceeds export safety limit');
  }
  return content;
}

const titleFor: Record<ReportType, string> = {
  monthly:'التقرير الشهري', incoming:'الكتب الواردة',
  outgoing:'الكتب الصادرة', situation:'حالات الكتب',
  leaves:'الإجازات', timePermissions:'الزمنيات',
  circularsAndAcknowledgements:'الإعمامات والاطلاع الرسمي',
  requests:'الطلبات', employees:'المنتسبون',
  researchers:'الباحثون', professors:'الأساتذة',
};

export function buildReportExportModel(
  reportType: ReportType,
  report: ReportResponse,
): ReportExportModel {
  if (!report || !Array.isArray(report.rows) || !report.summary ||
      report.summary.totalCount !== report.rows.length ||
      !Number.isSafeInteger(report.summary.totalCount) || report.summary.totalCount < 0) {
    throw new ReportExportUnavailableError('Inconsistent report rows and summary');
  }
  if (report.rows.length > MAX_ROWS) {
    throw new ReportExportUnavailableError('Report exceeds the approved export row limit');
  }
  if (reportType === 'researchers' || reportType === 'professors') {
    throw new ReportExportUnavailableError('Unimplemented report cannot be exported');
  }
  const summary: [string,string][] = [
    ['نوع التقرير', safeText(titleFor[reportType])],
    ['عدد السجلات', String(report.summary.totalCount)],
    ['تاريخ الإنشاء', safeText(report.summary.generatedAt)],
  ];
  if (report.summary.period) summary.push(['الفترة', safeText(report.summary.period)]);
  for (const [name, value] of Object.entries(report.summary.appliedFilters ?? {})) {
    summary.push(['فلتر: ' + safeText(name), safeText(value)]);
  }
  if (report.summary.bookStatistics) {
    const b=report.summary.bookStatistics;
    if (b.totalBooks !== report.rows.length ||
        b.incoming + b.outgoing + b.internal !== b.totalBooks ||
        b.statuses['قيد المراجعة'] + b.statuses['مكتمل'] !== b.totalBooks) {
      throw new ReportExportUnavailableError('Inconsistent book statistics');
    }
    summary.push(['إجمالي الكتب',String(b.totalBooks)], ['الوارد',String(b.incoming)],
      ['الصادر',String(b.outgoing)], ['الداخلي',String(b.internal)],
      ['قيد المراجعة',String(b.statuses['قيد المراجعة'])],
      ['مكتمل',String(b.statuses['مكتمل'])]);
  }
  const details = report.rows.map(row => ([
    safeText(row.date), safeText(row.type), safeText(row.section),
    safeText(row.employee), safeText(row.status), safeText(row.source),
    safeText(row.title), safeText(row.notes),
  ]));
  const hasAcknowledgements=reportType==='circularsAndAcknowledgements';
  const acknowledgements: string[][]=[];
  if (hasAcknowledgements) {
    const a=report.circularAcknowledgements;
    if (!a || !Array.isArray(a.acknowledgements) ||
        a.statistics.circularCount !== report.rows.length ||
        a.acknowledgements.length > MAX_ROWS) {
      throw new ReportExportUnavailableError('Missing or inconsistent ViewLog report');
    }
    const stats=a.statistics;
    if (stats.verifiedAcknowledgementOperations !== a.acknowledgements.length ||
        (stats.complete && (stats.problemRecords !== 0 ||
          stats.acknowledgementOperations !== a.acknowledgements.length))) {
      throw new ReportExportUnavailableError('Inconsistent ViewLog statistics');
    }
    summary.push(['إجمالي عمليات الاطلاع المؤكدة',
      stats.acknowledgementOperations === null ? 'غير محسوم' : String(stats.acknowledgementOperations)],
      ['عدد المنتسبين الفريدين',
        stats.uniqueEmployees === null ? 'غير محسوم' : String(stats.uniqueEmployees)],
      ['الإقرارات المتحقق منها',String(stats.verifiedAcknowledgementOperations)],
      ['المنتسبون المتحقق منهم',String(stats.verifiedUniqueEmployees)],
      ['السجلات الإشكالية',String(stats.problemRecords)],
      ['سجلات بلا هوية منتسب',String(stats.problemReasons.missingEmployeeId)],
      ['سجلات بتعارض الهوية',String(stats.problemReasons.identityMismatch)],
      ['سجلات بتعارض وقت الإقرار',String(stats.problemReasons.conflictingAcknowledgementTime)],
      ['اكتمال التحقق',stats.complete ? 'نعم' : 'لا']);
    const byId=new Map(report.rows.map(r=>[r.id, safeText(r.title)]));
    for (const entry of a.acknowledgements) {
      // Circulars can be acknowledged long after creation: the report's
      // registration-date row selection must not limit acknowledgement entries.
      const title=byId.get(entry.transactionId) ?? 'كتاب خارج فترة التسجيل';
      acknowledgements.push([
        safeText(entry.employeeName),safeText(entry.acknowledgedAt),title,
      ]);
    }
  } else if (report.circularAcknowledgements !== undefined) {
    throw new ReportExportUnavailableError('ViewLog fields on non-ViewLog report');
  }
  // Fail before constructing an XLSX/PDF buffer; neither renderer may
  // silently truncate content to meet its resource cap.
  const totalChars = [...summary.flat(),...details.flat(),...acknowledgements.flat()]
    .reduce((sum,value)=>sum+value.length,0);
  if (totalChars > MAX_TOTAL_CHARACTERS) {
    throw new ReportExportUnavailableError('Report exceeds the total text export budget');
  }
  return {
    title:titleFor[reportType],
    summary,details,acknowledgements,hasAcknowledgements,
  };
}

function sheet(
  workbook: ExcelJS.Workbook, name: string, headers: readonly string[],
  data: readonly TextRow[],
): void {
  const ws=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
  ws.addRow([...headers]);
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF16425B'}};
  ws.getRow(1).alignment={horizontal:'right'};
  // Excel formula-injection defence belongs to the XLSX renderer only:
  // PDF and the canonical export model retain the original literal value.
  for(const row of data) ws.addRow(row.map(value=>
    /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? "'" + value : value
  ));
  ws.columns=headers.map((_,i)=>({
    width:i===headers.length-1?38:Math.min(32,Math.max(16,headers[i].length+8)),
  }));
  ws.eachRow({includeEmpty:false}, r=>{
    r.alignment={vertical:'top',horizontal:'right',wrapText:true};
    r.eachCell(c=>{c.numFmt='@';});
  });
  ws.autoFilter={from:'A1',to:{row:1,column:headers.length}};
}

async function asExcel(model: ReportExportModel): Promise<Buffer> {
  const workbook=new ExcelJS.Workbook();
  workbook.creator='ALSQAYA Reports';
  sheet(workbook,'الملخص',['المؤشر','القيمة'],model.summary);
  sheet(workbook,'التفاصيل',DETAIL_HEADERS,model.details);
  if(model.hasAcknowledgements){
    sheet(workbook,'الإقرارات',ACK_HEADERS,model.acknowledgements);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function asPdf(model: ReportExportModel, arabicFont: Buffer | undefined): Promise<Buffer> {
  // Validate resource caps before handing any data to PDFKit.
  if (model.details.length > MAX_PDF_ROWS ||
      model.acknowledgements.length > MAX_PDF_ROWS ||
      model.details.some(row=>row.join('').length > MAX_PDF_ROW_CHARACTERS) ||
      model.acknowledgements.some(row=>row.join('').length > MAX_PDF_ROW_CHARACTERS) ||
      [...model.summary.flat(),...model.details.flat(),...model.acknowledgements.flat()]
        .reduce((sum,value)=>sum+value.length,0) > MAX_PDF_CHARACTERS) {
    throw new ReportExportUnavailableError('PDF report exceeds the safe page/text budget');
  }
  if (!arabicFont || arabicFont.length < 1000) {
    throw new ReportExportUnavailableError('Explicit Arabic-capable PDF font is required');
  }
  return new Promise<Buffer>((resolve,reject)=>{
    let doc: PdfDocument;
    try {
      doc=new PdfKit({size:'A4',margin:42,compress:true});
      doc.font(arabicFont);
    }catch(error){reject(error);return;}
    const chunks:Buffer[]=[];
    doc.on('data',data=>{if(data)chunks.push(Buffer.from(data));});
    doc.on('error',(error)=>reject(error));
    doc.on('end',()=>resolve(Buffer.concat(chunks)));
    const line=(value:string,bold=false)=>{
      doc.fontSize(bold?13:10);
      doc.text(value,{align:'right',lineGap:4});
      doc.moveDown(0.25);
    };
    try {
      line(model.title,true);
      line('الملخص الإحصائي',true);
      for(const [key,value] of model.summary)line(key+' : '+value);
      doc.addPage();
      line('جدول التفاصيل',true);
      line(DETAIL_HEADERS.join(' | '));
      // P1k: keep each entire detail record on one page. PDFKit otherwise
      // splits a wrapped record across a page boundary without its identifier.
      model.details.forEach((row,index)=>{
        const record=[
          'سجل رقم '+(index+1),
          ...row.map((value,i)=>value ? DETAIL_HEADERS[i]+': '+value : '').filter(Boolean),
        ].join('\n');
        doc.fontSize(10);
        const recordHeight=doc.heightOfString(record,{align:'right',lineGap:4});
        const usableHeight=doc.page.height-doc.page.margins.top-doc.page.margins.bottom;
        if(recordHeight+18>usableHeight){
          throw new ReportExportUnavailableError('PDF record cannot fit on one page');
        }
        if(doc.y+recordHeight+18>doc.page.height-doc.page.margins.bottom){
          doc.addPage();
          line('جدول التفاصيل — تابع',true);
        }
        line(record);
      });
      if(model.hasAcknowledgements){
        doc.addPage();
        line('الإقرارات الرسمية',true);
        model.acknowledgements.forEach((row,index)=>{
          const record=[
            'إقرار رقم '+(index+1),
            ...row.map((value,i)=>value ? ACK_HEADERS[i]+': '+value : '').filter(Boolean),
          ].join('\n');
          doc.fontSize(10);
          const recordHeight=doc.heightOfString(record,{align:'right',lineGap:4});
          const usableHeight=doc.page.height-doc.page.margins.top-doc.page.margins.bottom;
          if(recordHeight+18>usableHeight){
            throw new ReportExportUnavailableError('PDF acknowledgement cannot fit on one page');
          }
          if(doc.y+recordHeight+18>doc.page.height-doc.page.margins.bottom){
            doc.addPage();
            line('الإقرارات الرسمية — تابع',true);
          }
          line(record);
        });
      }
      doc.end();
    }catch(error){reject(error);}
  });
}

/** Render a vetted response. The caller MUST have used ReportApiService.run
 * with a trusted session-derived ReportAccessContext; never expose as HTTP.
 */
export async function renderReportExport(
  format:'excel'|'pdf',
  reportType:ReportType,
  report:ReportResponse,
  options:{arabicPdfFont?:Buffer}={},
):Promise<ExportResult> {
  if(format!=='excel' && format!=='pdf')throw new ReportExportUnavailableError('Unknown export format');
  const model=buildReportExportModel(reportType,report);
  const content=format==='excel'
    ?await asExcel(model)
    :await asPdf(model,options.arabicPdfFont);
  return {
    format,content,
    fileName:'alsqaya-'+reportType+'.'+(format==='excel'?'xlsx':'pdf'),
    mimeType:format==='excel'
      ?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      :'application/pdf',
  };
}
