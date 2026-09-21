/**
 * EmployeeAssignment — نموذج التكليف / الإيفاد / تحويل الدوام
 * (PHASE 1 — نماذج شؤون المنتسبين)
 *
 * القرارات المعمارية المعتمدة:
 * - الخيار A: نموذج مستقل — سجل فردي لكل موظف عبر employeeId (N:1).
 * - الكتاب/المعاملة قد يرتبط بعدة موظفين عبر Transaction.employeeIds[]،
 *   أما EmployeeAssignment فهو سجل مشاركة فردية — لا M:N داخل هذا النموذج.
 * - transactionId?: ربط اختياري أحادي الاتجاه بالكتاب الرسمي — لا حقول عكسية.
 * - لا visibility / AccessScope في هذه المرحلة.
 */

/** نوع التكليف — مطابق للمصطلحات المستخدمة في استمارة الموقف اليومي والمعاملات */
export type AssignmentType =
  | 'task_assignment'   // تكليف بمهمة
  | 'delegation'        // إيفاد
  | 'shift_change'      // تحويل دوام
  | 'roster_transfer'   // تحويل دورية
  | 'other';            // أخرى

/** الحالة الإجرائية للتكليف */
export type AssignmentStatus =
  | 'registered'    // مسجل
  | 'in_progress'   // قيد التنفيذ
  | 'completed'     // منتهٍ
  | 'cancelled';    // ملغى

export interface EmployeeAssignment {
  /** معرف السجل الفريد */
  id: string;
  /** الرابط الأساسي مع Employee.id — موظف واحد لكل سجل */
  employeeId: string;
  /** نوع التكليف */
  type: AssignmentType;
  /** الجهة (نفس ميدان Transaction.entity) */
  entity: string;
  /** المكان — اختياري */
  place?: string;
  /** تاريخ البداية — YYYY-MM-DD */
  startDate: string;
  /** تاريخ النهاية — YYYY-MM-DD (تحويل الدوام قد يكون ليوم واحد) */
  endDate: string;
  /** الغرض — اختياري */
  purpose?: string;
  /** الحالة الإجرائية */
  status: AssignmentStatus;
  /** ربط اختياري أحادي الاتجاه بمعاملة الكتاب الرسمي (Transaction.id) */
  transactionId?: string;
  notes?: string;
}
