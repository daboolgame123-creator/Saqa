/**
 * EmployeeTimePermission — نموذج الزمنية (الخروج/العودة خلال يوم الدوام)
 * (PHASE 1 — نماذج شؤون المنتسبين)
 *
 * القرارات المعمارية المعتمدة:
 * - الخيار A: نموذج مستقل مرتبط بموظف واحد عبر employeeId.
 * - transactionId?: علاقة اختيارية أحادية الاتجاه مع Transaction — لا حقول عكسية.
 * - المدة لا تُخزن — تُشتق عرضياً من timeOut/timeIn (تجنّب الازدواجية).
 * - التاريخ والوقت حقول منفصلة: تاريخ YYYY-MM-DD، وقت HH:mm بنظام 24 ساعة.
 */

/** الحالة الإجرائية للزمنية */
export type TimePermissionStatus =
  | 'registered'   // مسجلة
  | 'approved'     // معتمدة
  | 'cancelled';   // ملغاة

export interface EmployeeTimePermission {
  /** معرف السجل الفريد */
  id: string;
  /** الرابط الأساسي مع Employee.id — موظف واحد لكل سجل */
  employeeId: string;
  /** تاريخ الزمنية — YYYY-MM-DD */
  date: string;
  /** وقت الخروج — HH:mm بنظام 24 ساعة */
  timeOut: string;
  /** وقت العودة إن وُجد — HH:mm (يبقى undefined إن لم يُسجل) */
  timeIn?: string;
  /** سبب الخروج */
  reason?: string;
  /** الحالة الإجرائية */
  status: TimePermissionStatus;
  /** ربط اختياري أحادي الاتجاه بمعاملة الكتاب الرسمي (Transaction.id) */
  transactionId?: string;
  notes?: string;
}
