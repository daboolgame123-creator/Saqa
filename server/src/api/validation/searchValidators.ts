/**
 * محقق معاملات البحث الموحد (Phase 22).
 *
 * يتبع أنماط Phase 10 في `queryValidators.ts`: noUnknownFields + objectFields
 * مع `optionalQuery` للحقول الاختيارية من query string.
 */
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import { objectFields, noUnknownFields } from './objectValidators';
import { pipeline } from './primitives';
import {
  enumValue,
  nonNegativeInt,
  optionalQuery,
  positiveInt,
  text,
} from './fields';

/** أنواع الموارد المسموحة في البحث الموحد. */
export const SEARCH_TYPES = ['transaction', 'employee', 'all'] as const;

/** محقق query string لمسار /api/search. */
export const searchQuery = pipeline([
  noUnknownFields(['q', 'type', 'limit', 'offset']),
  objectFields<Record<string, unknown>>({
    q: text('q'),
    type: optionalQuery(enumValue(SEARCH_TYPES)),
    limit: optionalQuery(positiveInt('limit')),
    offset: optionalQuery(nonNegativeInt('offset')),
  }),
]);

/** التحقق اليدوي الإضافي: q لا يجب أن يكون فراغاً بعد التقليم. */
export function validateSearchQuery(
  input: unknown,
): { valid: true } | { valid: false; issues: { field: string; message: string }[] } {
  const obj = input as Record<string, unknown> | undefined;
  const q = obj && typeof obj.q === 'string' ? obj.q.trim() : undefined;
  if (!q) {
    return {
      valid: false,
      issues: [issue('q', 'نص البحث مطلوب ولا يمكن أن يكون فراغاً.')],
    };
  }
  return { valid: true };
}