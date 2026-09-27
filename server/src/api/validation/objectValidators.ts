/**
 * أدوات تركيب مُحقِّقات الكائنات (Phase 10 server-side validation).
 *
 * تفصل بين «شكل الكائن المسموح» (أي الحقول) و«قيمة كل حقل»
 * (المُحقِّقات الأساسية في `primitives.ts`).
 */
import {
  invalidOutcome,
  issue,
  validOutcome,
  type ValidationIssue,
  type Validator,
} from '../../validation/validationTypes';

/**
 * مُحقِّق كائن من الحقول المعروفة.
 *
 * سلوك مهم: الحقل غير المرسل يبقى **غائباً** في النتيجة ولا يُتحقق إلا إن
 * رُسل صراحةً. هذا يجعل نفس المُحقِّق صالحاً لـPATCH (تعديل جزئي) بعد
 * استدعاء `requiredFields` لـCreate.
 */
export function objectFields<TValue extends object>(
  fields: Readonly<Record<string, Validator<unknown, unknown>>>,
): Validator<unknown, Partial<TValue>> {
  return (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return invalidOutcome([issue('body', 'كائن JSON مطلوب.')]);
    }
    const source = input as Record<string, unknown>;
    const issues: ValidationIssue[] = [];
    const value: Record<string, unknown> = {};

    for (const [field, validator] of Object.entries(fields)) {
      if (!(field in source)) {
        continue;
      }
      const outcome = validator(source[field]);
      if (outcome.kind === 'valid') {
        // الحقل الذي يُطبَّع إلى undefined لا يُدرج (لا مفتاح بقيمة undefined).
        if (outcome.value !== undefined) {
          value[field] = outcome.value;
        }
      } else {
        issues.push(...outcome.issues);
      }
    }

    return issues.length > 0 ? invalidOutcome(issues) : validOutcome(value as Partial<TValue>);
  };
}

/** مُحقِّق «هذه الحقول مطلوبة»: يرفض الغياب قبل التحقق النوعي. */
export function requiredFields(fields: readonly string[]): Validator<unknown, true> {
  return (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return invalidOutcome([issue('body', 'كائن JSON مطلوب.')]);
    }
    const source = input as Record<string, unknown>;
    const issues = fields
      .filter((field) => source[field] === undefined || source[field] === null)
      .map((field) => issue(field, 'هذا الحقل مطلوب.'));
    return issues.length > 0 ? invalidOutcome(issues) : validOutcome(true);
  };
}

/** مُحقِّق «ممنوع الحقل الزائد»: يرفض أي مفتاح خارج المسموح. */
export function noUnknownFields(allowed: readonly string[]): Validator<unknown, true> {
  const set = new Set(allowed);
  return (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return invalidOutcome([issue('body', 'كائن JSON مطلوب.')]);
    }
    const unknown = Object.keys(input as Record<string, unknown>).filter((key) => !set.has(key));
    return unknown.length > 0
      ? invalidOutcome(unknown.map((key) => issue(key, 'حقل غير معروف لهذا المورد.')))
      : validOutcome(true);
  };
}

/** مُحقِّق «يجب إرسال حقل واحد على الأقل» — لPATCH الفارغ الذي لا معنى له. */
export function atLeastOneField(allowed: readonly string[]): Validator<unknown, true> {
  return (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return invalidOutcome([issue('body', 'كائن JSON مطلوب.')]);
    }
    const source = input as Record<string, unknown>;
    const hasAny = allowed.some((field) => source[field] !== undefined);
    return hasAny
      ? validOutcome(true)
      : invalidOutcome([issue('body', 'يجب إرسال حقل واحد على الأقل للتعديل.')]);
  };
}

/**
 * مُحقِّق «لا حقلاً غائباً ولا زائداً»: كل الحقول المسموحة إما حاضرة أو غائبة،
 * ولا يمكن إرساله بقيمة `null` صراحةً (الغياب يُفهم من مفتاح غير موجود).
 */
export function noExplicitNulls(fields: readonly string[]): Validator<unknown, true> {
  const set = new Set(fields);
  return (input) => {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return invalidOutcome([issue('body', 'كائن JSON مطلوب.')]);
    }
    const nulled = Object.entries(input as Record<string, unknown>)
      .filter(([key, value]) => set.has(key) && value === null)
      .map(([key]) => issue(key, 'لا تُرسل null — احذف الحقل بدل ذلك.'));
    return nulled.length > 0 ? invalidOutcome(nulled) : validOutcome(true);
  };
}
