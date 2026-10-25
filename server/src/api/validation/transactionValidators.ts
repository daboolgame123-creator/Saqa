/**
 * مُحقِّقات الكتاب (Phase 10 — بند 2 من ترتيب النقل).
 *
 * `month` غير مُقبول: شهر مشتق من `date` في المستودع، فلا يُدخَل من
 * العميل ولا يُقبل حقلاً مستقلاً (نموذج Transaction).
 *
 * الكائنات الوصفية (`directorDirective`, `reminder`, `dailySituationData`,
 * `specificDetails`) بنيتها في النماذج وهي نطاق النماذج؛ لا يُفرض عليها
 * مخطط جديد هنا حتى لا يُقتطع نموذج أعمال في طبقة النقل.
 */
import { booleanValue, pipeline } from './primitives';
import type { Validator } from '../../validation/validationTypes';
import {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import {
  date,
  enumValue,
  id,
  jsonObject,
  list,
  optText,
  optionalQuery,
  positiveInt,
  queryPositiveInt,
  text,
} from './fields';
import {
  ACCESS_SCOPES,
  ATTACHMENT_TYPES,
  RELATIONSHIP_TYPES,
  TARGET_SCOPES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_DIRECTIONS,
  TRANSACTION_PRIORITIES,
  TRANSACTION_STATUSES,
} from './catalogs';

/** حقول الكتاب في عقد الـDTO. */
export const TRANSACTION_FIELDS = [
  'number', 'sequence', 'date', 'direction', 'category', 'subType', 'entity',
  'subject', 'addressedTo', 'content', 'employeeName', 'visibility',
  'targetScope', 'priority', 'directorDirective', 'reminder', 'status',
  'notes', 'isRead', 'readAt', 'isDailySituation', 'dailySituationData',
  'specificDetails', 'importedAt', 'employeeLinks', 'attachments',
] as const;

/** الحقول الإلزامية عند الإنشاء (الباقي له افتراض في القاعدة). */
const TRANSACTION_REQUIRED = [
  'number', 'sequence', 'date', 'direction', 'category', 'subType',
  'entity', 'subject', 'status',
] as const;

/** عنصر رابط موظف (يُفحص ضمن employeeLinks). */
const employeeLinkItem = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  relationshipType: enumValue(RELATIONSHIP_TYPES),
  notes: optText('notes'),
});

/** عنصر مرفق (يُفحص ضمن attachments) — بيانات وصفية فقط. */
const attachmentItem = objectFields<Record<string, unknown>>({
  name: text('name'),
  type: enumValue(ATTACHMENT_TYPES),
  fileSize: text('fileSize'),
  uploadDate: date('uploadDate'),
  originalFilename: optText('originalFilename'),
  mimeType: optText('mimeType'),
  contentHash: optText('contentHash'),
  storageKey: optText('storageKey'),
  ocrState: optText('ocrState'),
});

/**
 * مُحقِّقات حقول الكتاب — سلّم واحد يشترك بين الإنشاء والتعديل
 * (لا نسخة ثانية من القائمة كي لا تفترق النسختان).
 */
const TRANSACTION_FIELD_VALIDATORS: Readonly<Record<string, Validator<unknown, unknown>>> = {
  number: text('number'),
  sequence: text('sequence'),
  date: date('date'),
  direction: enumValue(TRANSACTION_DIRECTIONS),
  category: enumValue(TRANSACTION_CATEGORIES),
  subType: text('subType'),
  entity: text('entity'),
  subject: text('subject'),
  addressedTo: optText('addressedTo'),
  content: optText('content'),
  employeeName: optText('employeeName'),
  visibility: enumValue(ACCESS_SCOPES),
  targetScope: enumValue(TARGET_SCOPES),
  priority: enumValue(TRANSACTION_PRIORITIES),
  directorDirective: jsonObject('directorDirective'),
  reminder: jsonObject('reminder'),
  status: enumValue(TRANSACTION_STATUSES),
  notes: optText('notes'),
  isRead: booleanValue('isRead'),
  readAt: optText('readAt'),
  isDailySituation: booleanValue('isDailySituation'),
  dailySituationData: jsonObject('dailySituationData'),
  specificDetails: jsonObject('specificDetails'),
  importedAt: optText('importedAt'),
  employeeLinks: list('employeeLinks', employeeLinkItem),
  attachments: list('attachments', attachmentItem),
};

/** حقول الكتاب المشتركة بين الإنشاء والتعديل. */
const transactionFields = objectFields<Record<string, unknown>>(
  TRANSACTION_FIELD_VALIDATORS,
);

/** إنشاء كتاب: الروابط والمرفقات تُكتب معه في معاملة واحدة (لا كيانات يتيمة). */
export const createTransactionBody = pipeline([
  requiredFields(TRANSACTION_REQUIRED),
  noUnknownFields(TRANSACTION_FIELDS),
  noExplicitNulls(TRANSACTION_FIELDS),
  transactionFields,
]);

/**
 * حقول تعديل الكتاب.
 * `employeeLinks` مستثناة: الروابط تملك معرّفات وتُدار بمسارها المستقل،
 * فلا تُستبدل دفعةً مع الكتاب لأن ذلك يعني حذف روابط لم يُطلب حذفها.
 *
 * `expectedVersion` (Phase 17 — §33) ليس حقل بيانات يُكتب في الصف، بل
 * شرط القفل، ويُقبل هنا مع بقية الحقول في مرور واحد.
 */
/**
 * حقول تعديل الكتاب على الخادم — المصدر المرجعي لعقد الـPATCH.
 *
 * **مُصدَّر** لأن جسم PATCH الذي تبنيه الواجهة يجب أن يطابقه حرفاً بحرف،
 * واختبار الانحدار يقارن القائمتين. إبقاؤه خاصاً كان يفرض على الاختبار
 * أن يكرّر القائمة فتتفرّقان بصمت.
 */
export const TRANSACTION_PATCH_FIELDS = TRANSACTION_FIELDS.filter(
  (field) => field !== 'employeeLinks',
);

const TRANSACTION_UPDATE_FIELDS: readonly string[] = [
  ...TRANSACTION_PATCH_FIELDS,
  'expectedVersion',
];

/** قيم تعديل الكتاب: حقول الكتاب + شرط النسخة (عدد صحيح موجب). */
const updateTransactionFields = objectFields<Record<string, unknown>>({
  ...TRANSACTION_FIELD_VALIDATORS,
  expectedVersion: positiveInt('expectedVersion'),
});

/**
 * تعديل كتاب (PATCH) — `expectedVersion` إلزامي (Phase 17 — §33).
 *
 * ترتيب الفحوص مقصود: غياب النسخة يُرفض أولاً ورسالته صريحة، فلا يضيع
 * العميل بين «حقل ممنوع» و«نسخة ناقصة». و«حقل تغيير واحد على الأقل»
 * يُحسب على حقول الكتاب دون `expectedVersion` — نسخة وحدها ليست تعديلاً.
 */
export const updateTransactionBody = pipeline([
  requiredFields(['expectedVersion']),
  noUnknownFields(TRANSACTION_UPDATE_FIELDS),
  noExplicitNulls(TRANSACTION_UPDATE_FIELDS),
  atLeastOneField(TRANSACTION_PATCH_FIELDS),
  updateTransactionFields,
]);

/**
 * مُحقِّق مُدخلات الأرشفة (Phase 16 — §32، والقفل Phase 17 — §33).
 *
 * `reason` لأن «سبب الحذف عند الحاجة» نص حر اختياري (§32)، والخطة لا
 * تحدّد قائمة أسباب فتُخترع هنا. حقول الحالة (`deletedAt`/`deletedBy`)
 * والدور والفاعل **غير مقبولة**: الأرشفة على الخادم وحده تكتب طوابعها
 * من هوية الجلسة، فقبولها من العميل يعني تزوير تاريخ أو منسوب.
 *
 * `expectedVersion` إلزامية كذلك: أرشفة سجل تغيّر منذ قراءته تُلغي
 * تعديلاً لم يره المؤرشف، وهي نوع الحذف الأشد خطراً لأنه لا يُمحى بسهولة.
 *
 * يُركَّب على `query` لا `body`: مسار `DELETE` في هذا المشروع لا يحمل
 * جسماً (انظر `postJson` في أدوات الاختبار — bodies مع DELETE تتعطّل).
 */
export const archiveTransactionQuery = pipeline([
  requiredFields(['expectedVersion']),
  noUnknownFields(['reason', 'expectedVersion']),
  noExplicitNulls(['reason', 'expectedVersion']),
  objectFields<Record<string, unknown>>({
    reason: optionalQuery(optText('reason')),
    expectedVersion: queryPositiveInt('expectedVersion'),
  }),
]);

/**
 * مُحقِّق مُدخلات الاستعادة (Phase 16 كمسار، Phase 17 كقفل).
 *
 * الاستعادة `POST` بلا جسم، فشرط النسخة يأتي من الاستعلام كما في الأرشفة.
 * ولا تُقبل حقول أخرى: الحالة تُقرأ من القاعدة ولا تُملأ من العميل.
 */
export const restoreTransactionQuery = pipeline([
  requiredFields(['expectedVersion']),
  noUnknownFields(['expectedVersion']),
  noExplicitNulls(['expectedVersion']),
  objectFields<Record<string, unknown>>({
    expectedVersion: queryPositiveInt('expectedVersion'),
  }),
]);
