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

/**
 * نوع الإجازة — قيم برمجية ثابتة قابلة للهجرة إلى PostgreSQL.
 *
 * Phase 18: وُسّع الاتحاد بالقيم التي تشترطها §14 صراحةً كأنواع **مستقلة**:
 * `emergency` (الطارئة)، `hajj` (الحج)، `umrah` (العمرة)، `study` (الدراسية).
 * الأنواع القديمة محفوظة كلها لأن جداول `leaves` و`leave_ledger` قد تحمل
 * سجلات تاريخية بها، وحذف قيمة من الاتحاد مع قيد CHECK يعني فقدان ability
 * قراءة تلك السجلات.
 */
export type LeaveType =
  | 'annual'      // اعتيادية
  | 'sick'        // مرضية
  | 'excuse'      // استئذان
  | 'unpaid'      // بدون راتب
  | 'maternity'   // أمومة
  | 'transfer'    // تحويل
  | 'other'       // أخرى
  | 'emergency'   // طارئة (§14.2 — 15 يوماً سنوياً بلا ترحيل)
  | 'hajj'        // حج (§14.7 — 30 يوماً مرة واحدة في الخدمة)
  | 'umrah'       // عمرة (§14.8 — 12 يوماً مرة واحدة في الخدمة)
  | 'study';      // دراسية (§14.9 — بلا رصيد تلقائي)

/**
 * الأنواع التي يقيس عليها محرك القواعد رصيداً في Phase 18.
 *
 * `study` و`excuse` و`maternity` و`transfer` و`other` خارجها عمداً:
 * §14.9 نصّ على ألّا يضع النظام لها رصيداً تلقائياً، وسائرها بلا قاعدة
 * رصيد معتمدة. غيابها من هذه القائمة قرار «لا استحقاق»، لا رفض تسجيل.
 */
export const BALANCE_BEARING_LEAVE_TYPES: readonly LeaveType[] = [
  'annual',
  'sick',
  'unpaid',
  'emergency',
  'hajj',
  'umrah',
];

/** أنواع لا تُقاس عليها شرائح رصيد في الخطة الحالية (§14.9). */
export const NON_BALANCE_LEAVE_TYPES: readonly LeaveType[] = [
  'excuse',
  'maternity',
  'transfer',
  'other',
  'study',
];

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

// ══════════════════════════════════════════════════════════════════
// الرصيد والـLedger — Phase 18
// المرجع: ALSQAYA_PLAN §7.9 (LeaveBalance) · §7.10 (LeaveLedger) · §14 · §15 · §34.
//
// هذا الملف المرجع الوحيد لشكل الرصيد المحسوب وأنواع الحركات: تستهلكه
// الواجهة والخادم معاً، فلا توجد قيمة الرصيد محسوبة في React ولا يدوية.
// أنواع الحركات مطابقة لقيد `movement_type` في الترحيل 0003 ولم تُضَف نوع
// خارج قائمة §15.
//
// `TBD ≠ permission to guess`: ما نصّت الخطة على أنه غير محسوم لا يُترجَم
// إلى حقل هنا. الاستثناء الوحيد `annualPendingDays` وهو **حالة محمية
// صريحة** لاستحقاق يتجاوز سقف 180، لا قاعدة أعمال مطبَّقة.
// ══════════════════════════════════════════════════════════════════

/**
 * رصيد الإجازة لمنتسب واحد في سنة واحدة — §7.9.
 *
 * سطر واحد لكل (employeeId, year). كل الأرقام أيام إلا ما تسمّى أسماؤه
 * `Minutes`. المحرك على الخادم هو الكاتب الوحيد لهذا الصف.
 */
export interface EmployeeLeaveBalance {
  id: string;
  /** Primary key with the employee (Rule 7). */
  employeeId: string;
  /** Balance year — YYYY. */
  year: string;
  /** Current annual balance (carryover + earned − used) — §14.1. */
  annualBalance: number;
  /** Cumulative service days accounted for so far — §14.1 (every 10 = 1 day). */
  annualServiceDays: number;
  /** Cumulative earned days actually credited to the balance. */
  annualEarnedDays: number;
  /** Remainder of the ten-day cycle (0..9) — always preserved, §14.1. */
  annualRemainderDays: number;
  /** Balance carried over from the previous year — §14.1. */
  annualCarryoverDays: number;
  /**
   * استحقاق محجوز خلف سقف 180 يوماً — §14.1.
   *
   * الخطة نصّت صراحةً على أن قاعدة التعامل مع الاستحقاق الذي يتجاوز 180
   * «لم تُحسم نهائيًا». فالمحرك لا يحذفه ولا يرفع السقف بصمت: يحفظه هنا
   * حالةً صريحة قابلة للمراجعة حتى يُعتمد قرار.
   */
  annualPendingDays: number;
  /** رصيد الطارئ للسنة — §14.2 (15 يوماً، يُصفَّر سنوياً، لا يصبح سالباً). */
  emergencyBalance: number;
  /** الدقائق غير المحوّلة ترحل للسنة التالية — §14.3. */
  emergencyRemainderMinutes: number;
  /** أيام بدون راتب — §14.10 (بلا سقف: الحد العام غير محسوم). */
  unpaidDays: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * نوع حركة الـLedger — §15.
 *
 * القيم مطابقة لقيد `leave_ledger.movement_type` في الترحيل 0003: لم يُضَف
 * نوع خارج قائمة §15 ولا حُذف نوع منها.
 */
export type LeaveMovementType =
  | 'accrual'
  | 'deduction'
  | 'cancellation'
  | 'reversal'
  | 'time_conversion'
  | 'adjustment'
  | 'opening_balance';

/** وحدة قيمة الحركة — يوم أو دقيقة (مدة الزمنية بالدقائق §14.3). */
export type LeaveLedgerUnit = 'day' | 'minute';

/**
 * حركة رصيد واحدة — §15 / §7.10.
 *
 * لا يتغير الرصيد الرقمي بلا صف هنا؛ والإلغاء يُنشئ حركة عكسية مرتبطة
 * (`reversesLedgerId`) ولا يحذف السجل السابق ولا يمحوه.
 */
export interface LeaveLedgerEntry {
  id: string;
  employeeId: string;
  /** سجل الإجازة الذي سبّب الحركة إن وُجد. */
  leaveId?: string;
  /** سجل الزمنية الذي سبّب الحركة (تحويل زمنيات). */
  timePermissionId?: string;
  movementType: LeaveMovementType;
  leaveType?: LeaveType;
  /** القيمة بإشارتها بوحدة `unit` (موجب = إضافة، سالب = خصم). */
  amount: number;
  unit: LeaveLedgerUnit;
  /** الرصيد بعد الحركة — العمود الأخير في جدول §15. */
  balanceAfter: number;
  /** سنة الرصيد المتأثرة (مشتقّة من `occurredOn`). */
  year: number;
  occurredOn: string;
  /** الحركة التي تعكسها هذه الحركة — فارغ لغير حركات الإلغاء/العكس. */
  reversesLedgerId?: string;
  notes?: string;
  createdAt: string;
}
