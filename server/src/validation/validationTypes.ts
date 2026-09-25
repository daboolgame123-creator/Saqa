/**
 * أنواع طبقة التحقق من مدخلات HTTP — Phase 8.
 *
 * توفر الأساس فقط: لا تحتوي أي قاعدة أعمال ولا أي تحقق خاص بالموظفين
 * أو الكتب أو المصادقة (تلك مراحل لاحقة).
 */

/** مشكلة واحدة في مدخل الطلب. */
export interface ValidationIssue {
  /** مسار المدخل داخل الطلب (مثال: body.name). */
  field: string;
  /** وصف المشكلة القابل للعرض. */
  message: string;
}

/**
 * نتيجة التحقق: نجاح بقيمة مُتحقَّق منها، أو فشل بقائمة مشاكل.
 *
 * ملاحظة تقنية: المُحدِّد نصي (kind) وليس منطقيًا (valid: boolean)،
 * لأن تضييق الاتحاد بمُحدِّد منطقي لا يعمل تحت إعدادات TypeScript الحالية للمشروع.
 */
export type ValidationOutcome<TValue> =
  | { kind: 'valid'; value: TValue }
  | { kind: 'invalid'; issues: ValidationIssue[] };

/** دالة تحقق مستقلة — تُركَّب لاحقًا على body / params / query / DTO. */
export type Validator<TInput, TOutput = TInput> = (input: TInput) => ValidationOutcome<TOutput>;

/** بناء نتيجة نجاح. */
export function validOutcome<TValue>(value: TValue): ValidationOutcome<TValue> {
  return { kind: 'valid', value };
}

/** بناء نتيجة فشل من قائمة مشاكل. */
export function invalidOutcome<TValue = never>(issues: ValidationIssue[]): ValidationOutcome<TValue> {
  return { kind: 'invalid', issues };
}

/** بناء مشكلة تحقق واحدة. */
export function issue(field: string, message: string): ValidationIssue {
  return { field, message };
}
