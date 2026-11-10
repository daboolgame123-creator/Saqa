/**
 * مُحقِّقات رابط الكتاب بالمنتسب (Phase 10 — بند 3، BR-05).
 *
 * العلاقة M:N حقيقية: الطرفان معرّفات لا أسماء (القاعدة 7).
 * لا يوجد delete للكيانين، فقط إزالة الرابط (عقد المستودع Phase 9).
 */
import { pipeline } from './primitives';
import {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import { enumValue, id, optText } from './fields';
import { RELATIONSHIP_TYPES } from './catalogs';

const LINK_CREATE_FIELDS = ['transactionId', 'employeeId', 'relationshipType', 'notes'] as const;
const LINK_UPDATE_FIELDS = ['relationshipType', 'notes'] as const;

/** إنشاء رابط: كلا الطرفين إلزامي (علاقة بلا طرفين لا معنى لها). */
export const createTransactionEmployeeBody = pipeline([
  requiredFields(['transactionId', 'employeeId']),
  noUnknownFields(LINK_CREATE_FIELDS),
  noExplicitNulls(LINK_CREATE_FIELDS),
  objectFields<Record<string, unknown>>({
    transactionId: id('transactionId'),
    employeeId: id('employeeId'),
    relationshipType: enumValue(RELATIONSHIP_TYPES),
    notes: optText('notes'),
  }),
]);

/** تعديل رابط: الحقول الاختيارية فقط. */
export const updateTransactionEmployeeBody = pipeline([
  noUnknownFields(LINK_UPDATE_FIELDS),
  noExplicitNulls(LINK_UPDATE_FIELDS),
  atLeastOneField(LINK_UPDATE_FIELDS),
  objectFields<Record<string, unknown>>({
    relationshipType: enumValue(RELATIONSHIP_TYPES),
    notes: optText('notes'),
  }),
]);
