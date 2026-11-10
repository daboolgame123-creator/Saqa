/**
 * personnelRules — محرّك قواعد الإجازات والزمنيات (Phase 18 · §34).
 *
 * **لماذا هذا الموضع:** المخطط في §34 يفرض أن المحرك منفصل عن React:
 *
 * ```text
 * Service Records → Accrual Engine → Leave Balance → Leave Ledger
 * Time Permission → Minutes Engine → 420 minutes → Emergency Conversion
 *                  → Emergency Balance
 * ```
 *
 * فالمحرك هنا على الخادم في `services/`، ولا يعرف React ولا `localStorage`
 * ولا مكوّنات العرض. لا `if minutes >= 420` ولا `if balance > ...` في أي
 * component: الواجهة تقرأ ناتج المحرك فقط.
 *
 * ── قواعد مُنفَّذة (§14) ──────────────────────────────────────────
 * - §14.1 الاعتيادية: كل 10 أيام خدمة = +1 يوم · remainder محفوظ · ترحيل
 *   سنوي · سقف 180. الاستحقاق الذي يتجاوز 180 **لا يُقرَّر له سلوك**: يُحفظ
 *   في `annualPendingDays` كحالة صريحة ولا يُمنح ولا يُهدر (§14.1/§56.1).
 * - §14.2 الطارئة: 15 يوماً كل سنة · بلا carryover · لا يصبح سالباً.
 * - §14.3 الزمنيات: المدة بالدقائق · كل 420 دقيقة = يوم طارئ · remainder
 *   الدقائق ترحل للسنة التالية.
 * - §14.4 الحد الأسبوعي: مؤشر فقط — **لا يمنع التسجيل ولا يحذف بيانات**.
 * - §14.5 نفاد الطارئ: المغطّى طارئ، وغير المغطّى بدون راتب، بلا سالب.
 * - §14.6 المرضية: شرائح 1–45 / 46–90 / بعد 90 — **بلا تراكم ولا reset**
 *   لأن الفترة التي تُقاس عليها الشرائح غير محسومة.
 * - §14.7/§14.8 الحج والعمرة: 30/12 يوماً مرة واحدة في خدمة المنتسب.
 * - §14.9 الدراسية: نوع مستقل بلا رصيد تلقائي.
 * - §14.10 بدون راتب: نوع مستقل بلا سقف مخترَع (الحد غير محسوم).
 * - §15 Ledger: كل تغيير رصيد له حركة؛ الإلغاء حركة عكسية مرتبطة.
 *
 * ── قواعد لم تُنفَّذ عمداً (غير محسومة في الخطة) ──────────────────
 * - التوزيع الزمني لشرائح المرضية (سنة؟ دورة خدمة؟) → الدالة تقبل عدد
 *   الأيام صراحةً ولا تفترض فترة ولا تُعيد تصفيراً.
 * - سياسة تجاوز 180 → الحالة المحمية `annualPendingDays` فقط.
 * - الحد العام للإجازة بدون راتب → `unpaidDays` عدّاد بلا سقف.
 * - تفاصيل الدراسية الرقمية → لا رصيد تلقائي إطلاقاً.
 * - زمنية تعبر منتصف الليل → لا تُشتق لها مدة ولا تُخترع سياسة.
 */
import type { EmployeeLeaveBalance, LeaveType } from '../../../src/core/models/employeeLeave';
import type { Pool } from 'pg';
import { withTransaction } from '../database/pool';
import type {
  EmployeeRepository,
  LeaveBalanceRepository,
  LeaveLedgerRepository,
  LeaveRepository,
  TimePermissionRecord,
  TimePermissionRepository,
} from '../repositories/contracts';
import { PgLeaveBalanceRepository } from '../repositories/leaveBalanceRepository';
import { PgLeaveLedgerRepository } from '../repositories/leaveLedgerRepository';
import { PgLeaveRepository } from '../repositories/leaveRepository';
import { PgTimePermissionRepository } from '../repositories/timePermissionRepository';
import { PgEmployeeRepository } from '../repositories/employeeRepository';
import { BalanceConflictError, LeaveRuleError } from './personnelErrors';

// ══════════════════════════════════════════════════════════════════
// ثوابت القواعد — كل رقم هنا مصدره نصّ في §14، ولا يُشتق من بيانات
// ══════════════════════════════════════════════════════════════════

/** §14.1 — كل 10 أيام خدمة = يوم إجازة اعتيادية واحد. */
export const ANNUAL_SERVICE_DAYS_PER_DAY = 10;
/** §14.1 — الحد الأعلى للرصيد الاعتيادي. */
export const ANNUAL_BALANCE_CAP = 180;
/** §14.2 — أيام الطارئ في السنة. */
export const EMERGENCY_DAYS_PER_YEAR = 15;
/** §14.3 — كل 420 دقيقة = يوم طارئ واحد. */
export const MINUTES_PER_EMERGENCY_DAY = 420;
/** §14.4 — الحد الأسبوعي (4 ساعات) — مؤشر لا يمنع. */
export const WEEKLY_LIMIT_MINUTES = 240;
/** §14.6 — شريحة 100% (1–45 يوماً). */
export const SICK_FULL_BAND_DAYS = 45;
/** §14.6 — شريحة 80% (46–90 يوماً). */
export const SICK_REDUCED_BAND_DAYS = 45;
/** §14.7 — استحقاق الحج مرة واحدة (30 يوماً). */
export const HAJJ_DAYS_ONCE = 30;
/** §14.8 — استحقاق العمرة مرة واحدة (12 يوماً). */
export const UMRAH_DAYS_ONCE = 12;

// ══════════════════════════════════════════════════════════════════
// دوال حسابية خالصة — بلا قاعدة بيانات وبلا I/O
// ══════════════════════════════════════════════════════════════════

/** عدد الأيام بين تاريخين `YYYY-MM-DD` شاملاً الطرفين (`end - start + 1`). */
export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`تاريخ غير صالح في حساب الأيام: ${startDate} → ${endDate}`);
  }
  return Math.round((end - start) / 86_400_000) + 1;
}

/** أيام خدمة الموظف حتى `asOf` (شاملةً) من `joinedDate`. */
export function serviceDaysUntil(joinedDate: string, asOf: string): number {
  return daysBetweenInclusive(joinedDate, asOf);
}

/**
 * §14.1 — استحقاق دورة العشرة.
 *
 * `earned` = الأيام المستحقة إجمالاً من الخدمة، `remainder` = الباقي
 * (0..9) الذي **يُحفظ دائماً** ولا يسقط بتغيّر السنة.
 */
export function annualAccrualFromServiceDays(serviceDays: number): {
  earned: number;
  remainder: number;
} {
  const earned = Math.floor(serviceDays / ANNUAL_SERVICE_DAYS_PER_DAY);
  return { earned, remainder: serviceDays % ANNUAL_SERVICE_DAYS_PER_DAY };
}

/**
 * §14.1 — سقف 180 يوماً: توزيع الاستحقاق على الرصيد والمعلَّق.
 *
 * **الجزء المعلَّق ليس قراراً مطبَّقاً:** الخطة لم تحسم ما يحدث
 * للاستحقاق بعد 180، فيُحفظ رقمياً في `annualPendingDays` كما هو — لا يُمنح
 * ولا يُهدر ولا يُلغى. الرصيد نفسه لا يتجاوز 180 أبداً.
 */
export function applyAnnualCap(currentBalance: number, earnedDays: number): {
  credited: number;
  pending: number;
} {
  const room = Math.max(0, ANNUAL_BALANCE_CAP - currentBalance);
  const credited = Math.min(Math.max(0, earnedDays), room);
  return { credited, pending: Math.max(0, earnedDays - credited) };
}

/** §14.3 — تحويل الدقائق: كل 420 دقيقة = يوم واحد، والباقي يبقى. */
export function minutesToEmergencyDays(minutes: number): {
  days: number;
  remainderMinutes: number;
} {
  const safe = Math.max(0, Math.floor(minutes));
  return {
    days: Math.floor(safe / MINUTES_PER_EMERGENCY_DAY),
    remainderMinutes: safe % MINUTES_PER_EMERGENCY_DAY,
  };
}

/**
 * §14.5 — نفاد الطارئ: المتاح أولاً، والفائض بدون راتب.
 *
 * `covered` لا يتجاوز `emergencyAvailable` أبداً ⇒ رصيد الطارئ لا يصبح
 * سالباً (§14.5). `unpaid` هو الباقي الذي لا يغطيه الرصيد (§14.10).
 */
export function splitEmergencyConversion(
  earnedDays: number,
  emergencyAvailable: number,
): { covered: number; unpaid: number } {
  const covered = Math.min(Math.max(0, earnedDays), Math.max(0, emergencyAvailable));
  return { covered, unpaid: Math.max(0, earnedDays - covered) };
}

/**
 * §14.6 — شرائح المرضية على عدد أيام **محدد صراحةً**.
 *
 * الدالة لا تفترض فترة قياس (سنة/دورة خدمة) ولا تصفّر عدّاداً ولا
 * تتراكم عبر سجلات — الفترة غير محسومة (§14.6/§56)، فالمُدخل هو
 * المصدر الوحيد لعدد الأيام. تُعيد التقسيم لا الحالة.
 */
export function sickBandSplit(days: number): {
  fullPaidDays: number;
  reducedPaidDays: number;
  unpaidDays: number;
} {
  const total = Math.max(0, Math.floor(days));
  const fullPaidDays = Math.min(total, SICK_FULL_BAND_DAYS);
  const afterFull = total - fullPaidDays;
  const reducedPaidDays = Math.min(afterFull, SICK_REDUCED_BAND_DAYS);
  const unpaidDays = Math.max(0, afterFull - reducedPaidDays);
  return { fullPaidDays, reducedPaidDays, unpaidDays };
}

/** §14.4 — مؤشر تجاوز 4 ساعات أسبوعياً. لا يمنع ولا يحذف (§14.4). */
export function weeklyLimitExceeded(weeklyMinutes: number): boolean {
  return weeklyMinutes > WEEKLY_LIMIT_MINUTES;
}

/** بداية الأسبوع (الإثنين) ونهايته (الأحد) لتاريخ `YYYY-MM-DD`. */
export function weekRange(date: string): { from: string; to: string } {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`تاريخ غير صالح لحساب الأسبوع: ${date}`);
  }
  // `getUTCDay`: 0 = الأحد. نرجع للأثنين مباشرة.
  const dayOfWeek = parsed.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(parsed.getTime() - offsetToMonday * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/** سنة التاريخ `YYYY-MM-DD` بصيغة `YYYY`. */
export function yearOf(date: string): string {
  return date.slice(0, 4);
}

/** هل يُستهلك هذا النوع من رصيد؟ (§14.9 الدراسية بلا رصيد تلقائي.) */
export function consumesBalance(type: LeaveType): boolean {
  return type === 'annual' || type === 'emergency';
}

/** الأنواع التي تُمنح مرة واحدة في خدمة المنتسب (§14.7/§14.8). */
export function isOncePerService(type: LeaveType): boolean {
  return type === 'hajj' || type === 'umrah';
}

// ══════════════════════════════════════════════════════════════════
// المحرّك — كل كتابة رصيد تتم في معاملة واحدة مع حركاتها
// ══════════════════════════════════════════════════════════════════

/** المستودعات التي يحتاجها المحرّك. */
export interface PersonnelRulesRepositories {
  employees: EmployeeRepository;
  leaves: LeaveRepository;
  timePermissions: TimePermissionRepository;
  balances: LeaveBalanceRepository;
  ledger: LeaveLedgerRepository;
}

/** مدخلات تسجيل رصيد افتتاحي موثّق (§34 «افتتاح الرصيد»). */
export interface OpeningBalanceInput {
  employeeId: string;
  year: string;
  /** نوع الرصيد الذي تُفتح نقطته: `annual` أو `emergency`. */
  leaveType: Extract<LeaveType, 'annual' | 'emergency'>;
  /** أيام الرصيد الافتتاحي (0 فأكثر). */
  days: number;
  /** تاريخ النقطة الافتتاحية — إلزامي: نقطة بداية موثّقة تاريخياً. */
  occurredOn: string;
  /** ملاحظة تشرح مصدر الرقم (إلزامية: توثيق، لا رقم مجرّد). */
  notes: string;
}

/** مدخلات تصحيح إداري موثّق (§15 «تصحيح إداري موثق»). */
export interface AdjustmentInput {
  employeeId: string;
  year: string;
  leaveType: Extract<LeaveType, 'annual' | 'emergency'>;
  /** قيمة التصحيح بالأيام — سالب يُنقص، موجب يزيد. */
  days: number;
  occurredOn: string;
  /** سبب/بيان التصحيح — إلزامي حتى لا يكون رقم بلا منسوب. */
  notes: string;
}

/** نتيجة استحقاق سنوي (§14.1). */
export interface AnnualAccrualResult {
  balance: EmployeeLeaveBalance;
  credited: number;
  pending: number;
  remainder: number;
}

/** نتيجة تحويل زمنية إلى أيام طارئة (§14.3/§14.5). */
export interface TimeConversionResult {
  balance: EmployeeLeaveBalance;
  /** أيام طارئة مُضافة من هذا التحويل. */
  covered: number;
  /** أيام بدون راتب لأن رصيد الطارئ لم يغطِّ (§14.5 + §14.10). */
  unpaid: number;
  /** الدقائق المتبقية بعد التحويل (ترحل للسنة التالية — §14.3). */
  remainderMinutes: number;
  /** الدقائق المستهلكة في التحويل. */
  consumedMinutes: number;
}

/** نتيجة تسجيل زمنية مع المؤشر الأسبوعي (§14.3/§14.4). */
export interface TimePermissionRegistration {
  record: TimePermissionRecord;
  /** دقائق الأسبوع بعد التسجيل (مجموع مدد نطاق الأسبوع). */
  weeklyMinutes: number;
  /** تجاوز 4 ساعات (§14.4) — **مؤشر فقط**: التسجيل يتمّ والتجاوز لا يمنعه. */
  exceedsWeeklyLimit: boolean;
  /** أثر التحويل على الرصيد، أو `null` إن لم تكن هناك مدة قابلة للتحويل. */
  conversion: TimeConversionResult | null;
}

export class PersonnelRulesEngine {
  /**
   * المستودعات **علنية** عمداً: الاختبارات تقرأ منها للتأكد (سجلات
   * الزمنيات المخزَّنة، سجلات الإجازات)، و`createApiServices` يمرّرها.
   * الكتابة تمرّ بطرق المحرّك لا باستدعاء المستودع مباشرة.
   */
  constructor(
    private readonly pool: Pool,
    readonly repos: PersonnelRulesRepositories,
  ) {}

  // ── قراءة (بلا معاملة: قراءة واحدة متّسقة) ───────────────────────

  /** رصيد سنة واحدة — ينشئ صفّه إن لم يكن موجوداً (§14.2 تهيئة). */
  async getOrCreateBalance(employeeId: string, year: string): Promise<EmployeeLeaveBalance> {
    const existing = await this.repos.balances.findByEmployeeYear(employeeId, year);
    if (existing !== null) {
      return existing;
    }
    return this.openYear(employeeId, year);
  }

  /**
   * تهيئة رصيد السنة مع **ترحيل** (§14.1) وإعادة **ضبط** (§14.2).
   *
   - الاعتيادية: يبدأ من رصيد آخر سنة سابقة (carryover سنوي).
   * - الطارئ: يبدأ من 15 دائماً — لا carryover للطارئة (§14.2).
   * - `annual_remainder_days` و`emergency_remainder_minutes` تُرحَّل من
   *   السنة السابقة (الباقي لا يسقط بتغيّر السنة — §14.1/§14.3).
   *
   * كل تهيئة تنتج حركات ledger: `opening_balance` للترحيل، و`accrual`
   * لمنح 15 يوم طارئ للسنة — فالرصيد لا يبدأ من صفر بلا أثر (§15).
   */
  async openYear(employeeId: string, year: string): Promise<EmployeeLeaveBalance> {
    return this.inTransaction(async (tx) => {
      const existing = await tx.balances.findByEmployeeYear(employeeId, year);
      if (existing !== null) {
        return existing;
      }
      const previous = await tx.balances.findLatestBefore(employeeId, year);
      const carryover = previous?.annualBalance ?? 0;
      const remainderDays = previous?.annualRemainderDays ?? 0;
      const remainderMinutes = previous?.emergencyRemainderMinutes ?? 0;

      const created = await tx.balances.create({
        employeeId,
        year,
        annualBalance: carryover,
        annualCarryoverDays: carryover,
        annualRemainderDays: remainderDays,
        annualServiceDays: previous?.annualServiceDays ?? 0,
        annualEarnedDays: previous?.annualEarnedDays ?? 0,
        annualPendingDays: previous?.annualPendingDays ?? 0,
        emergencyBalance: EMERGENCY_DAYS_PER_YEAR,
        emergencyRemainderMinutes: remainderMinutes,
        unpaidDays: previous?.unpaidDays ?? 0,
      });

      // حركة الترحيل: موثّقة صراحةً حتى لا يُعرف الرصيد المرحّل من رقم مجرّد.
      if (carryover > 0) {
        await tx.ledger.create({
          employeeId,
          movementType: 'opening_balance',
          leaveType: 'annual',
          amount: carryover,
          unit: 'day',
          balanceAfter: carryover,
          occurredOn: `${year}-01-01`,
          notes: `ترحيل رصيد اعتيادي من السنة السابقة (${previous?.year ?? '—'}) — §14.1`,
        });
      }
      // استحقاق الطارئ السنوي: 15 يوماً (§14.2) — حركة accrual لا تهيئة صامتة.
      await tx.ledger.create({
        employeeId,
        movementType: 'accrual',
        leaveType: 'emergency',
        amount: EMERGENCY_DAYS_PER_YEAR,
        unit: 'day',
        balanceAfter: EMERGENCY_DAYS_PER_YEAR,
        occurredOn: `${year}-01-01`,
        notes: `استحقاق الطارئ السنوي ${EMERGENCY_DAYS_PER_YEAR} يوماً — §14.2`,
      });
      return created;
    });
  }

  // ── الاستحقاق (§14.1) ───────────────────────────────────────────

  /**
   * استحقاق الإجازة الاعتيادية حتى `asOfDate` (§14.1).
   *
   * التسلسل: أيام الخدمة من `employees.joined_date` ⇒
   * `annualAccrualFromServiceDays` ⇒ `applyAnnualCap`.
   *
   * `remainder` يُحفظ دائماً (0..9) ولا يسقط (§14.1)، والجزء خلف سقف
   * 180 يُحفظ في `annualPendingDays` بلا قرار (§14.1/§56.1). الحركة
   * `accrual` لا تُنشأ إلا عند استحقاق جديد فعلي، فلا تتراكم حركات صفرية.
   */
  async accrueAnnual(
    employeeId: string,
    asOfDate: string,
  ): Promise<AnnualAccrualResult> {
    return this.inTransaction(async (tx) => {
      const employee = await tx.employees.findById(employeeId);
      if (employee === null) {
        throw new LeaveRuleError('المنتسب غير موجود.', '§7.2', 404, 'RESOURCE_NOT_FOUND');
      }
      const joinedDate = employee.joinedDate;
      if (joinedDate === undefined || joinedDate === '') {
        // بلا تاريخ خدمة لا تُقاس الاستحقاقات — ولا يُخترع تاريخ بديل.
        throw new LeaveRuleError(
          'لا يوجد تاريخ خدمة/انتساب للمنتسب، فاستحقاق الإجازة الاعتيادية لا يُقاس.',
          '§14.1',
          409,
          'SERVICE_DATE_MISSING',
        );
      }
      const serviceDays = serviceDaysUntil(joinedDate, asOfDate);
      const { earned, remainder } = annualAccrualFromServiceDays(serviceDays);
      const year = yearOf(asOfDate);
      const balance = await this.ensureYear(tx, employeeId, year);

      // الفرق بين المستحق حتى الآن والمُضاف فعلاً — الجديد فقط.
      const deltaEarned = Math.max(0, earned - balance.annualEarnedDays);
      const { credited, pending } = applyAnnualCap(balance.annualBalance, deltaEarned);

      const nextBalance = balance.annualBalance + credited;
      const nextPending = balance.annualPendingDays + pending;
      const updated = await this.writeBalance(tx, employeeId, year, balance, {
        annualBalance: nextBalance,
        annualServiceDays: serviceDays,
        annualEarnedDays: earned,
        annualRemainderDays: remainder,
        annualPendingDays: nextPending,
      });

      if (credited > 0) {
        await tx.ledger.create({
          employeeId,
          movementType: 'accrual',
          leaveType: 'annual',
          amount: credited,
          unit: 'day',
          balanceAfter: nextBalance,
          occurredOn: asOfDate,
          notes: `استحقاق اعتيادي: ${serviceDays} يوم خدمة ⇒ +${credited} يوم — §14.1`,
        });
      }
      if (pending > 0) {
        // حركة **تسجيل** بقيمة صفر: الرقم محفوظ ولم يُمنح لأن القاعدة لم
        // تحسم ما فوق 180 — فالتسجيل نفسه ليس قراراً.
        await tx.ledger.create({
          employeeId,
          movementType: 'adjustment',
          leaveType: 'annual',
          amount: 0,
          unit: 'day',
          balanceAfter: nextBalance,
          occurredOn: asOfDate,
          notes:
            `استحقاق معلّق خلف سقف ${ANNUAL_BALANCE_CAP} يوماً: ${pending} يوم — ` +
            'لم يُمنح ولا أُهدر؛ القاعدة غير محسومة (§14.1/§56.1).',
        });
      }
      return { balance: updated, credited, pending, remainder };
    });
  }

  // ── الزمنيات (§14.3/§14.4/§14.5) ────────────────────────────────

  /**
   * تسجيل زمنية: تحسب المدة بالدقائق، ثم 420 دقيقة ⇒ يوم طارئ (§14.3).
   *
   * المدة تُشتق من `timeOut`/`timeIn` هنا **مرة واحدة** وتُخزَّن في
   * `duration_minutes`، فالمخزَّن حقيقة واحدة (§14.3) ولا تُشتق مرتين.
   *
   * تجاوز 4 ساعات أسبوعياً (§14.4) يُقاس ويُعاد مؤشراً `exceedsWeeklyLimit`
   * فقط — **لا يمنع التسجيل ولا يحذف السجل**: هذا مطلب صريح في §14.4.
   *
   * `timeIn <= timeOut` (تجاوز منتصف الليل): سياسة غير محسومة، فلا تُشتق
   * مدة ولا يُحوَّل شيء — السجل يُحفظ كما هو.
   */
  async registerTimePermission(input: {
    employeeId: string;
    date: string;
    timeOut: string;
    timeIn?: string;
    reason?: string;
    status: 'registered' | 'approved' | 'cancelled';
    transactionId?: string;
    notes?: string;
  }): Promise<TimePermissionRegistration> {
    const durationMinutes = computeDurationMinutes(input.timeOut, input.timeIn);
    const record = await this.repos.timePermissions.create({
      employeeId: input.employeeId,
      date: input.date,
      timeOut: input.timeOut,
      ...(input.timeIn !== undefined && { timeIn: input.timeIn }),
      ...(durationMinutes !== undefined && { durationMinutes }),
      ...(input.reason !== undefined && { reason: input.reason }),
      status: input.status,
      ...(input.transactionId !== undefined && { transactionId: input.transactionId }),
      ...(input.notes !== undefined && { notes: input.notes }),
    });

    // المؤشر الأسبوعي يُقاس ولا يُعدّل شيئاً (§14.4).
    const week = weekRange(input.date);
    const weeklyMinutes = await this.repos.timePermissions.sumMinutesBetween(
      input.employeeId,
      week.from,
      week.to,
    );

    let conversion: TimeConversionResult | null = null;
    if (durationMinutes !== undefined && record.status !== 'cancelled') {
      conversion = await this.convertMinutesForRecord(
        record.id,
        record.employeeId,
        input.date,
        durationMinutes,
      );
    }

    return {
      record,
      weeklyMinutes,
      exceedsWeeklyLimit: weeklyLimitExceeded(weeklyMinutes),
      conversion,
    };
  }

  /**
   * تحويل زمنية واحدة: 420 دقيقة ⇒ يوم طارئ (§14.3) مع مراعاة النفاد (§14.5).
   *
   * ذرّية: تحديث الأرصدة وإنشاء الحركات (استهلاك الدقائق + أيام الطارئ +
   * عدّاد بدون راتب عند النفاد) كله في **معاملة واحدة**، فلا يبقى يوم طارئ
   * بلا حركة ledger ولا حركة بلا رصيد.
   *
   * الرصيد لا يصبح سالباً أبداً: `splitEmergencyConversion` يحدّ `covered`
   * بالرصيد المتاح، والفائض يصبح `unpaid` (§14.5/§14.10).
   *
   * المثال من §14.3: 16 ساعة = 960 دقيقة ⇒ يومان + 120 دقيقة remainder.
   */
  async convertMinutesForRecord(
    timePermissionId: string,
    employeeId: string,
    occurredOn: string,
    durationMinutes: number,
  ): Promise<TimeConversionResult> {
    return this.inTransaction(async (tx) => {
      const year = yearOf(occurredOn);
      const balance = await this.ensureYear(tx, employeeId, year);

      const totalMinutes = balance.emergencyRemainderMinutes + Math.max(0, durationMinutes);
      const { days: earnedDays, remainderMinutes } = minutesToEmergencyDays(totalMinutes);
      const { covered, unpaid } = splitEmergencyConversion(earnedDays, balance.emergencyBalance);

      const nextEmergency = balance.emergencyBalance + covered;
      const nextUnpaid = balance.unpaidDays + unpaid;
      const updated = await this.writeBalance(tx, employeeId, year, balance, {
        emergencyBalance: nextEmergency,
        emergencyRemainderMinutes: remainderMinutes,
        unpaidDays: nextUnpaid,
      });

      // حركة 1: الدقائق المستهلكة (بالدقائق — وحدة `minute` تفصلها عن اليوم).
      await tx.ledger.create({
        employeeId,
        movementType: 'time_conversion',
        leaveType: 'emergency',
        timePermissionId,
        amount: totalMinutes,
        unit: 'minute',
        balanceAfter: remainderMinutes,
        occurredOn,
        notes:
          `تحويل زمنيات: ${totalMinutes} دقيقة ⇒ ${earnedDays} يوم طارئ ` +
          `+ ${remainderMinutes} دقيقة متبقية — §14.3`,
      });

      if (covered > 0) {
        await tx.ledger.create({
          employeeId,
          movementType: 'time_conversion',
          leaveType: 'emergency',
          timePermissionId,
          amount: covered,
          unit: 'day',
          balanceAfter: nextEmergency,
          occurredOn,
          notes: `أيام طارئة مُضافة من التحويل: ${covered} — §14.3/§14.5`,
        });
      }
      if (unpaid > 0) {
        await tx.ledger.create({
          employeeId,
          movementType: 'time_conversion',
          leaveType: 'unpaid',
          timePermissionId,
          amount: unpaid,
          unit: 'day',
          balanceAfter: nextUnpaid,
          occurredOn,
          notes: `نفاد الطارئ: ${unpaid} يوم بدون راتب — §14.5/§14.10`,
        });
      }

      return {
        balance: updated,
        covered,
        unpaid,
        remainderMinutes,
        consumedMinutes: totalMinutes,
      };
    });
  }

  /**
   * تحويل كل زمنيات المنتسب غير المحوَّلة بعد.
   *
   * `listUnconverted` يستثني ما له حركة `time_conversion` أصلاً، فلا
   * يتحوَّل السجل مرتين ولا يُضاعف رصيد الطارئ.
   */
  async convertPendingTimePermissions(
    employeeId: string,
    asOfDate: string,
  ): Promise<TimeConversionResult[]> {
    const pending = await this.repos.timePermissions.listUnconverted(employeeId);
    const results: TimeConversionResult[] = [];
    for (const record of pending) {
      if (record.durationMinutes === undefined) {
        continue;
      }
      results.push(
        await this.convertMinutesForRecord(
          record.id,
          employeeId,
          record.date > asOfDate ? record.date : asOfDate,
          record.durationMinutes,
        ),
      );
    }
    return results;
  }

  // ── الإجازات: الخصم والإلغاء (§14.1/§14.5/§14.7/§14.8/§15) ────────

  /**
   * تسجيل إجازة **مع أثرها على الرصيد** — نقطة الدخول الوحيدة.
   *
   * السلوك حسب النوع (§14):
   * - `annual` → خصم من الاعتيادي، وما لا يغطّيه يصبح `unpaid` (§14.10).
   * - `emergency` → خصم من الطارئ بلا سالب (§14.2/§14.5).
   * - `hajj`/`umrah` → «مرة واحدة في خدمة المنتسب» (§14.7/§14.8).
   * - `study` → **لا رصيد تلقائي إطلاقاً** (§14.9).
   * - `unpaid` → يزيد عدّاد `unpaidDays` بلا سقف (§14.10 غير محسوم).
   * - `sick` → الشريحة بدالة خالصة بلا تراكم/reset (§14.6).
   * - كل تقييد يخصم رصيداً يُنتج حركة `deduction` في نفس المعاملة (§15).
   */
  async recordLeave(leave: {
    id: string;
    employeeId: string;
    type: LeaveType;
    startDate: string;
    endDate: string;
    days?: number;
    status: string;
  }): Promise<string> {
    // فحص «مرة واحدة في الخدمة» **قبل** إنشاء السجل: الفحص بعده يجعل
    // السجل الجديد نفسه سبباً لرفضه، ويترك صفاً يتيم بلا رصيد.
    if (leave.status !== 'cancelled' && isOncePerService(leave.type)) {
      await this.assertOncePerService(leave.employeeId, leave.type);
    }
    const created = await this.repos.leaves.create({
      employeeId: leave.employeeId,
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      ...(leave.days !== undefined && { days: leave.days }),
      status: leave.status as 'registered' | 'pending_approval' | 'approved' | 'cancelled',
    });
    if (leave.status === 'cancelled') {
      // إجازة ملغاة عند التسجيل: تُحفظ ولا تُخصم ولا تُحذف.
      return created.id;
    }
    const days = leave.days ?? daysBetweenInclusive(leave.startDate, leave.endDate);
    await this.deductLeaveBalance(created, days);
    return created.id;
  }

  /**
   * خصم أيام الإجازة من الرصيد المناسب + حركة `deduction` (§15).
   *
   * - `unpaid`: يزيد عدّاد `unpaidDays` (بلا سقف — §14.10 غير محسوم).
   * - `study` وسائر الأنواع بلا قاعدة رصيد: بلا حركة ولا تغيير (§14.9).
   * - `sick`: الشريحة تُرجَع بلا تراكم ولا reset (§14.6) — بلا أثر رصيدي.
   * - `annual`/`emergency`: خصم، والفائض `unpaid` بلا سالب (§14.5/§14.10).
   */
  private async deductLeaveBalance(
    leave: { id: string; employeeId: string; type: LeaveType; startDate: string },
    days: number,
  ): Promise<void> {
    if (leave.type === 'unpaid') {
      await this.inTransaction(async (tx) => {
        const year = yearOf(leave.startDate);
        const balance = await this.ensureYear(tx, leave.employeeId, year);
        const next = balance.unpaidDays + Math.max(0, days);
        await this.writeBalance(tx, leave.employeeId, year, balance, { unpaidDays: next });
        await tx.ledger.create({
          employeeId: leave.employeeId,
          leaveId: leave.id,
          movementType: 'deduction',
          leaveType: 'unpaid',
          amount: days,
          unit: 'day',
          balanceAfter: next,
          occurredOn: leave.startDate,
          notes: `إجازة بدون راتب: ${days} يوم (بلا سقف — §14.10)`,
        });
      });
      return;
    }
    if (leave.type === 'annual') {
      await this.inTransaction(async (tx) => {
        const year = yearOf(leave.startDate);
        const balance = await this.ensureYear(tx, leave.employeeId, year);
        const covered = Math.min(Math.max(0, days), balance.annualBalance);
        const unpaid = Math.max(0, days - covered);
        const nextBalance = balance.annualBalance - covered;
        const nextUnpaid = balance.unpaidDays + unpaid;
        await this.writeBalance(tx, leave.employeeId, year, balance, {
          annualBalance: nextBalance,
          unpaidDays: nextUnpaid,
        });
        if (covered > 0) {
          await tx.ledger.create({
            employeeId: leave.employeeId,
            leaveId: leave.id,
            movementType: 'deduction',
            leaveType: 'annual',
            amount: -covered,
            unit: 'day',
            balanceAfter: nextBalance,
            occurredOn: leave.startDate,
            notes: `خصم إجازة اعتيادية: ${covered} يوم — §14.1`,
          });
        }
        if (unpaid > 0) {
          // §14.10: النقص في الرصيد الاعتيادي ⇒ بدون راتب.
          await tx.ledger.create({
            employeeId: leave.employeeId,
            leaveId: leave.id,
            movementType: 'deduction',
            leaveType: 'unpaid',
            amount: unpaid,
            unit: 'day',
            balanceAfter: nextUnpaid,
            occurredOn: leave.startDate,
            notes: `نقص في الرصيد الاعتيادي: ${unpaid} يوم بدون راتب — §14.10`,
          });
        }
      });
      return;
    }
    if (leave.type === 'emergency') {
      await this.inTransaction(async (tx) => {
        const year = yearOf(leave.startDate);
        const balance = await this.ensureYear(tx, leave.employeeId, year);
        const { covered, unpaid } = splitEmergencyConversion(days, balance.emergencyBalance);
        const nextEmergency = balance.emergencyBalance - covered;
        const nextUnpaid = balance.unpaidDays + unpaid;
        await this.writeBalance(tx, leave.employeeId, year, balance, {
          emergencyBalance: nextEmergency,
          unpaidDays: nextUnpaid,
        });
        if (covered > 0) {
          await tx.ledger.create({
            employeeId: leave.employeeId,
            leaveId: leave.id,
            movementType: 'deduction',
            leaveType: 'emergency',
            amount: -covered,
            unit: 'day',
            balanceAfter: nextEmergency,
            occurredOn: leave.startDate,
            notes: `خصم إجازة طارئة: ${covered} يوم — §14.2`,
          });
        }
        if (unpaid > 0) {
          await tx.ledger.create({
            employeeId: leave.employeeId,
            leaveId: leave.id,
            movementType: 'deduction',
            leaveType: 'unpaid',
            amount: unpaid,
            unit: 'day',
            balanceAfter: nextUnpaid,
            occurredOn: leave.startDate,
            notes: `نفاد رصيد الطارئ: ${unpaid} يوم بدون راتب — §14.5/§14.10`,
          });
        }
      });
    }
    // `sick` و`study` وباقي الأنواع: لا خصم رصيد (تعليلها في توثيق الدالة).
  }

  /**
   * إلغاء إجازة: **حركة عكسية مرتبطة**، لا حذف ولا محو (§15).
   *
   * الأصل: كل حركة `deduction` لها سبب (`leaveId`). الإلغاء ينشئ لكل
   * حركة سببها الإجازة الملغاة حركة `cancellation` **معاكسة** تحمل
   * `reverses_ledger_id` → رابط صريح يبيّن أي حركة تعكس أي حركة.
   *
   * لا يُحذف السجل ولا تُمسَّ الحركة السابقة، ولا تُبطَل حركات الإلغاء
   * السابقة (بل حركة عكسية أخرى): السجل تاريخي.
   */
  async cancelLeave(leaveId: string): Promise<void> {
    await this.inTransaction(async (tx) => {
      const leave = await tx.leaves.findById(leaveId);
      if (leave === null) {
        throw new LeaveRuleError('الإجازة غير موجودة.', '§15', 404, 'RESOURCE_NOT_FOUND');
      }
      // الحالة فقط تُكتب؛ لا حذف ولا محو (§15/§32).
      await tx.leaves.update(leaveId, { status: 'cancelled' });

      const originals = await tx.ledger.listActive({ leaveId, movementType: 'deduction' });
      const year = yearOf(leave.startDate);
      const balance = await this.ensureYear(tx, leave.employeeId, year);

      let nextAnnual = balance.annualBalance;
      let nextEmergency = balance.emergencyBalance;
      let nextUnpaid = balance.unpaidDays;
      for (const entry of originals) {
        // قلب الأثر: الخصم يعود للمصروف ⇒ إضافة للرصيد الأصلي.
        const restored = -entry.amount;
        if (entry.leaveType === 'annual') {
          nextAnnual += restored;
        } else if (entry.leaveType === 'emergency') {
          nextEmergency += restored;
        } else {
          // `unpaid` عدّاد للتجاوز: التراجع يقتطع منه ولا يزيد الرصيد.
          nextUnpaid = Math.max(0, nextUnpaid - Math.max(0, restored));
        }
        await tx.ledger.create({
          employeeId: leave.employeeId,
          leaveId,
          movementType: 'cancellation',
          leaveType: entry.leaveType,
          amount: restored,
          unit: entry.unit,
          balanceAfter: nextAnnual,
          occurredOn: leave.startDate,
          reversesLedgerId: entry.id,
          notes: `إلغاء إجازة: عكس حركة الخصم ${entry.id} — §15`,
        });
      }
      await this.writeBalance(tx, leave.employeeId, year, balance, {
        annualBalance: nextAnnual,
        emergencyBalance: nextEmergency,
        unpaidDays: nextUnpaid,
      });
    });
  }

  /**
   * عكس حركة بعينها (تصحيح موثّق) — حركة `reversal` مرتبطة بالأصل (§15).
   *
   * كل حركة معكوسة تُعكس مرّة واحدة: `listActive` تستثني المعكوسة، فليس
   * ممكناً عكس نفس الحركة مرتين.
   */
  async reverseLedgerEntry(
    entryId: string,
    occurredOn: string,
    notes: string,
  ): Promise<void> {
    await this.inTransaction(async (tx) => {
      const entry = await tx.ledger.findById(entryId);
      if (entry === null) {
        throw new LeaveRuleError('حركة الرصيد غير موجودة.', '§15', 404, 'RESOURCE_NOT_FOUND');
      }
      const alreadyReversed = await tx.ledger.listActive({ leaveId: entry.leaveId });
      if (!alreadyReversed.some((active) => active.id === entryId)) {
        throw new LeaveRuleError('الحركة معكوسة مسبقاً.', '§15', 409, 'ALREADY_REVERSED');
      }
      const year = yearOf(entry.occurredOn);
      const balance = await this.ensureYear(tx, entry.employeeId, year);
      const restored = -entry.amount;
      const patch: Record<string, number> = {};
      if (entry.leaveType === 'annual') {
        patch.annualBalance = balance.annualBalance + restored;
      } else if (entry.leaveType === 'emergency') {
        patch.emergencyBalance = balance.emergencyBalance + restored;
      } else {
        patch.unpaidDays = Math.max(0, balance.unpaidDays - Math.max(0, restored));
      }
      await this.writeBalance(tx, entry.employeeId, year, balance, patch);
      await tx.ledger.create({
        employeeId: entry.employeeId,
        ...(entry.leaveId !== undefined && { leaveId: entry.leaveId }),
        ...(entry.timePermissionId !== undefined && {
          timePermissionId: entry.timePermissionId,
        }),
        movementType: 'reversal',
        ...(entry.leaveType !== undefined && { leaveType: entry.leaveType }),
        amount: restored,
        unit: entry.unit,
        balanceAfter: Number(Object.values(patch)[0] ?? balance.annualBalance),
        occurredOn,
        reversesLedgerId: entry.id,
        notes,
      });
    });
  }

  // ── افتتاح الرصيد والتصحيح (§15/§34) ─────────────────────────────

  /**
   * نقطة بداية افتتاحية موثّقة (§34) — **بدل** إعادة بناء التاريخ القديم.
   *
   * الحركة `opening_balance` نفسها هي السجل: لا وجود لـ«رصيد افتتاحي بلا
   * حركة». ولا إعادة ضبط صامتة: إن وُجدت نقطة افتتاحية لنفس
   * (منتسب، سنة، نوع) تُرفض العملية ويُطلب `adjustment` موثّق — فالتغيير
   * الصامت يحتاج تعليلاً.
   */
  async recordOpeningBalance(input: OpeningBalanceInput): Promise<EmployeeLeaveBalance> {
    return this.inTransaction(async (tx) => {
      const year = String(input.year);
      const existing = await tx.balances.findByEmployeeYear(input.employeeId, year);
      if (existing !== null) {
        const priorOpening = await tx.ledger.list({
          employeeId: input.employeeId,
          year: Number(year),
          movementType: 'opening_balance',
          leaveType: input.leaveType,
        });
        if (priorOpening.length > 0) {
          throw new LeaveRuleError(
            'توجد نقطة بداية افتتاحية مسجّلة لنفس الرصيد — لا تُغيَّر صامتة؛ ' +
              'استخدم تصحيحاً إدارياً موثّقاً (adjustment).',
            '§15',
            409,
            'OPENING_BALANCE_EXISTS',
          );
        }
      }
      const balance = await this.ensureYear(tx, input.employeeId, year);
      const days = Math.max(0, input.days);
      const isAnnual = input.leaveType === 'annual';
      const patch = isAnnual
        ? { annualBalance: days }
        : { emergencyBalance: days };
      const updated = await this.writeBalance(tx, input.employeeId, year, balance, patch);
      await tx.ledger.create({
        employeeId: input.employeeId,
        movementType: 'opening_balance',
        leaveType: input.leaveType,
        amount: days,
        unit: 'day',
        balanceAfter: days,
        occurredOn: input.occurredOn,
        notes: input.notes,
      });
      return updated;
    });
  }

  /**
   * تصحيح إداري موثّق (§15) — حركة `adjustment` مع بيان إلزامي.
   *
   * التصحيح يمرّ بـledger مثل أي عملية أخرى؛ لا مسار «تعديل رقم الرصيد
   * مباشرة» في هذا المحرّك (§15).
   */
  async recordAdjustment(input: AdjustmentInput): Promise<EmployeeLeaveBalance> {
    return this.inTransaction(async (tx) => {
      const year = String(input.year);
      const balance = await this.ensureYear(tx, input.employeeId, year);
      const isAnnual = input.leaveType === 'annual';
      const current = isAnnual ? balance.annualBalance : balance.emergencyBalance;
      const next = Math.max(0, current + input.days);
      const applied = next - current;
      const updated = await this.writeBalance(
        tx,
        input.employeeId,
        year,
        balance,
        isAnnual ? { annualBalance: next } : { emergencyBalance: next },
      );
      await tx.ledger.create({
        employeeId: input.employeeId,
        movementType: 'adjustment',
        leaveType: input.leaveType,
        amount: applied,
        unit: 'day',
        balanceAfter: next,
        occurredOn: input.occurredOn,
        notes: input.notes,
      });
      return updated;
    });
  }

  // ── أدوات داخلية ─────────────────────────────────────────────────

  /**
   * ضمان وجود رصيد السنة داخل معاملة جارية.
   *
   * تستدعي `openYear` إن غاب الصف — والاثنتان يفتحان أولاً فلا يُنشأ
   * صف مرتين (قيد `UNIQUE (employee_id, year)` في القاعدة حرز ثانٍ).
   */
  private async ensureYear(
    tx: PersonnelRulesRepositories,
    employeeId: string,
    year: string,
  ): Promise<EmployeeLeaveBalance> {
    const existing = await tx.balances.findByEmployeeYear(employeeId, year);
    return existing ?? this.openYear(employeeId, year);
  }

  /**
   * كتابة أرقام الرصيد بشروط قيمها الحالية.
   *
   * صفر صفوف ⇐ تغيّر الرصيد أثناء العملية ⇒ `BalanceConflictError` بلا
   * كتابة صامتة. الاستدعاء داخل معاملة، فترجع حركة الـledger معه.
   */
  private async writeBalance(
    tx: PersonnelRulesRepositories,
    employeeId: string,
    year: string,
    current: EmployeeLeaveBalance,
    patch: Partial<Pick<
      EmployeeLeaveBalance,
      | 'annualBalance'
      | 'annualServiceDays'
      | 'annualEarnedDays'
      | 'annualRemainderDays'
      | 'annualCarryoverDays'
      | 'annualPendingDays'
      | 'emergencyBalance'
      | 'emergencyRemainderMinutes'
      | 'unpaidDays'
    >>,
  ): Promise<EmployeeLeaveBalance> {
    // الشروط تشمل **كل** الأرقام التي ستُكتب، فأي تداخل يُكتشف هنا.
    const conditions: Record<string, number> = {
      annualBalance: current.annualBalance,
      annualServiceDays: current.annualServiceDays,
      annualEarnedDays: current.annualEarnedDays,
      annualRemainderDays: current.annualRemainderDays,
      annualCarryoverDays: current.annualCarryoverDays,
      annualPendingDays: current.annualPendingDays,
      emergencyBalance: current.emergencyBalance,
      emergencyRemainderMinutes: current.emergencyRemainderMinutes,
      unpaidDays: current.unpaidDays,
    };
    const updated = await tx.balances.updateNumeric(current.id, conditions, patch);
    if (updated === null) {
      throw new BalanceConflictError(employeeId, year);
    }
    return updated;
  }

  /**
   * «مرة واحدة في خدمة المنتسب» (§14.7/§14.8).
   *
   * التعريف المعتمد هنا: وجود إجازة **سابقة من نفس النوع غير ملغاة** في
   * سجلات هذا المنتسب. «خدمة المنتسب» لا تُخترع لها تعريف أعمق (بلا
   * سجل تواريخ خدمة منفصل)، فالمصدر هو سجل الإجازات نفسه وهو ما نصّت
   * الخطة عليه. والملغاة لا تُبطل المعيار: الإلغاء ينشئ حركة عكسية ولا
   * يمحو السجل (§15).
   */
  private async assertOncePerService(employeeId: string, type: LeaveType): Promise<void> {
    const previous = await this.repos.leaves.list({ employeeId, type });
    const used = previous.some((leave) => leave.status !== 'cancelled');
    if (used) {
      const rule = type === 'hajj' ? '§14.7' : '§14.8';
      const arabic = type === 'hajj' ? 'الحج' : 'العمرة';
      throw new LeaveRuleError(
        `استحقاق ${arabic} مرة واحدة في خدمة المنتسب — يوجد سجل سابق غير ملغى (${rule}).`,
        rule,
        409,
        'ONCE_PER_SERVICE_ALREADY_USED',
      );
    }
  }

  /**
   * كل كتابة مركّبة في معاملة واحدة (Phase 17 «database transactions»).
   *
   * `withTransaction` من `database/pool`: COMMIT عند النجاح وROLLBACK مع
   * إعادة الخطأ عند الفشل. فلا يبقى رصيد بلا حركة ولا حركة بلا رصيد.
   *
   * المستودعات تُبنى على `client` المعاملة نفسها، فالكتابةان والمعاملة
   * واحدة فعلاً — لا استدعاء يخرج إلى الـPool من داخل معاملة.
   */
  private async inTransaction<T>(
    operation: (tx: PersonnelRulesRepositories) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, (client) =>
      operation({
        employees: new PgEmployeeRepository(client),
        leaves: new PgLeaveRepository(client),
        timePermissions: new PgTimePermissionRepository(client),
        balances: new PgLeaveBalanceRepository(client),
        ledger: new PgLeaveLedgerRepository(client),
      }),
    );
  }
}

/**
 * المدة بالدقائق من وقتَي الخروج والعودة (§14.3).
 *
 * `undefined` عند غياب `timeIn` (السجل غير مكتمل) أو عند `timeIn <= timeOut`
 * (تجاوز منتصف الليل) — سياسة لم تحسمها الخطة فلا تُخترع هنا. ولا تُعاد
 * تغطية اليوم ولا تُضاف 24 ساعة افتراضياً.
 */
export function computeDurationMinutes(
  timeOut: string,
  timeIn: string | undefined,
): number | undefined {
  if (timeIn === undefined) {
    return undefined;
  }
  const toMinutes = (value: string): number => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const out = toMinutes(timeOut);
  const back = toMinutes(timeIn);
  if (Number.isNaN(out) || Number.isNaN(back) || back <= out) {
    return undefined;
  }
  return back - out;
}