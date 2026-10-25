/**
 * محقق معاملات البحث الموحد (Phase 22).
 *
 * يتبع أنماط Phase 10 في `queryValidators.ts`: noUnknownFields + objectFields
 * مع `optionalQuery` للحقول الاختيارية من query string.
 */
import { objectFields, noUnknownFields, requiredFields } from './objectValidators';
import { pipeline } from './primitives';
import {
  enumValue,
  optionalQuery,
  queryMaxInt,
  queryNonNegativeInt,
  text,
} from './fields';

/** أنواع الموارد المسموحة في البحث الموحد. */
export const SEARCH_TYPES = ['transaction', 'employee', 'all'] as const;

/**
 * مُحقِّق query string لمسار /api/search.
 *
 * `q` **إلزامي**: نص البحث الفارغ أو الغائب لا معنى له، وغيابه كان
 * سينزل إلى الخدمة كقيمة مفقودة. لذلك يُشترط بـ`requiredFields` هنا
 * لا في طبقة الخدمة.
 *
 * `limit` و`offset` يأتيان من query string كنصوص (`?limit=20`)،
 * فمُحقِّقاهما يحوّلان النص إلى عدد بعد التحقق (انظر `fields.ts`).
 */
export const searchQuery = pipeline([
  noUnknownFields(['q', 'type', 'limit', 'offset']),
  requiredFields(['q']),
  objectFields<Record<string, unknown>>({
    q: text('q'),
    type: optionalQuery(enumValue(SEARCH_TYPES)),
    limit: optionalQuery(queryMaxInt('limit', 100)),
    offset: optionalQuery(queryNonNegativeInt('offset')),
  }),
]);