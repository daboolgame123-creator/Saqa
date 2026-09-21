/**
 * EmployeeLeave — نموذج الإجازة الفردية للمنتسب
 * (PHASE 1 — نماذج شؤون المنتسبين)
 *
 * هذا هو **سجل الإجازة الفعلي** (BR-09) وليس طلب الإجازة —
 * الطلب ومعتمداته معرَّفة في `request.ts` (BR-11)، ورصيد الإجازة كيان ثالث مستقل أدناه.
 *
 * القرارات المعمارية المعتمدة:
 * - الخيار A: نموذج مستقل مرتبط بموظف واحد عبر employeeId (الرابط الأساسي — القاعدة 7).
 * - transactionId?: علاقة اختيارية أحادية الاتجاه مع Transaction — لا حقول عكسية في Transaction.
 * - لا visibility / AccessScope في هذه المرحلة (تُعالج في مراحل الصلاحيات PHASE 15/16).
 * - القيم البرمجية للأنواع إنجليزية ثابتة (stable) والنصوص العربية للعرض في personnelCatalogs.ts.
 */

/** نوع الإجازة — قيم برمجية ثابتة قابلة للهجرة إلى PostgreSQL */
export type LeaveType =
  | 'annual'      // اعتيادية
  | 'sick'        // مرضية
  | 'excuse'      // استئذان
  | 'unpaid'      // بدون راتب
  | 'maternity'   // أمومة
  | 'transfer'    // تحويل
  | 'other';      // أخرى

/** الحالة الإجرائية للإجازة — بسيطة، بلا نظام موافقات متعددة المراحل */
export type LeaveStatus =
  | 'registered'         // مسجلة
  | 'pending_approval'   // قيد الاعتماد
  | 'approved'           // معتمدة
  | 'cancelled';         // ملغاة

export interface EmployeeLeave {
  /** معرف السجل الفريد */
  id: string;
  /** الرابط الأساسي مع Employee.id — موظف واحد لكل سجل */
  employeeId: string;
  /** نوع الإجازة */
  type: LeaveType;
  /** تاريخ البداية — YYYY-MM-DD */
  startDate: string;
  /** تاريخ النهاية — YYYY-MM-DD (يساوي البداية للإجازة ليوم واحد) */
  endDate: string;
  /** عدد الأيام — يُدخل عند التسجيل، ولا يُحتسب آلياً (لا domain logic غير مطلوب) */
  days?: number;
  /** هل الإجازة براتب؟ (افتراضي true — يعبّر عن «اعتيادية براتب تام») */
  isPaid?: boolean;
  /** الحالة الإجرائية */
  status: LeaveStatus;
  /** ربط اختياري أحادي الاتجاه بمعاملة الكتاب الرسمي (Transaction.id) */
  transactionId?: string;
  notes?: string;
}

/**
 * رصيد الإجازة (BR-09) — كيان ثالث مستقل عن سجل الإجازة الفعلي (EmployeeLeave أعلاه)
 * وعن طلب الإجازة (Request في request.ts).
 *
 * ⚠️ قواعد الرصيد (الاستحقاق، عدد الأيام، الترحيل، الساعات، الإلغاء، إعادة الخصم)
 * غير معتمدة بعد — BR-09 يلزم بأن تكون صريحة قبل تنفيذ محرك الإجازات (Phase 2
 * وفق خطة ALSQAYA). لذلك يُعرَّف الهيكل التعريفي فقط دون حقول حسابية تخمينية.
 */
export interface EmployeeLeaveBalance {
  id: string;
  employeeId: string;  // الرابط الأساسي (Rule 7)
  year: string;        // سنة الرصيد — YYYY
  notes?: string;
}
