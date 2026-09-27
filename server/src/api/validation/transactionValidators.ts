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
import {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import { date, enumValue, id, jsonObject, list, optText, text } from './fields';
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

/** حقول الكتاب المشتركة بين الإنشاء والتعديل. */
const transactionFields = objectFields<Record<string, unknown>>({
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
});

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
 */
const TRANSACTION_UPDATE_FIELDS = TRANSACTION_FIELDS.filter(
  (field) => field !== 'employeeLinks',
);

/** تعديل كتاب (PATCH). */
export const updateTransactionBody = pipeline([
  noUnknownFields(TRANSACTION_UPDATE_FIELDS),
  noExplicitNulls(TRANSACTION_UPDATE_FIELDS),
  atLeastOneField(TRANSACTION_UPDATE_FIELDS),
  transactionFields,
]);
