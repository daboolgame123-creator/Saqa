/**
 * مُحقِّقات الموقف اليومي المستقل (Phase 10 — بند 4، BR-13).
 *
 * الموقف اليومي ليس كتاباً: الربط الأساسي عبر employeeId (القاعدة 7)،
 * و`relatedRecord` رابط اختياري بسجل إداري واحد يترجم إلى أعمدة FK.
 */
import { pipeline } from './primitives';
import {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import { date, enumValue, id, optText } from './fields';
import { DAILY_SITUATION_CATEGORIES, RELATED_RECORD_KINDS } from './catalogs';

const DAILY_SITUATION_FIELDS = [
  'employeeId', 'date', 'category', 'timeOrDuration', 'reason', 'notes', 'relatedRecord',
] as const;

/** رابط اختياري لسجل إداري ذي صلة. */
const relatedRecordItem = objectFields<Record<string, unknown>>({
  kind: enumValue(RELATED_RECORD_KINDS),
  id: id('id'),
});

const dailySituationFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  date: date('date'),
  category: enumValue(DAILY_SITUATION_CATEGORIES),
  timeOrDuration: optText('timeOrDuration'),
  reason: optText('reason'),
  notes: optText('notes'),
  relatedRecord: relatedRecordItem,
});

/** إنشاء قيد: الموظف والتاريخ والقسم إلزامية (BR-13). */
export const createDailySituationBody = pipeline([
  requiredFields(['employeeId', 'date', 'category']),
  noUnknownFields(DAILY_SITUATION_FIELDS),
  noExplicitNulls(DAILY_SITUATION_FIELDS),
  dailySituationFields,
]);

/** تعديل قيد (PATCH). */
export const updateDailySituationBody = pipeline([
  noUnknownFields(DAILY_SITUATION_FIELDS),
  noExplicitNulls(DAILY_SITUATION_FIELDS),
  atLeastOneField(DAILY_SITUATION_FIELDS),
  dailySituationFields,
]);
