/**
 * requestWorkflow — آلة حالات الطلبات وسير الموافقة (Phase 19 · §35 · §18).
 *
 * **لماذا هذا الموضع:** نفس موضع `personnelRules` في Phase 18 — منطق
 * الأعمال على الخادم في `services/`، **خارج React** ولا يعرف `localStorage`
 * ولا مكوّنات العرض ولا SQL. دوال هذا الملف **خالصة** (لا I/O) فتكفي
 * اختبارات الانتقال لكل حالة بلا قاعدة بيانات (§35 «الاختبارات»).
 *
 * ── ما ينفّذه هذا الملف نصّاً ────────────────────────────────────
 * - الحالات السبع في §35: `draft` · `submitted` · `under_review` ·
 *   `clarification_requested` · `approved` · `rejected` · `cancelled`.
 * - العمليات في §35: `submit` · `approve` · `reject` ·
 *   `request_clarification` · `employee_reply` · `cancel` (+ `create` للإنشاء).
 * - التسلسل من §18: `submit → (approve | reject | request_clarification)
 *   → (employee_reply) → final`.
 *
 * ── الانتقالات — مصدر كل سطر فيها ─────────────────────────────────
 * | الانتقال | من | إلى | السند |
 * |---|---|---|---|
 * | `submit` | `draft` | `submitted` | §35 «submit» + §18 «المنتسب يرسل الطلب» |
 * | `approve` | `submitted` \| `clarification_requested` | `approved` | §35 + §18 «موافقة» |
 * | `reject` | `submitted` \| `clarification_requested` | `rejected` | §35 + §18 «رفض» |
 * | `request_clarification` | `submitted` \| `clarification_requested` | `clarification_requested` | §35 + §18 «طلب توضيح» |
 * | `employee_reply` | `clarification_requested` | `clarification_requested` | §18 «المنتسب يرد على التوضيح» — الرد **لا يقرّر** |
 * | `cancel` | `draft` \| `submitted` \| `clarification_requested` | `cancelled` | §35 «cancellation rules» — حالة نهائية بلا حذف (§32) |
 */
import type {
  RequestStatus,
  RequestWorkflowAction,
} from '../../../src/core/models/request';
import { RequestTransitionError } from './requestErrors';

/** الحالات المعتمدة في §35 — مصدر الحقيقة الوحيد لقائمة الحالات. */
export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'clarification_requested',
  'approved',
  'rejected',
  'cancelled',
] as const satisfies readonly RequestStatus[];

/**
 * الحالات النهائية: انتهى الـWorkflow عندها (§18 «الحالة النهائية») ولا
 * انتقال يخرج منها. `under_review` ليست منها: حالتها معتمدة لكنها غير
 * قابلة للوصول لأن لا عملية معتمدة تُنتجها (TBD — انظر آخر الملف).
 */
export const FINAL_REQUEST_STATUSES: readonly RequestStatus[] = [
  'approved',
  'rejected',
  'cancelled',
];

/** هل القيمة حالة معتمدة من §35؟ */
export function isRequestStatus(value: unknown): value is RequestStatus {
  return (
    typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

/** هل الحالة نهائية (لا انتقال يخرج منها)؟ */
export function isFinalRequestStatus(status: RequestStatus): boolean {
  return FINAL_REQUEST_STATUSES.includes(status);
}

/** وصف انتقال واحد: الحالات التي يُسمح منها، والحالة التي ينتهي إليها. */
interface TransitionRule {
  readonly from: readonly RequestStatus[];
  readonly to: RequestStatus;
}

/**
 * جدول الانتقالات — المصدر الوحيد الذي تستشيره الخدمة والمستودع والواجهة
 * (عبر `availableActions`)، فلا تتكرّر القاعدة في أي طبقة.
 *
 * `create` ليس انتقالاً (إنشاء صف بحالة `draft`)، فلا يدخل الجدول: أول صف
 * في `request_status_history` يسجّله المستودع عند الإنشاء نفسه.
 */
export const REQUEST_TRANSITIONS: Readonly<
  Record<Exclude<RequestWorkflowAction, 'create'>, TransitionRule>
> = {
  // §35 submit · §18 «المنتسب يرسل الطلب». من `draft` وحده: الطلب المُرسَل
  // لا يُعاد «إرساله»، والطلب الملغى أو المعتمد حالة نهائية.
  submit: { from: ['draft'], to: 'submitted' },
  // §35 approve · §18 «موافقة»: من الطلب المُرسَل أو بانتظار توضيح بعد رد
  // المنتسب — لا من `draft` (لم يُعرض على أحد) ولا من حالة نهائية.
  approve: { from: ['submitted', 'clarification_requested'], to: 'approved' },
  // §35 reject · §18 «رفض» — نفس شروط `approve`.
  reject: { from: ['submitted', 'clarification_requested'], to: 'rejected' },
  // §35 clarification · §18 «طلب توضيح» — من الحالات المفتوحة نفسها.
  request_clarification: {
    from: ['submitted', 'clarification_requested'],
    to: 'clarification_requested',
  },
  // §18 «المنتسب يرد على التوضيح عند الحاجة»: الرد **لا يغيّر الحالة** لأن
  // القرار يبقى للمدير بعد الرد (approve/reject) — لذلك `from === to`.
  employee_reply: { from: ['clarification_requested'], to: 'clarification_requested' },
  // §35 «cancellation rules» + §32 (لا حذف): انتقال إلى حالة نهائية، ولا
  // أثر على أي سجل آخر — «من ومتى» غير محسومتين في النص (Blocker موثّق).
  cancel: {
    from: ['draft', 'submitted', 'clarification_requested'],
    to: 'cancelled',
  },
};

/** كل الحالات التي يُسمح بالانتقال إليها من `status` (للقراءة و`availableActions`). */
export function allowedNextStatuses(status: RequestStatus): RequestStatus[] {
  return Object.values(REQUEST_TRANSITIONS)
    .filter((rule) => rule.from.includes(status))
    .map((rule) => rule.to);
}

/**
 * هل يُسمح بهذه العملية من الحالة الحالية؟
 *
 * نقطة الاستعلام الوحيدة التي تستعملها الخدمة قبل كل انتقال؛ تستعملها
 * الواجهة لاحقاً عبر `availableActions` (بلا تكرار القاعدة ولا تنفيذها في
 * React — §4 «لا يعتمد الأمن على إخفاء زر»).
 */
export function canTransition(
  action: RequestWorkflowAction,
  from: RequestStatus,
): boolean {
  if (action === 'create') {
    // الإنشاء ليس انتقالاً: يبدأ من لا حالة ⇒ الحالة الأولى `draft` فقط.
    return false;
  }
  return REQUEST_TRANSITIONS[action].from.includes(from);
}

/**
 * يتحقق من صحة الانتقال ويرميه كخطأ قاعدة إن لم يكن مسموحاً.
 *
 * `RequestTransitionError` خطأ قاعدة أعمال (409) لا خطأ مدخلات (400):
 * الجسم صحيح (`action: 'approve'`)، لكن **الحالة** لا تقبله — وهو ما تفصله
 * آلة الحالات عن التحقق من الشكل في `api/validation`.
 */
export function assertTransitionAllowed(
  action: Exclude<RequestWorkflowAction, 'create'>,
  from: RequestStatus,
): void {
  if (!canTransition(action, from)) {
    throw new RequestTransitionError(action, from, REQUEST_TRANSITIONS[action]);
  }
}

/** الإجراءات المتاحة في الحالة الحالية — نفس الجدول بلا تكرار القاعدة. */
export function availableActions(status: RequestStatus): RequestWorkflowAction[] {
  const keys = Object.keys(REQUEST_TRANSITIONS) as Array<
    Exclude<RequestWorkflowAction, 'create'>
  >;
  return keys.filter((action) => canTransition(action, status));
}

/**
 * هل الإجراء من أفعال قرار المدير؟ الثلاثة نفسها التي تنصّ عليها §35
 * و§10.2: هي وحدها التي تُفرض عليها صلاحية `approve_request` في
 * `authorization/permissions.ts` — أي أن المدير يحصل على Workflow action
 * ولا يحصل بسببه على CRUD عام على ملفات المنتسب أو الكتب (§35 «المدير»).
 */
export function isDirectorAction(
  action: RequestWorkflowAction,
): action is RequestDirectorActionName {
  return (
    action === 'approve' || action === 'reject' || action === 'request_clarification'
  );
}

/** أسماء أفعال قرار المدير الثلاثة كما في `RequestDirectorAction` (نموذج المجال). */
export type RequestDirectorActionName = 'approve' | 'reject' | 'request_clarification';

/**
 * «طلب التوضيح» يلزمه سؤال نصّي (§35 «clarification»): بلا سؤال لا معنى
 * للطلب. الشرط نفسه الواجب في نموذج الواجهة القديم
 * (`src/services/requestService.ts`) فنُقل عنـه لا اخترعناه.
 */
export function requiresClarificationQuestion(action: RequestWorkflowAction): boolean {
  return action === 'request_clarification';
}

// ══════════════════════════════════════════════════════════════════
// ما **لم** يُنفَّذ عمداً (غير محسوم في الخطة — لا يُخترع)
// ══════════════════════════════════════════════════════════════════
//
// 1. **`under_review`**: الحالة معتمدة في §35 لكن لا نصّ يحدّد أي عملية
//    تنقل الطلب إليها ولا من يحق له ذلك. فلا `transition` إنتاجية لها هنا
//    ولا مسار في الـAPI — تُقبل كقيمة صالحة في قيد القاعدة وتُقرأ فقط.
//    **TBD** موثّق في `PHASE_19_REPORT.md` §5.
// 2. **`cancelled` بعد `approved`/`rejected`**: لا «إلغاء اعتماد» ولا «إعادة
//    فتح» في النص، فالحالتان نهائيتان ولا انتقال منهما إطلاقاً.
// 3. **الأثر على السجلات الفعلية**: لا قاعدة «الاعتماد ينشئ
//    Leave/TimePermission» ولا «الإلغاء يعكس خصماً» في الخطة ⇒ لا إنشاء
//    سجل ولا حركة رصيد ولا ربط من أي مسار في هذه المرحلة.
// 4. **من يحق له الإلغاء ومتى**: «cancellation rules» مذكورة في §35
//    **كاختبار مطلوب** لا كقاعدة نصّية ⇒ لا شرط مخترع.
// 5. **حالة الطلب بعد ردّ المنتسب**: تبقى `clarification_requested` لأن
//    النصّ يعيد القرار إلى المدير، فلا تُصفَّر الحالة ولا تُنقل.