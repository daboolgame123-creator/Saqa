/**
 * DTOs لتقارير المرحلة 23 — Reports + Statistics + Export.
 *
 * المرجع: `ALSQAYA_PLAN.md` §39.
 *
 * كل تقرير يعتمد على مورد-fields موجود في النموذج الحالي فقط:
 * - التقرير الشهري / الوارد / الصادر → transactions (date, direction, category, status, visibility…)
 * - الإجازات → employeeLeaves (startDate, endDate, status, type)
 * - الزمنيات → employeeTimePermissions (date, status)
 * - الأعمام والاطلاع → transactions (نطاق PublicToEmployees) + view_logs
 * - الطلبات → requests (createdAt, kind, status)
 * - المنتسبون / الباحثون → employees (category: 'منتسب' | 'باحث')
 * - الأساتذة والحالة → غير محسومة في §39 (مفصّلة أدناه)
 *
 * لا تُخترع حقولًا جديدة. `type` في فلتر التقرير يُقصد به نوع المورد/المتطلب
 * (مثل direction أو category أو leave type)، لا تصنيفًا جديدًا.
 */

import type { AccessScope } from '../../../../src/core/models/accessScope';
import type { ReportType } from '../../repositories/contracts';

/** عقد موحد للفلاتر بين التحقق والخدمة والمستودع. */
export type { ReportType, ReportFilter } from '../../repositories/contracts';

/** نتيجة سطر واحد من أي تقرير — حقول عرض موحّدة. */
export interface ReportRow {
  /** معرّف السجل الأصلي (لأغراض الربط الداخلي فقط، لا يُصadr بالضرورة). */
  id: string;
  /** التاريخ المعروض للتقرير. */
  date: string;
  /** نوع المورد أو الفئة. */
  type?: string;
  /** القسم. */
  section?: string;
  /** المنتسب/الشخص المعني. */
  employee?: string;
  /** الحالة. */
  status?: string;
  /** المصدر/الجهة. */
  source?: string;
  /** العنوان/الموضوع. */
  title?: string;
  /** ملاحظة اختيارية. */
  notes?: string;

  /** نطاق الرؤية (للعرض الأمني فقط). */
  visibility?: AccessScope | null;
}

/** ملخص التقرير — عدد السجلات المقبولة بعد تطبيق الفلاتر والنطاق. */
export interface ReportSummary {
  /** عدد السجلات التي أمكن رؤية المستخدم لها. */
  totalCount: number;
  /** الفترة المطبقة (نص للعرض). */
  period?: string;
  /** الفلاتر المطبقة (نص للعرض). */
  appliedFilters?: Record<string, string>;
  /** تاريخ إنشاء التقرير. */
  generatedAt: string;
}

/** استجابة التقرير الكاملة. */
export interface ReportResponse {
  rows: ReportRow[];
  summary: ReportSummary;
}

/** استجابة التصدير — ملف جاهز للتحميل. */
export interface ExportResult {
  /** نوع الملف: 'excel' | 'pdf'. */
  format: 'excel' | 'pdf';
  /** اسم الملف المقترح للتحميل. */
  fileName: string;
  /** محتوى الملف كـ Buffer (يُرسَل ك-base64 للواجهة أو يُستخدم مباشرة). */
  content: Buffer;
  /** نوع MIME للملف. */
  mimeType: string;
}

/**
 * Reports that have no verified data source/query implementation in this branch.
 * "situation" has a defined meaning (book status) but its SQL is not yet built;
 * researchers/professors require independent authoritative domain sources.
 * All remain unavailable, never successful with empty data.
 */
export const UNRESOLVED_REPORT_TYPES: readonly ReportType[] = [
  'researchers',
  'professors',
  'situation',
] as const;
