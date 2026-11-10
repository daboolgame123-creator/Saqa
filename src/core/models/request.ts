/**
 * الطلبات وسير الموافقة (Phase 19 · §18 · §35) — البنية المعتمدة فقط:
 * `Request → submit → (director) approve / reject / clarification → (employee reply) → final`
 *
 * حدود النموذج (لا يُخترع ما لم يُعتمد):
 * - الأنواع: الأنواع الأولية التي نصّت عليها §35 — طلبات عامة · أجهزة/معدات
 *   · إجازة · زمنية. لا نوع خامس بلا اعتماد لاحق (§35 «الأنواع الأخرى بعد
 *   اعتمادها»).
 * - الحالات: الحالات السبع في §35 بالضبط.
 * - `under_review` حالة معتمدة لكن **لا عملية معتمدة تُنتجها** (قرار غير
 *   محسوم — موثّق في `PHASE_19_REPORT.md`)؛ تُقرأ ولا يُخترع لها مسار.
 * - المنتسب يرد على طلب التوضيح عبر clarification.response.
 * - إشعار المدير بالطلب وآلية تنفيذه منفصلان عن النموذج (نظام إشعارات لاحق).
 * - اعتماد الطلب **لا ينشئ** سجل Leave/TimePermission تلقائياً: لا نصّ في
 *   الخطة يقرر ذلك (Phase 19 Blocker موثّق). الفصل بين الطلب والسجل قائم
 *   كما نصّ §18.
 * - قواعد الإلغاء (من/متى/الأثر) غير معتمدة — تُوثَّق الحاجة ولا تُنفَّذ.
 */
import type { LeaveType } from './employeeLeave';

/**
 * نوع الطلب — الأنواع الأولية المعتمدة في Phase 19 (§35).
 * `general` طلب عام، `equipment` جهاز/معدات، `leave` إجازة، `time_permission` زمنية.
 */
export type RequestKind = 'general' | 'equipment' | 'leave' | 'time_permission';

/**
 * حالة الطلب — الحالات السبع المعتمدة في §35.
 * بنية قابلة للتوسّع بحالات مستقبلية معتمدة دون إعادة بناء.
 */
export type RequestStatus =
  | 'draft'                    // مسودة (لم تُرسل بعد)
  | 'submitted'                // مُقدَّم بانتظار قرار المدير
  | 'under_review'             // قيد المراجعة (معتمدة؛ لا مُنتِج معتمد — TBD)
  | 'clarification_requested'  // طلب المدير توضيحاً (بانتظار رد المنتسب ثم القرار)
  | 'approved'                 // معتمد
  | 'rejected'                 // مرفوض
  | 'cancelled';               // ملغى — حالة Workflow لا حذف

/**
 * عملية الـWorkflow المطبَّقة على الطلب — من عمليات §35:
 * submit · approve · reject · clarification · employee reply · cancellation.
 * الأفعال الثلاثة الأولى قرار المدير، و`employee_reply` رد المنتسب،
 * و`submit` إرسال الطلب، و`cancel` انتقاله إلى الحالة النهائية الملغاة.
 */
export type RequestDirectorAction = 'approve' | 'reject' | 'request_clarification';

/** دورة التوضيح: طلب المدير التوضيح وردّ المنتسب عليه */
export interface RequestClarification {
  question?: string;   // طلب التوضيح من المدير
  askedAt?: string;
  response?: string;   // رد المنتسب على طلب التوضيح
  respondedAt?: string;
}

/** قرار المدير النهائي على الطلب */
export interface RequestDirectorDecision {
  action: RequestDirectorAction;
  decidedAt?: string;
  comment?: string;
}

/** بيانات طلب الإجازة (BR-09) */
export interface LeaveRequestPayload {
  leaveType: LeaveType;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  days?: number;
  reason?: string;
}

/** بيانات طلب الإذن الزمني (BR-10) */
export interface TimePermissionRequestPayload {
  date: string;        // YYYY-MM-DD
  timeOut: string;     // HH:mm (نظام 24 ساعة)
  timeIn?: string;     // HH:mm
  reason?: string;
}

/**
 * عملية الـWorkflow التي تُنشئ صفاً في `request_status_history`.
 *
 * قيمها عمليات §35 نفسها ولا غير: `create` (إنشاء الطلب) · `submit` ·
 * `approve` · `reject` · `request_clarification` (طلب التوضيح) ·
 * `employee_reply` (رد المنتسب) · `cancel`. **لا رابع** — أي فعل آخر
 * (مثلاً `under_review`) بلا عملية معتمدة في الخطة فلا يُخترع.
 */
export type RequestWorkflowAction =
  | 'create'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'request_clarification'
  | 'employee_reply'
  | 'cancel';

/** حمولة الطلب مميّزة بالنوع (discriminated union) — نوع واحد فقط لكل طلب */
export type RequestPayload =
  | ({ kind: 'leave' } & LeaveRequestPayload)
  | ({ kind: 'time_permission' } & TimePermissionRequestPayload);

/** حمولة الطلب بعد فكّ التمييز: الحقول المشتركة بين الأنواع الأربعة. */
export type RequestPayloadData = Record<string, unknown>;

/**
 * سجل تغيير حالة الطلب (§18 «تاريخ التغييرات»).
 *
 * سجل مستقلّ عن `requests.clarification` و`director_decision` لأن هذين
 * يحملان **الحالة الراهنة** لدورة التوضيح/القرار، بينما هذا يحمل
 * **التاريخ الكامل**: كل انتقال حالةٍ بفاعله ووقته وتعليقه. عملية واحدة
 * (`submit` … `cancel`) = صف واحد، و`create` صفّ الإنشاء (بلا حالة سابقة
 * ⇒ `fromStatus` غائبة). لا يُحذف ولا يُعدَّل (§15/§32/§33).
 */
export interface RequestStatusHistoryRecord {
  id: string;
  requestId: string;
  /** الحالة السابقة؛ غائبة في صف الإنشاء (لا حالة قبله). */
  fromStatus?: RequestStatus;
  toStatus: RequestStatus;
  /** عملية §35 التي أنتجت هذا الانتقال (`create` للإنشاء). */
  action: RequestWorkflowAction;
  /** الحساب المنفّذ من هوية الجلسة — لا من جسم الطلب. */
  actorUserId?: string;
  /** المنتسب المرتبط بالحساب — قد يكون غائباً (حساب بلا منتسب). */
  actorEmployeeId?: string;
  comment?: string;
  createdAt: string;
}

/**
 * الطلب — كيان مستقل عن السجل الفعلي (فصل §18 بين الطلب والسجل):
 * اعتماد الطلب **لا ينشئ** السجل الفعلي تلقائياً ولا رابطاً إليه؛ قاعدة
 * «الاعتماد ينشئ Leave/TimePermission» غير محسومة في الخطة فلم تُنفَّذ
 * (Blocker موثّق في `PHASE_19_REPORT.md`).
 */
export interface Request {
  id: string;
  employeeId: string;                         // صاحب الطلب (القاعدة 7 — employeeId لا الاسم)
  /** نوع الطلب من الأنواع الأولية §35 — عمود مستقل عن الحمولة. */
  kind: RequestKind;
  /** بيانات الطلب حسب نوعه — تُحفظ كما أُرسلت بلا اشتقاق. */
  payload: RequestPayloadData;
  status: RequestStatus;
  createdAt?: string;
  updatedAt?: string;
  clarification?: RequestClarification;       // دورة التوضيح الحالية (§18)
  directorDecision?: RequestDirectorDecision; // قرار المدير
  /**
   * السجل الفعلي المرتبط بالطلب — يبقى `undefined` لأن قاعدة الربط
   * (والإنشاء التلقائي) غير محسومة؛ العمودان موجودان في القاعدة منذ
   * Phase 9 ولا يُملآن إلا بقاعدة معتمدة.
   */
  linkedLeaveId?: string;
  linkedTimePermissionId?: string;
  notes?: string;
  /** نسخة القفل التفاؤلي (Phase 17 · §33) — تُقرأ وتُرسل في `expectedVersion`. */
  version?: number;
}
