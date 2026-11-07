/** C7b — pre-release, UNMOUNTED official report screen.
 * Keep current ReportsView (availability notice/catalog) until security,
 * target-host and owner approvals. Never replace the 503 notice by this UI
 * merely because the synthetic CI passes.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { ReportFilter, ReportResponse } from '../../../server/src/api/dto/report';
import type { ReportType } from '../../../server/src/repositories/contracts';
import { ApiError } from '../../api/apiClient';
import {
  CANDIDATE_REPORT_LABELS,
  candidateReportFilter,
  candidateReportTypesFor,
  downloadCandidateReport,
  isBookCandidateReport,
  previewCandidateReport,
  type CandidateReportFields,
  type CandidateReportRole,
  type CandidateExportFormat,
} from '../../api/reportCandidate';

interface Props {
  /** Derived by caller from the verified /auth/me server account, not user input. */
  role:CandidateReportRole;
  /** UI convenience only: the server must still require approved Docker config. */
  pdfApproved?:boolean;
}
const EMPTY_FIELDS=(reportType:ReportType):CandidateReportFields=>({reportType});
const BOOK_STATUSES=['قيد المراجعة','مكتمل'] as const;
const DIRECTIONS=['وارد','صادر','داخلي'] as const;

/** Browser-side hint only; real authorization and filters are server-side. */
export const ReportsCandidateView:React.FC<Props>=({role,pdfApproved=false})=>{
  const allowed=candidateReportTypesFor(role);
  const [fields,setFields]=useState<CandidateReportFields>(()=>EMPTY_FIELDS(allowed[0]));
  const [report,setReport]=useState<ReportResponse|null>(null);
  const [acceptedFilter,setAcceptedFilter]=useState<ReportFilter|null>(null);
  const [loading,setLoading]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const sequence=useRef(0);
  const selected=allowed.includes(fields.reportType)?fields.reportType:allowed[0];
  const book=isBookCandidateReport(selected);
  const canFilterEmployee=role!=='employee' && selected!=='circularsAndAcknowledgements';

  useEffect(()=>{
    sequence.current+=1;
    setFields(EMPTY_FIELDS(candidateReportTypesFor(role)[0]));
    setReport(null);
    setAcceptedFilter(null);
    setError(null);
    setLoading(false);
    setDownloading(false);
  },[role]);
  useEffect(()=>()=>{sequence.current+=1;},[]);

  const edit=(patch:Partial<CandidateReportFields>)=>{
    sequence.current+=1; // Discard stale response from an older filter.
    setFields(previous=>({...previous,...patch}));
    setReport(null);
    setAcceptedFilter(null);
    setError(null);
    setLoading(false);
  };
  const selectType=(reportType:ReportType)=>{
    sequence.current+=1;
    setFields(EMPTY_FIELDS(reportType)); // Clear hidden filters on type change.
    setReport(null);
    setAcceptedFilter(null);
    setError(null);
    setLoading(false);
  };
  const explain=(reason:unknown)=>reason instanceof ApiError && reason.status===503
    ?'التقارير الرسمية ما زالت مغلقة حتى الاعتماد.'
    :reason instanceof ApiError && reason.status===400
      ?'المدخلات غير معتمدة؛ راجع التواريخ والفلاتر.'
      :'تعذر إنشاء التقرير؛ لم تُعتمد نتائج جديدة.';

  const load=async()=>{
    const attempt=++sequence.current;
    setLoading(true);
    setError(null);
    setReport(null);
    setAcceptedFilter(null);
    try{
      const filter=candidateReportFilter({...fields,reportType:selected},role);
      if(filter.dateFrom && filter.dateTo && filter.dateFrom>filter.dateTo)
        throw new Error('Invalid registration date range');
      if(filter.documentDateFrom && filter.documentDateTo &&
          filter.documentDateFrom>filter.documentDateTo)
        throw new Error('Invalid document date range');
      const response=await previewCandidateReport(filter);
      if(attempt!==sequence.current)return;
      setReport(response);
      setAcceptedFilter(filter);
    }catch(reason){
      if(attempt===sequence.current)setError(explain(reason));
    }finally{if(attempt===sequence.current)setLoading(false);}
  };
  const download=async(format:CandidateExportFormat)=>{
    if(!acceptedFilter || !report || loading || downloading ||
        (format==='pdf' && !pdfApproved))return;
    const attempt=sequence.current;
    setDownloading(true);
    setError(null);
    try{
      // Exactly the last successfully previewed filter, never a new mutable one.
      const item=await downloadCandidateReport(acceptedFilter,format);
      if(attempt!==sequence.current)return;
      const href=URL.createObjectURL(item.content);
      const link=document.createElement('a');
      link.href=href;
      link.download=item.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(href),1000);
    }catch(reason){
      if(attempt===sequence.current)setError(explain(reason));
    }finally{if(attempt===sequence.current)setDownloading(false);}
  };

  const field=(name:keyof CandidateReportFields,label:string,kind:'date'|'text'='text')=>(
    <label key={name} className="flex flex-col gap-1 text-xs font-medium text-stone-700 dark:text-stone-200">
      <span>{label}</span>
      <input
        type={kind} value={String(fields[name]??'')}
        onChange={event=>edit({[name]:event.target.value})}
        className="rounded-lg border border-stone-300 bg-white p-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        autoComplete="off"
      />
    </label>
  );
  return (
    <section dir="rtl" aria-label="واجهة التقارير الرسمية المرشحة" className="space-y-4">
      <div className="rounded-xl border border-amber-400 bg-amber-50 p-4 dark:bg-stone-900">
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">واجهة التقارير — نسخة قبول غير مفعّلة</h2>
        <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
          لا تُعد هذه المعاينة تقريرًا رسميًا حتى موافقة الأمان والتشغيل. الصلاحيات والفلاتر النهائية تُفرض على الخادم.
        </p>
      </div>
      <form className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
        onSubmit={event=>{event.preventDefault();void load();}}>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          نوع التقرير
          <select value={selected} onChange={event=>selectType(event.target.value as ReportType)}
            className="rounded-lg border border-stone-300 bg-white p-2 text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100">
            {allowed.map(type=><option key={type} value={type}>{CANDIDATE_REPORT_LABELS[type]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {field('dateFrom','تاريخ التسجيل من','date')}
          {field('dateTo','تاريخ التسجيل إلى','date')}
          {book && field('documentDateFrom','تاريخ الكتاب من','date')}
          {book && field('documentDateTo','تاريخ الكتاب إلى','date')}
          {selected==='employees' && field('section','القسم')}
          {canFilterEmployee && field('employee','المعرّف الرسمي للمنتسب')}
          {(selected==='monthly'||selected==='situation')&&(
            <label className="flex flex-col gap-1 text-xs font-medium">
              اتجاه الكتاب
              <select value={fields.type??''} onChange={event=>edit({type:event.target.value})}
                className="rounded-lg border border-stone-300 bg-white p-2 dark:border-stone-700 dark:bg-stone-800">
                <option value="">كل الاتجاهات</option>
                {DIRECTIONS.map(direction=><option key={direction} value={direction}>{direction}</option>)}
              </select>
            </label>
          )}
          {(book||selected==='circularsAndAcknowledgements')&&(
            <label className="flex flex-col gap-1 text-xs font-medium">
              حالة الكتاب
              <select value={fields.status??''} onChange={event=>edit({status:event.target.value})}
                className="rounded-lg border border-stone-300 bg-white p-2 dark:border-stone-700 dark:bg-stone-800">
                <option value="">كل الحالات</option>
                {BOOK_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={loading||downloading}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
            {loading?'جارٍ التحقق...':'معاينة مع صلاحيات الخادم'}
          </button>
          <button type="button" disabled={!acceptedFilter||loading||downloading}
            onClick={()=>void download('excel')}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-50">
            تصدير Excel
          </button>
          <button type="button" disabled={!pdfApproved||!acceptedFilter||loading||downloading}
            title={pdfApproved?'يخضع لموافقة الخادم':'PDF غير معتمد على الخادم'}
            onClick={()=>void download('pdf')}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-50">
            تصدير PDF
          </button>
        </div>
        {error&&<p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>}
      </form>
      {report&&(
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
          aria-label="نتائج التقرير المصرح بها">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">نتائج المعاينة المصرّح بها</h3>
            <span className="font-semibold">عدد السجلات: {report.summary.totalCount}</span>
          </div>
          {report.summary.bookStatistics&&(
            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>الوارد: {report.summary.bookStatistics.incoming}</div>
              <div>الصادر: {report.summary.bookStatistics.outgoing}</div>
              <div>الداخلي: {report.summary.bookStatistics.internal}</div>
              <div>مكتمل: {report.summary.bookStatistics.statuses['مكتمل']}</div>
            </dl>
          )}
          {report.circularAcknowledgements&&(
            <p className="text-xs">
              الإقرارات المؤكدة: {report.circularAcknowledgements.statistics.acknowledgementOperations??'غير محسوم'}
              {' — '}المنتسبون الفريدون: {report.circularAcknowledgements.statistics.uniqueEmployees??'غير محسوم'}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-xs">
              <thead><tr className="border-b border-stone-300">
                <th className="p-2">التاريخ</th><th className="p-2">النوع</th>
                <th className="p-2">المنتسب</th><th className="p-2">الحالة</th>
                <th className="p-2">الموضوع</th>
              </tr></thead>
              <tbody>{report.rows.slice(0,100).map((row,index)=>(
                <tr key={index} className="border-b border-stone-200">
                  <td className="p-2">{String(row.date??'')}</td>
                  <td className="p-2">{row.type??''}</td>
                  <td className="p-2">{row.employee??''}</td>
                  <td className="p-2">{row.status??''}</td>
                  <td className="p-2">{row.title??''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {report.rows.length>100&&<p className="text-xs">
            تُعرض أول 100 نتيجة فقط هنا؛ مجموع التقرير الرسمي موجود في الملخص.
          </p>}
        </div>
      )}
    </section>
  );
};
