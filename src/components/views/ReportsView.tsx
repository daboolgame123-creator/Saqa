/** Phase 23 / UI-10: safe availability notice, NOT a report data provider.
 *
 * The legacy MonthlyReportView still aggregates UI-loaded transactions.
 * This notice prevents those numbers from being mistaken for the scoped,
 * server-authoritative Phase 23 official reports. The server's report HTTP
 * gate remains 503 REPORTS_UNAVAILABLE until independent sign-off.
 */
import React from 'react';
import { AlertCircle, LockKeyhole } from 'lucide-react';

/** Presentational only: no fetch, exports, session/role assumptions or counts. */
export const ReportsAvailabilityNotice: React.FC = () => (
  <section
    dir="rtl"
    role="status"
    aria-label="حالة التقارير"
    className="mx-auto mb-5 max-w-7xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-stone-900 dark:border-amber-700 dark:bg-stone-900 dark:text-stone-100"
  >
    <div className="flex items-start gap-3">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 space-y-2">
        <h2 className="text-base font-bold">العرض الشهري الحالي — ليس تقريرًا رسميًا معتمدًا</h2>
        <p className="text-sm leading-6">
          المعلومات المعروضة أسفل هذا التنبيه محسوبة من البيانات المحمّلة في الواجهة،
          وليست نتائج خدمة التقارير الرسمية التي تُطبّق الصلاحيات والفلاتر والإحصاءات على الخادم.
          لا تستخدم هذه المعاينة لإصدار إحصاء إداري رسمي أو تصدير معتمد.
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0" />
          تقارير المرحلة 23 وتصديرها الرسمي غير متاحين حاليًا إلى حين اكتمال المراجعة الأمنية والاعتماد.
        </p>
      </div>
    </div>
  </section>
);

/** Reserved for the approved UI-10 integrated reports screen.
 * Do not fabricate counts, report data, or role-based privileges here.
 */
export const ReportsView: React.FC = () => (
  <main dir="rtl" className="px-4 py-6">
    <ReportsAvailabilityNotice />
    <ReportsCatalog />
  </main>
);


/** UI-10 catalog describes future official report types; nothing is live here.
 * "Source not approved" is distinct from "backend work not yet released".
 */
const REPORT_CATALOG = [
  { label: 'التقرير الشهري', sourceMissing: false },
  { label: 'الكتب الواردة', sourceMissing: false },
  { label: 'الكتب الصادرة', sourceMissing: false },
  { label: 'الإجازات', sourceMissing: false },
  { label: 'الزمنيات', sourceMissing: false },
  { label: 'الإعمامات والاطلاع', sourceMissing: false },
  { label: 'الطلبات', sourceMissing: false },
  { label: 'المنتسبون', sourceMissing: false },
  { label: 'الباحثون', sourceMissing: true },
  { label: 'الأساتذة', sourceMissing: true },
  { label: 'حالة الكتب', sourceMissing: false },
] as const;

/** Inert catalog: never call an API or imply that any report/export is ready. */
export const ReportsCatalog: React.FC = () => (
  <section
    dir="rtl"
    aria-label="أنواع التقارير المخطط لها"
    className="mx-auto mb-5 max-w-7xl rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
  >
    <h2 className="mb-2 text-base font-bold text-stone-900 dark:text-stone-100">التقارير الرسمية المخطط لها</h2>
    <p className="mb-4 text-sm leading-6 text-stone-600 dark:text-stone-300">
      القائمة للتعريف فقط؛ لا يمكن تشغيل أي تقرير رسمي أو تنزيل ملف منه حتى اكتمال اعتماده.
    </p>
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {REPORT_CATALOG.map(item => (
        <li key={item.label} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">{item.label}</span>
          <span className="mt-1 block text-xs text-stone-600 dark:text-stone-300">
            {item.sourceMissing ? 'مصدر البيانات المستقل غير معتمد' : 'بانتظار الاعتماد والتفعيل'}
          </span>
        </li>
      ))}
    </ul>
  </section>
);
