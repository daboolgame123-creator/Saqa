/**
 * أخطاء قواعد الإجازات والزمنيات (Phase 18).
 *
 * `LeaveRuleError` = مخالفة قاعدة معتمدة في §14 (خطأ متوقّع 400/409).
 * `BalanceConflictError` = تعارض على صف الرصيد (409، كPhase 17).
 *
 * لماذا لا `ValidationError`: التحقق في طبقة الـHTTP يفحص الشكل فقط؛
 * «إجازة حج ثانية في الخدمة» شكلها صحيح ومضمونها يخالف §14.7، فخطؤها
 * خطأ قاعدة لا خطأ مدخلات.
 */
import { AppError } from '../errors';

export class LeaveRuleError extends AppError {
  /** القاعدة التي خالفت، للقراءة البرمجية (§14). */
  readonly rule: string;

  constructor(message: string, rule: string, statusCode = 409, code = 'LEAVE_RULE_VIOLATION') {
    super(message, statusCode, code, true, { rule });
    this.rule = rule;
  }
}

/**
 * تعارض على صف الرصيد: تغيّر بين القراءة والكتابة.
 *
 * نفس دلالة `VERSION_CONFLICT` في Phase 17 لكن للرصيد — المحرك يعيد
 * القراءة ويعيد الحساب بدل الكتابة فوق الأحدث.
 */
export class BalanceConflictError extends AppError {
  constructor(employeeId: string, year: string) {
    super(
      `تعارض تحديث رصيد الإجازات للمنتسب «${employeeId}» لسنة ${year}: ` +
        'تغيّر الرصيد أثناء العملية. لم تُكتب أي حركة — أعد المحاولة.',
      409,
      'BALANCE_CONFLICT',
      true,
      { employeeId, year },
    );
  }
}