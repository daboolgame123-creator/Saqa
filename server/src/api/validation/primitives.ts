/**
 * ط£ط¯ظˆط§طھ ط¨ظ†ط§ط، ظ…ظڈط­ظ‚ظگظ‘ظ‚ط§طھ ط§ظ„ط¥ط¯ط®ط§ظ„ â€” ط§ظ„ط£ط³ط§ط³ (Phase 10 server-side validation).
 *
 * ظ…ط¨ظ†ظٹط© ط¹ظ„ظ‰ `validation/validationTypes.ts` ط§ظ„ظ…ظˆط¬ظˆط¯ط© ظ…ظ† Phase 8
 * (`Validator` / `ValidationOutcome` / `validOutcome` / `invalidOutcome` / `issue`).
 *
 * ظ‚ط§ط¹ط¯ط©: ط§ظ„طھط­ظ‚ظ‚ ط¹ظ„ظ‰ ط§ظ„ط®ط§ط¯ظ… ظ‡ظˆ ط§ظ„ظ…ط±ط¬ط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ. طھط­ظ‚ظ‚ React (ط¥ظ† ظˆظڈط¬ط¯) ظ„ظ„ظ€UX
 * ظپظ‚ط· ظˆظ„ط§ ظٹظڈط؛ظ†ظٹ ط¹ظ† ظ‡ط°ط§. ط§ظ„ظ‚ظٹظ… ط§ظ„ظ…ط³ظ…ظˆط­ط© طھط£طھظٹ ظ…ظ† ظƒطھط§ظ„ظˆط¬ط§طھ `src/core/models`
 * ط§ظ„ظ…ط¹طھظ…ط¯ط© â€” ظ„ط§ طھظڈط®طھط±ط¹ ظ‡ظ†ط§.
 */
import {
  invalidOutcome,
  issue,
  validOutcome,
  type ValidationIssue,
  type ValidationOutcome,
  type Validator,
} from '../../validation/validationTypes';

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظٹظ‚ط¨ظ„ ظ‚ظٹظ…ط© ظ…ظ† ظ…ط¬ظ…ظˆط¹ط© ظ…ط؛ظ„ظ‚ط© ظپظ‚ط· (ظٹظ‚ط§ط¨ظ„ ظ‚ظٹط¯ CHECK ظپظٹ ط§ظ„ظ‚ط§ط¹ط¯ط©). */
export function oneOf<TValue extends string>(allowed: readonly TValue[]): Validator<unknown, TValue> {
  const set = new Set<string>(allowed);
  return (input) =>
    typeof input === 'string' && set.has(input)
      ? validOutcome(input as TValue)
      : invalidOutcome([
          issue('value', `ط§ظ„ظ‚ظٹظ…ط© ط؛ظٹط± ظ…ط³ظ…ظˆط­ط©. ط§ظ„ظ‚ظٹظ… ط§ظ„ظ…ظ‚ط¨ظˆظ„ط©: ${allowed.join('طŒ ')}.`),
        ]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظ†طµ ط؛ظٹط± ظپط§ط±ط؛ ط¨ط¹ط¯ ط§ظ„طھط´ط°ظٹط¨. */
export function nonEmptyText(field: string): Validator<unknown, string> {
  return (input) =>
    typeof input === 'string' && input.trim().length > 0
      ? validOutcome(input.trim())
      : invalidOutcome([issue(field, 'ظ†طµ ط؛ظٹط± ظپط§ط±ط؛ ظ…ط·ظ„ظˆط¨.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظ†طµ ط§ط®طھظٹط§ط±ظٹ: ظٹطµط¨ط­ undefined ط¥ظ† ظƒط§ظ† ط؛ط§ط¦ط¨ط§ظ‹ ط£ظˆ ظپط§ط±ط؛ط§ظ‹. */
export function optionalText(field: string): Validator<unknown, string | undefined> {
  return (input) =>
    input === undefined || input === null
      ? validOutcome(undefined)
      : typeof input === 'string' && input.trim().length > 0
        ? validOutcome(input.trim())
        : invalidOutcome([issue(field, 'ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ†طµط§ظ‹ ط؛ظٹط± ظپط§ط±ط؛ ط¹ظ†ط¯ طھظ…ط±ظٹط±ظ‡.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظ…ط¹ط±ظ‘ظپ ظƒظٹط§ظ† (ظ†طµ ط؛ظٹط± ظپط§ط±ط؛) â€” ط§ظ„ظ‚ظˆط§ط¹ط¯ ط§ظ„ط£ط³ط§ط³ظٹط© ظ„ظ„ط¹ظ„ط§ظ‚ط§طھ (ط§ظ„ظ‚ط§ط¹ط¯ط© 7). */
export function entityId(field: string): Validator<unknown, string> {
  return nonEmptyText(field);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ط¹ط¯ط¯ طµط­ظٹط­ ظ…ظˆط¬ط¨ (ظ…ط«ظ„ limit). */
export function positiveInteger(field: string): Validator<unknown, number> {
  return (input) =>
    typeof input === 'number' && Number.isInteger(input) && input > 0
      ? validOutcome(input)
      : invalidOutcome([issue(field, 'ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط¹ط¯ط¯ط§ظ‹ طµط­ظٹط­ط§ظ‹ ظ…ظˆط¬ط¨ط§ظ‹.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ط¹ط¯ط¯ طµط­ظٹط­ ط؛ظٹط± ط³ط§ظ„ط¨ (ظ…ط«ظ„ offset ط§ظ„ط°ظٹ ظ‚ط¯ ظٹظƒظˆظ† طµظپط±ط§ظ‹). */
export function nonNegativeInteger(field: string): Validator<unknown, number> {
  return (input) =>
    typeof input === 'number' && Number.isInteger(input) && input >= 0
      ? validOutcome(input)
      : invalidOutcome([issue(field, 'ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط¹ط¯ط¯ط§ظ‹ طµط­ظٹط­ط§ظ‹ ط؛ظٹط± ط³ط§ظ„ط¨.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظ…ظ†ط·ظ‚ظٹ. */
export function booleanValue(field: string): Validator<unknown, boolean> {
  return (input) =>
    typeof input === 'boolean'
      ? validOutcome(input)
      : invalidOutcome([issue(field, 'ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ‚ظٹظ…ط© ظ…ظ†ط·ظ‚ظٹط©.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ طھط§ط±ظٹط® ط¹ظ…ظ„ YYYY-MM-DD (ظٹطھط­ظ‚ظ‚ ط¨ط§ط³طھط¹ظ…ط§ظ„ ط¯ط§ظ„ط© dateTime ظ…ظ† Phase 9). */
export function dateOnly(
  field: string,
  isValid: (value: string) => boolean,
): Validator<unknown, string> {
  return (input) =>
    typeof input === 'string' && isValid(input)
      ? validOutcome(input)
      : invalidOutcome([issue(field, 'ط§ظ„طھط§ط±ظٹط® ظ…ط·ظ„ظˆط¨ ط¨طµظٹط؛ط© YYYY-MM-DD.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظˆظ‚طھ HH:mm ط¨ظ†ط¸ط§ظ… 24 ط³ط§ط¹ط© (ظٹطھط­ظ‚ظ‚ ط¨ط§ط³طھط¹ظ…ط§ظ„ ط¯ط§ظ„ط© dateTime ظ…ظ† Phase 9). */
export function timeOfDay(
  field: string,
  isValid: (value: string) => boolean,
): Validator<unknown, string> {
  return (input) =>
    typeof input === 'string' && isValid(input)
      ? validOutcome(input)
      : invalidOutcome([issue(field, 'ط§ظ„ظˆظ‚طھ ظ…ط·ظ„ظˆط¨ ط¨طµظٹط؛ط© HH:mm.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظƒط§ط¦ظ† JSON (ط؛ظٹط± ظ…طµظپظˆظپط©). ط§ظ„ط¨ظ†ظٹط© ط§ظ„ط¯ظ‚ظٹظ‚ط© طھظڈظپط­طµ ط¨ط­ظ‚ظˆظ„ظ‡. */
export function objectValue(field: string): Validator<unknown, Record<string, unknown>> {
  return (input) =>
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? validOutcome(input as Record<string, unknown>)
      : invalidOutcome([issue(field, 'ظƒط§ط¦ظ† JSON ظ…ط·ظ„ظˆط¨.')]);
}

/** ظ…ظڈط­ظ‚ظگظ‘ظ‚ ظ…طµظپظˆظپط© (ظٹط¬ظˆط² ط£ظ† طھظƒظˆظ† ظپط§ط±ط؛ط©)طŒ ظٹظپط­طµ ظƒظ„ ط¹ظ†طµط± ط¨ظ€item. */
export function arrayOf<TValue>(
  field: string,
  item: Validator<unknown, TValue>,
): Validator<unknown, TValue[]> {
  return (input) => {
    if (!Array.isArray(input)) {
      return invalidOutcome([issue(field, 'ظ‚ط§ط¦ظ…ط© ظ…ط·ظ„ظˆط¨ط© (ظˆظٹط¬ظˆط² ط£ظ† طھظƒظˆظ† ظپط§ط±ط؛ط©).')]);
    }
    const issues: ValidationIssue[] = [];
    const values: TValue[] = [];
    input.forEach((raw, index) => {
      const outcome = item(raw);
      if (outcome.kind === 'valid') {
        values.push(outcome.value);
      } else {
        for (const problem of outcome.issues) {
          issues.push(issue(`${field}[${index}].${problem.field}`, problem.message));
        }
      }
    });
    return issues.length > 0 ? invalidOutcome(issues) : validOutcome(values);
  };
}

/** ظٹظ†ظپظ‘ط° ط¹ط¯ط© ظ…ظڈط­ظ‚ظگظ‘ظ‚ط§طھ ط¨ط§ظ„طھط±طھظٹط¨ ظˆظٹظˆظ‚ظپ ط¹ظ†ط¯ ط£ظˆظ„ ظپط´ظ„. */
export function pipeline<TValue>(
  steps: readonly Validator<unknown, unknown>[],
): Validator<unknown, TValue> {
  return (input) => {
    // كل خطوة تفحص المدخل الأصلي نفسه لا ناتج الخطوة السابقة: هذه
    // خطوات تحقق مركّبة على مستوى الكائن كله (هل الحقول المطلوبة موجودة؟
    // هل لا حقول زائدة؟ هل كل قيمة صحيحة؟) وليست محوّلات متسلسلة.
    let last: unknown = input;
    for (const step of steps) {
      const outcome = step(input);
      if (outcome.kind === 'invalid') {
        return outcome as ValidationOutcome<never>;
      }
      last = outcome.value;
    }
    return validOutcome(last as TValue);
  };
}
