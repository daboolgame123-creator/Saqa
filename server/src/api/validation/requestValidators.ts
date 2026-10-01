/**
 * مُحقِّقات الطلبات وسير الموافقة (Phase 19 · §35).
 *
 * حدود هذا الملف: **الشكل فقط** — قيم الحقول وأنواعها، لا انتقلان حالة
 * ولا صلاحية. الانتقالات في `services/requestWorkflow.ts` والصلاحيات في
 * `authorization/`؛ فصل الثلاثة هو ما يجعل 400 (مدخلات) و403 (صلاحية)
 * و409 (حالة لا تقبل الإجراء) معنىً مختلفاً لا مترادفاً.
 *
 * `expectedVersion` إلزامية في **كل** كتابة على طلب قائم (Phase 17)،
 * فلا مسار كتابة بلا قفل — كما في `updateTransactionBody`.
 */
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import type { Validator } from '../../validation/validationTypes';
import { pipeline } from './primitives';
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
  optionalQuery,
  optText,
  positiveCount,
  positiveInt,
  time,
} from './fields';
import {
  LEAVE_TYPES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  REQUEST_WORKFLOW_ACTIONS,
} from './catalogs';

/** حقول إنشاء الطلب: `status` و`version` و`clarification` ليست منها. */
export const REQUEST_CREATE_FIELDS = [
  'employeeId', 'kind', 'payload', 'notes',
] as const;

/** حقول تعديل الطلب (مسوّد فقط) + النسخة الإلزامية. */
export const REQUEST_PATCH_FIELDS = [
  'employeeId', 'kind', 'payload', 'notes', 'expectedVersion',
] as const;

/** حقول عملية Workflow: الإجراء + تعليق/رد + النسخة الإلزامية. */
export const REQUEST_TRANSITION_FIELDS = [
  'action', 'comment', 'response', 'expectedVersion',
] as const;

/** حقول قراءة قائمة الطلبات. */
export const REQUEST_LIST_QUERY_FIELDS = ['employeeId', 'status', 'kind'] as const;

/**
 * حمولة `leave`: نفس حقول `LeaveRequestPayload` في نموذج المجال،
 * **بالحقول الإلزامية**: النموذج يجعل `leaveType` و`startDate` و
 * `endDate` مطلوبة و`days`/`reason` اختيارية. `objectFields` وحده
 * يمرّر الغائب (الحقل غير المُرسل يبقى غائباً) فلا يكفي للحمولة، لأن حقولها
 * الإلزامية جزء من **شكل** الحمولة لا قاعدة عمل.
 */
const leavePayload = pipeline([
  requiredFields(['kind', 'leaveType', 'startDate', 'endDate']),
  objectFields<Record<string, unknown>>({
    kind: enumValue(['leave'] as const),
    leaveType: enumValue(LEAVE_TYPES),
    startDate: date('startDate'),
    endDate: date('endDate'),
    days: positiveCount('days'),
    reason: optText('reason'),
  }),
]);

/** حمولة `time_permission`: نفس حقول النموذج، و`date`/`timeOut` إلزاميان (§14.3). */
const timePermissionPayload = pipeline([
  requiredFields(['kind', 'date', 'timeOut']),
  objectFields<Record<string, unknown>>({
    kind: enumValue(['time_permission'] as const),
    date: date('date'),
    timeOut: time('timeOut'),
    timeIn: time('timeIn'),
    reason: optText('reason'),
  }),
]);

/**
 * حمولة `general`/`equipment`: **كائن JSON حرّ**.
 *
 * أنواعها معتمدة في §35 لكن حقولها غير محددة في نصّ الخطة ⇒ تُحفظ كما
 * أُرسلت بلا قواعد مخترَعة. و`kind` يُفرض فيها فقط للتطابق مع عمود
 * النوع (§35)، لا كقاعدة عمل.
 */
const freePayloadKind = (
  kind: 'general' | 'equipment',
): Validator<unknown, Record<string, unknown>> =>
  objectFields<Record<string, unknown>>({ kind: enumValue([kind] as const) });

/**
 * فحص الحمولة بحسب نوع الطلب — تفويض لأنواعها الـ`leave` و
 * `time_permission` لمُحقِّقي شؤون المنتسبين نفسيهما (قاعدة واحدة لا
 * نسختان)، و`general`/`equipment` حرّة.
 */
export function payloadValidatorFor(
  kind: unknown,
): Validator<unknown, Record<string, unknown>> {
  if (kind === 'leave') {
    return leavePayload;
  }
  if (kind === 'time_permission') {
    return timePermissionPayload;
  }
  if (kind === 'general') {
    return freePayloadKind('general');
  }
  if (kind === 'equipment') {
    return freePayloadKind('equipment');
  }
  return () => invalidOutcome([issue('kind', 'نوع الطلب غير معتمد (§35).')]);
}

/**
 * يفحص الحمولة بحسب نوع الطلب في نفس جسم الطلب.
 *
 * لازم أن يكون في المُحقِّق نفسه لا في الخدمة: `leave` لها حقول إلزامية
 * وأخرى محرّمة، و`general`/`equipment` لا قواعد لها. الخطوة تقرأ `kind`
 * من الجسم ثم تفوض للمُحقِّق المناسب — فلا يتكرر الشرط في كل موضع.
 */
const payloadMatchesKind: Validator<unknown, true> = (input) => {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return invalidOutcome([issue('body', 'كائن JSON مطلوب.')]);
  }
  const source = input as Record<string, unknown>;
  if (source.payload === undefined) {
    return validOutcome(true);
  }
  const outcome = payloadValidatorFor(source.kind)(source.payload);
  return outcome.kind === 'invalid' ? outcome : validOutcome(true);
};

/** إنشاء طلب. `status` ممنوع: الحالة تُنتجها عمليات الخادم لا العميل. */
export const createRequestBody = pipeline([
  requiredFields(['employeeId', 'kind', 'payload']),
  noUnknownFields(REQUEST_CREATE_FIELDS),
  noExplicitNulls(REQUEST_CREATE_FIELDS),
  payloadMatchesKind,
  objectFields<Record<string, unknown>>({
    employeeId: id('employeeId'),
    kind: enumValue(REQUEST_KINDS),
    payload: jsonObject('payload'),
    notes: optText('notes'),
  }),
]);

/**
 * تعديل طلب (مسوّد فقط — شرط `status = 'draft'` داخل `WHERE` في
 * المستودع). `expectedVersion` إلزامية (Phase 17): غيابها 400 لا كتابة
 * مفتوحة على طلب قد يكون تغيّر في جلسة أخرى.
 */
export const updateRequestBody = pipeline([
  requiredFields(['expectedVersion']),
  noUnknownFields(REQUEST_PATCH_FIELDS),
  noExplicitNulls(REQUEST_PATCH_FIELDS),
  atLeastOneField(['payload', 'notes']),
  payloadMatchesKind,
  objectFields<Record<string, unknown>>({
    employeeId: id('employeeId'),
    kind: enumValue(REQUEST_KINDS),
    payload: jsonObject('payload'),
    notes: optText('notes'),
    expectedVersion: positiveInt('expectedVersion'),
  }),
]);

/**
 * قائمة الطلبات: فلاتر قراءة فقط. `status` و`kind` من الكتالوجين
 * (قيدَي CHECK في القاعدة) — قيمة خارجهما تُرفض هنا قبل الاستعلام.
 */
export const requestListQuery = pipeline([
  noUnknownFields(REQUEST_LIST_QUERY_FIELDS),
  objectFields<Record<string, unknown>>({
    employeeId: optionalQuery(id('employeeId')),
    status: optionalQuery(enumValue(REQUEST_STATUSES)),
    kind: optionalQuery(enumValue(REQUEST_KINDS)),
  }),
]);

/**
 * مُحقِّق عملية Workflow: الإجراء + تعليق/رد + النسخة.
 *
 * قيود الإجراء هنا **شكلٌ لا قاعدة**: حقلٌ مطلوب لهذا الإجراء أو ممنوع
 * معه. أما «هل هذا الإجراء مسموح في الحالة الحالية؟» فقرارُ
 * `requestWorkflow` (409) لا هنا.
 *
 * الخطوة الأخيرة **تمرّر الجسم** ولا تُعيد قيمة بديلة: ناتج `pipeline`
 * هو ناتج آخر خطوة، فإعادة `true` كانت تُسقط الحقول المنقّاة أعلاه.
 */
export const requestTransitionBody = pipeline([
  requiredFields(['action', 'expectedVersion']),
  noUnknownFields(REQUEST_TRANSITION_FIELDS),
  noExplicitNulls(REQUEST_TRANSITION_FIELDS),
  objectFields<Record<string, unknown>>({
    // `create` ليس إجراء انتقال — يدخله المستودع وحده، فلا يُقبل من العميل.
    action: enumValue(REQUEST_WORKFLOW_ACTIONS.filter((value) => value !== 'create')),
    comment: optText('comment'),
    response: optText('response'),
    expectedVersion: positiveInt('expectedVersion'),
  }),
  (input) => {
    const body = (input ?? {}) as Record<string, unknown>;
    const action = body.action;
    const comment = body.comment;
    const response = body.response;
    const problems: string[] = [];

    if (action === 'request_clarification') {
      // سؤال التوضيح هو جوهر العملية (§35 «clarification») — نصٌّ مطلوب.
      if (typeof comment !== 'string' || comment.trim().length === 0) {
        problems.push('سؤال التوضيح مطلوب مع طلب التوضيح (comment).');
      }
      if (response !== undefined) {
        problems.push('ردّ المنتسب لا يُرسل مع طلب التوضيح (response).');
      }
    } else if (action === 'employee_reply') {
      // ردّ المنتسب هو جوهر هذه العملية (§18 «المنتسب يرد على التوضيح»).
      if (typeof response !== 'string' || response.trim().length === 0) {
        problems.push('ردّ المنتسب مطلوب مع employee_reply (response).');
      }
      if (comment !== undefined) {
        problems.push('سؤال التوضيح يرسله المدير ضمن طلب التوضيح فقط (comment).');
      }
    } else if (response !== undefined) {
      problems.push('هذا الإجراء لا يحمل ردّ منتسب (response).');
    }

    // الخطوة **تمرّر الجسم كما هو** ولا تُعيد قيمة جديدة: في `pipeline`
    // آخر خطوة هي الناتج، ولو أعادت `true` لسقطت القيمة المنقّاة من
    // `objectFields` أعلاه (فلا تصل الحقول النظيفة إلى الخدمة أصلاً).
    return problems.length > 0
      ? invalidOutcome(problems.map((message) => issue('action', message)))
      : validOutcome(input);
  },
]);