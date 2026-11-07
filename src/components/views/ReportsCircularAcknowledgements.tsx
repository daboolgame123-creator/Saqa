/** Phase 23 C10 — privileged ViewLog report projection for the UNMOUNTED candidate UI.
 *
 * Only display fields already returned by the authorized, report-scoped
 * backend. This is NOT a separate privilege grant or an employee own-history
 * projection. Unknown/ambiguous historical identities are never guessed.
 */
import React from 'react';
import type { ReportResponse } from '../../../server/src/api/dto/report';
import type { CandidateReportRole } from '../../api/reportCandidate';

interface Props {
  report: ReportResponse;
  role: CandidateReportRole;
}

/** The report's circular list uses the registration clock, but the ViewLog
 * period uses acknowledged_at. A valid acknowledgement may refer to a
 * circular registered outside the selected period and therefore absent
 * from report.rows.
 */
export const ReportsCircularAcknowledgements: React.FC<Props> = ({report,role}) => {
  if (role !== 'admin' && role !== 'director') return null;
  const result = report.circularAcknowledgements;
  if (!result) return null;

  const stats = result.statistics;
  const titlesById = new Map(report.rows.map(row => [row.id,row.title ?? '']));
  const displayEntries = result.acknowledgements.slice(0,100);
  const fullOperations = stats.acknowledgementOperations === null
    ? 'غير محسوم' : String(stats.acknowledgementOperations);
  const fullEmployees = stats.uniqueEmployees === null
    ? 'غير محسوم' : String(stats.uniqueEmployees);

  return (
    <section dir="rtl" aria-label="تفاصيل الإقرارات الرسمية" className="space-y-3">
      <h4 className="text-sm font-bold">الإعمامات والإقرارات الرسمية</h4>
      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div>الإعمامات المسجلة خلال الفترة: {stats.circularCount}</div>
        <div>إجمالي عمليات الاطلاع: {fullOperations}</div>
        <div>عدد المنتسبين الفريدين: {fullEmployees}</div>
        <div>الإقرارات المتحقق منها: {stats.verifiedAcknowledgementOperations}</div>
        <div>المنتسبون المتحقق منهم: {stats.verifiedUniqueEmployees}</div>
      </dl>
      {!stats.complete && (
        <div role="status" className="rounded-lg border border-amber-300 p-3 text-xs dark:border-amber-700">
          <p className="font-semibold">إحصاءات الاطلاع الكاملة غير محسومة بسبب سجلات تاريخية إشكالية.</p>
          <p>العدد المتحقق منه يمثل سجلات مؤكدة فقط، وليس إجماليًا كاملًا.</p>
          <p>السجلات الإشكالية: {stats.problemRecords}</p>
          <p>بلا هوية منتسب: {stats.problemReasons.missingEmployeeId}</p>
          <p>تعارض الهوية: {stats.problemReasons.identityMismatch}</p>
          <p>تعارض تاريخ الإقرار: {stats.problemReasons.conflictingAcknowledgementTime}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-xs">
          <caption className="py-2 text-right font-semibold">تفاصيل الإقرارات المتحقق منها فقط</caption>
          <thead><tr className="border-b border-stone-300">
            <th scope="col" className="p-2">المنتسب</th>
            <th scope="col" className="p-2">تاريخ الإقرار</th>
            <th scope="col" className="p-2">موضوع الإعمام</th>
          </tr></thead>
          <tbody>{displayEntries.map((entry,index) => (
            <tr key={index} className="border-b border-stone-200">
              <td className="p-2">{entry.employeeName}</td>
              <td className="p-2">{entry.acknowledgedAt}</td>
              <td className="p-2">{titlesById.get(entry.transactionId) ?? 'كتاب خارج فترة التسجيل'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {result.acknowledgements.length > displayEntries.length && (
        <p className="text-xs">تُعرض أول 100 إقرار مؤكد هنا؛ التصدير يخضع لنفس نطاق الوصول وحدود الخادم.</p>
      )}
    </section>
  );
};
