/**
 * مُحقِّقات نطاق الكتب في Phase 20 (§36): انتقال الحالة وإنشاء ارتباط
 * كتابين. نفس أسلوب `transactionValidators.ts`: سلّم واحد، قيود صريحة،
 * لا قيم خارج الكتالوجات المعتمدة.
 */
import { pipeline } from './primitives';
import type { Validator } from '../../validation/validationTypes';
import {
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import { enumValue, id, positiveInt } from './fields';
import { TRANSACTION_STATUSES } from './catalogs';

/**
 * انتقال حالة الكتاب (§36).
 *
 * الحالتان المعتمدتان فقط (`TRANSACTION_STATUSES`)، و`expectedVersion`
 * إلزامية (Phase 17). **لا جدول انتقالات** ولا حقل `notes`/`reason`:
 * اتجاه الانتقال غير محدّد في §8.1 (TBD — `PHASE_20_REPORT.md` §5)،
 * والنصّ المرافق للانتقال غير مقرّر.
 *
 * أي حالة خارج القائمتين تُرفض 400 — القيد نفسه موجود في القاعدة
 * (`transactions_status_check`)، والتحقق يعطي 400 مفهومة بدل 500.
 */
export const transitionTransactionStatusBody = pipeline([
  requiredFields(['status', 'expectedVersion']),
  noUnknownFields(['status', 'expectedVersion']),
  noExplicitNulls(['status', 'expectedVersion']),
  objectFields<Record<string, unknown>>({
    status: enumValue(TRANSACTION_STATUSES),
    expectedVersion: positiveInt('expectedVersion'),
  }),
]);

/**
 * إنشاء ارتباط كتاب: `relatedTransactionId` فقط.
 *
 * الطرف المُشير (A) من مسار `/api/transactions/:id/relations` ولا يُقبل
 * في الجسم — وجوده في جسم الطلب يجعل طريق العلاقة قابلاً للتبديل
 * بالعميل، والأصل أن الطرف الأول هو الكتاب الذي يفتح الصفحة.
 *
 * **لا حقل `relationshipType`**: أنواع العلاقة غير محدّدة في نصّ الخطة،
 * فلا تُخترع قائمة (TBD).
 */
export const createTransactionRelationBody = pipeline([
  requiredFields(['relatedTransactionId']),
  noUnknownFields(['relatedTransactionId']),
  noExplicitNulls(['relatedTransactionId']),
  objectFields<Record<string, unknown>>({
    relatedTransactionId: id('relatedTransactionId'),
  }),
]);