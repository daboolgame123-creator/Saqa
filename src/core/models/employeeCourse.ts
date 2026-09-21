/**
 * EmployeeCourse — نموذج الدورات التدريبية والمشاركات العلمية
 * (PHASE 1 — نماذج شؤون المنتسبين)
 *
 * القرارات المعمارية المعتمدة:
 * - الخيار A: نموذج مستقل — سجل مشاركة فردي لكل موظف عبر employeeId (N:1).
 *   (كتاب الدورة الواحد قد يشمل عدة منتسبين عبر Transaction.employeeIds[] — لا M:N هنا)
 * - transactionId?: ربط اختياري أحادي الاتجاه بكتاب الدورة — لا حقول عكسية.
 * - لا visibility / AccessScope في هذه المرحلة.
 */

/** نوع المشاركة في الدورة */
export type ParticipationType =
  | 'participant'    // مشارك
  | 'trainee'        // متدرب
  | 'lecturer'       // محاضر
  | 'coordinator'    // منسق
  | 'other';         // أخرى

/** حالة المشاركة في الدورة */
export type ParticipationStatus =
  | 'registered'     // مسجلة
  | 'in_progress'    // قيد التنفيذ
  | 'completed'      // مكتملة
  | 'withdrew'       // منسحب
  | 'cancelled';     // ملغاة

export interface EmployeeCourse {
  /** معرف السجل الفريد */
  id: string;
  /** الرابط الأساسي مع Employee.id — موظف واحد لكل سجل */
  employeeId: string;
  /** اسم الدورة */
  name: string;
  /** الجهة المنظمة */
  organizer: string;
  /** المكان — اختياري */
  place?: string;
  /** تاريخ البداية — YYYY-MM-DD (اختياري: بعض الدورات تُسجل بلا تواريخ دقيقة) */
  startDate?: string;
  /** تاريخ النهاية — YYYY-MM-DD */
  endDate?: string;
  /** نوع المشاركة */
  participationType: ParticipationType;
  /** حالة المشاركة */
  participationStatus: ParticipationStatus;
  /** ربط اختياري أحادي الاتجاه بمعاملة كتاب الدورة (Transaction.id) */
  transactionId?: string;
  /** إشارة اختيارية إلى وثيقة الشهادة — دون نظام مرفقات جديد (المرفقات في PHASE 17) */
  certificateRef?: string;
  notes?: string;
}
