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
const RELATED_RECORD_FIELDS = ['kind', 'id'] as const;
/** A related record is one complete, typed FK reference — never half an object. */
const relatedRecordItem = pipeline([
  requiredFields(RELATED_RECORD_FIELDS),
  noUnknownFields(RELATED_RECORD_FIELDS),
  noExplicitNulls(RELATED_RECORD_FIELDS),
  objectFields<Record<string, unknown>>({
    kind: enumValue(RELATED_RECORD_KINDS),
    id: id('id'),
  }),
]);

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

/** The owner of a recorded daily situation is historical and immutable. */
const DAILY_SITUATION_PATCH_FIELDS = DAILY_SITUATION_FIELDS.filter(
  (field) => field !== 'employeeId',
);

const dailySituationPatchFields = objectFields<Record<string, unknown>>({
  date: date('date'),
  category: enumValue(DAILY_SITUATION_CATEGORIES),
  timeOrDuration: optText('timeOrDuration'),
  reason: optText('reason'),
  notes: optText('notes'),
  relatedRecord: relatedRecordItem,
});

/** Administrative corrections may edit the content, never silently move ownership. */
export const updateDailySituationBody = pipeline([
  noUnknownFields(DAILY_SITUATION_PATCH_FIELDS),
  noExplicitNulls(DAILY_SITUATION_PATCH_FIELDS),
  atLeastOneField(DAILY_SITUATION_PATCH_FIELDS),
  dailySituationPatchFields,
]);
