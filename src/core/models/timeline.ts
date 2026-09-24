import type { EmployeeLeave } from './employeeLeave';
import type { EmployeeTimePermission } from './employeeTimePermission';
import type { EmployeeAssignment } from './employeeAssignment';
import type { EmployeeCourse } from './employeeCourse';
import { TRANSACTION_STATUS_LABELS, type Transaction } from './transaction';
import type { DailySituationRecord } from './dailySituation';
import {
  LEAVE_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
  TIME_PERMISSION_STATUS_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  PARTICIPATION_STATUS_LABELS,
  DAILY_SITUATION_CATEGORY_LABELS,
} from './personnelCatalogs';

/**
 * أنواع مصادر الأحداث الزمنية (BR-14).
 * التعيين (appointment) والنقل (transfer) تم تضمينهما للاستعداد المستقبلي.
 */
export type TimelineSourceType =
  | 'leave'            // إجازة
  | 'timePermission'   // إذن زمني
  | 'assignment'       // تكليف
  | 'course'           // دورة
  | 'transaction'      // كتاب / معاملة
  | 'dailySituation'   // موقف يومي
  | 'appointment'      // تعيين
  | 'transfer'         // نقل
  | 'other';           // أخرى

/**
 * واجهة الحدث الزمني المشتق (Timeline Entry).
 * هذا الكيان لا يُخزن؛ يُحسب عند الطلب من المصادر الأصلية.
 */
export interface TimelineEntry {
  id: string;               // معرف فريد للحدث (غالباً هو معرف المصدر نفسه)
  sourceType: TimelineSourceType;
  sourceId: string;         // المعرف الأصلي في جدوله (للربط والتنقل)
  employeeId: string;
  date: string;             // التاريخ الأساسي للفرز (YYYY-MM-DD)
  endDate?: string;         // تاريخ النهاية (للأحداث المستمرة كالإجازات)
  title: string;            // عنوان مختصر (مثلاً: إجازة اعتيادية)
  description?: string;     // تفاصيل إضافية (مثلاً: موضوع الكتاب)
  status?: string;          // حالة الحدث إن وجدت (مكتمل، قيد المراجعة، إلخ)
  metadata?: Record<string, any>; // بيانات إضافية للتحكم بالواجهة أو التنقل
}

/**
 * وظائف تحويل الكيانات الأصلية إلى أحداث زمنية (Mappers).
 *
 * ملاحظة معمارية: العرض العربي يأتي من كتالوجات personnelCatalogs المعتمدة (Phase 1)
 * فلا يظهر للمستخدم أي قيمة برمجية إنجليزية خام، ولا تُخترع نصوص جديدة هنا.
 */
export const TimelineMappers = {
  fromLeave: (leave: EmployeeLeave): TimelineEntry => ({
    id: leave.id,
    sourceType: 'leave',
    sourceId: leave.id,
    employeeId: leave.employeeId,
    date: leave.startDate,
    endDate: leave.endDate,
    title: `إجازة ${LEAVE_TYPE_LABELS[leave.type]}`,
    description: leave.notes,
    status: LEAVE_STATUS_LABELS[leave.status],
  }),

  fromTimePermission: (tp: EmployeeTimePermission): TimelineEntry => ({
    id: tp.id,
    sourceType: 'timePermission',
    sourceId: tp.id,
    employeeId: tp.employeeId,
    date: tp.date,
    title: 'إذن زمني',
    description: `${tp.timeOut}${tp.timeIn ? ` - ${tp.timeIn}` : ''}${tp.reason ? ` - ${tp.reason}` : ''}`,
    status: TIME_PERMISSION_STATUS_LABELS[tp.status],
  }),

  fromAssignment: (asn: EmployeeAssignment): TimelineEntry => ({
    id: asn.id,
    sourceType: 'assignment',
    sourceId: asn.id,
    employeeId: asn.employeeId,
    date: asn.startDate,
    endDate: asn.endDate,
    title: `تكليف: ${ASSIGNMENT_TYPE_LABELS[asn.type]}`,
    description: asn.purpose ?? asn.entity,
    status: ASSIGNMENT_STATUS_LABELS[asn.status],
  }),

  fromCourse: (crs: EmployeeCourse): TimelineEntry => ({
    id: crs.id,
    sourceType: 'course',
    sourceId: crs.id,
    employeeId: crs.employeeId,
    date: crs.startDate ?? '',
    endDate: crs.endDate,
    title: `دورة: ${crs.name}`,
    description: crs.organizer,
    status: PARTICIPATION_STATUS_LABELS[crs.participationStatus],
  }),

  fromTransaction: (tr: Transaction, employeeId: string): TimelineEntry => ({
    id: `${tr.id}-${employeeId}`,
    sourceType: 'transaction',
    sourceId: tr.id,
    employeeId: employeeId,
    date: tr.date,
    title: tr.direction === 'وارد' ? `كتاب وارد رقم ${tr.number}` : 
           tr.direction === 'صادر' ? `كتاب صادر رقم ${tr.number}` : 
           `معاملة داخلية رقم ${tr.sequence}`,
    description: tr.subject,
    status: TRANSACTION_STATUS_LABELS[tr.status],
    metadata: {
      number: tr.number,
      category: tr.category,
      direction: tr.direction,
    }
  }),

  fromDailySituation: (ds: DailySituationRecord): TimelineEntry => ({
    id: ds.id,
    sourceType: 'dailySituation',
    sourceId: ds.id,
    employeeId: ds.employeeId,
    date: ds.date,
    title: `موقف يومي: ${DAILY_SITUATION_CATEGORY_LABELS[ds.category]}`,
    description: ds.reason || ds.notes,
    metadata: {
      timeOrDuration: ds.timeOrDuration,
      reason: ds.reason,
    }
  }),
};
