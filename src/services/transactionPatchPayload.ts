/**
 * بناء جسم PATCH للكتاب — نقطة واحدة تُبنى فيها الحقول المرسلة.
 *
 * **العيب المُصلَح هنا (صيانة خارج نطاق Phase 18):**
 * كان `handleSaveTransaction` في `App.tsx` يرسل كائن `Transaction` كاملاً:
 *
 * ```ts
 * updateTransaction(normalized.id, { ...normalized, expectedVersion: normalized.version });
 * ```
 *
 * فكان الطلب يحمل حقول **قراءة** لا يقبلها مُحقِّق PATCH على الخادم —
 * `id` · `month` · `createdAt` — فيرفضه الخادم بـ400 `noUnknownFields`.
 * العيب قائم منذ Phase 10، وموثّق في تقرير Phase 17 كقيد مفتوح.
 *
 * **لماذا لا نضعف `noUnknownFields` ولا نوسّع `UpdateTransactionDto`:**
 * `id` و`month` و`createdAt` حقول للقراءة/مشتقّة؛ قبولها من العميل يجعله
 * صاحبها فينشأ مصدران للحقيقة (§5: الفرض على الخادم). و`month` يُشتق في
 * الخادم من `date`. وتجاوز `noUnknownFields` يزيل بالضبط الحارس الذي كشف
 * الخطأ.
 *
 * **لماذا دالة مستقلة لا حقلاً حقلاً داخل component:**
 * قائمة الحقول المسموحة يجب أن تكون **مصدراً واحداً مُختبَراً**، لا تُنسخ
 * يدوياً في `App.tsx`. البناء هنا يجعل أي كسر لاحق (حقل جديد بلا تحديث
 * القائمة) خطأ اختبار ظاهراً، وهو ما لا يوفّره `...normalized`.
 *
 * المرجع: `UpdateTransactionDto` في `server/src/api/dto/transaction.ts`
 * ومُحقِّق `updateTransactionBody` في `api/validation/transactionValidators.ts`.
 */
import type { AttachmentInput, UpdateTransactionInput } from '../core/interfaces/dataAdapter';
import type { Transaction } from '../core/models/transaction';

/**
 * حقول الكتاب التي يقبلها `PATCH` على الخادم.
 *
 * نسخة عن `TRANSACTION_PATCH_FIELDS` في
 * `server/src/api/validation/transactionValidators.ts` (مستثنى منها
 * `employeeLinks` لها مسارها المستقل). اختبار
 * `server/tests/transactionPatchPayload.test.ts` يمرّر الجسم الناتج على
 * مُحقِّق الخادم نفسه، فلا تتفرّق القائمتان صامتتين.
 *
 * **حقول مستبعدة عمداً:**
 * - `id` — معرّف المسار؛ الخادم يحدّده لا العميل.
 * - `month` — مشتق من `date` في الخادم (لا مصدران للحقيقة).
 * - `createdAt` · `updatedAt` · `importedAt` — طوابع النظام يكتبها الخادم.
 * - `employeeIds` — مرآة مشتقّة من جدول الروابط؛ تعديلها مسار مستقل.
 * - `version` — عمود القفل؛ يُرسل كـ`expectedVersion` لا كحقل يُكتب.
 */
const PATCHABLE_TRANSACTION_FIELDS = [
  'number',
  'sequence',
  'date',
  'direction',
  'category',
  'subType',
  'entity',
  'subject',
  'addressedTo',
  'content',
  'employeeName',
  'visibility',
  'targetScope',
  'priority',
  'directorDirective',
  'reminder',
  'status',
  'notes',
  'isRead',
  'readAt',
  'isDailySituation',
  'dailySituationData',
  'specificDetails',
] as const satisfies readonly (keyof Transaction)[];

/** أسماء حقول الكتاب المقبولة في PATCH — للاختبار والتوثيق. */
export const PATCHABLE_TRANSACTION_FIELD_NAMES: readonly string[] =
  PATCHABLE_TRANSACTION_FIELDS;

/** الحقول التي يجب **ألا** تصل في جسم PATCH أبداً (قراءة/مشتقّة/نظام). */
export const READ_ONLY_TRANSACTION_FIELDS: readonly string[] = [
  'id',
  'month',
  'createdAt',
  'updatedAt',
  'importedAt',
  'employeeIds',
  'version',
];

/** يحوّل مرفق واجهة (يحمل حقول عرض) إلى مُدخل بلا معرّف (§10 المرفقات). */
function toAttachmentInput(attachment: Transaction['attachments'][number]): AttachmentInput {
  return {
    name: attachment.name,
    type: String(attachment.type),
    fileSize: attachment.fileSize,
    uploadDate: attachment.uploadDate,
  };
}

/**
 * يبني جسم `PATCH` المحصور في حقول `UpdateTransactionDto` + `expectedVersion`.
 *
 * الحقول الاختيارية الغائبة تُحذف تماماً بدل إرسالها `undefined`: JSON لا
 * يميّز `undefined` عن الغياب، والمُحقِّق يرفض `noExplicitNulls`.
 */
export function buildTransactionUpdatePatch(transaction: Transaction): UpdateTransactionInput {
  const source = transaction as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of PATCHABLE_TRANSACTION_FIELDS) {
    const value = source[field];
    if (value !== undefined) {
      patch[field] = value;
    }
  }
  if (transaction.attachments !== undefined) {
    patch.attachments = transaction.attachments.map(toAttachmentInput);
  }
  // القفل التفاؤلي (Phase 17 — §33): شرط لا حقل بيانات.
  patch.expectedVersion = transaction.version;
  return patch as UpdateTransactionInput;
}