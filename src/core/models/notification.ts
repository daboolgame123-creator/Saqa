/**
 * الإشعارات والتذكيرات (Phase 21 — §7.13 · §7.14 · §20 · §21 · §37).
 *
 * **مصدر الأنواع هو قيد CHECK في ترحيل 0004** لا الاختيار: الأنواع الستة
 * (`NOTIFICATION_KINDS`) هي حرفياً قيم `notifications.kind` المعتمدة في
 * §20 «أنواع الاستخدام الأساسية» الستّة. وحارس في `tests/notification.test.ts`
 * يقارن الاثنين فلا تُفتح قيمة بلا سند.
 *
 * قواعد هذا الملف:
 * - **الإشعار ليس المورد**: `NotificationPayload` يحمل **مرجعاً** للمورد
 *   (`resourceKind` + `resourceId`) وخلاصة عرض قصيرة فقط — لا نسخة من
 *   الكتاب ولا الطلب (§37 «resource» + «payload/reference»، والقاعدة 7:
 *   المعرّف هو أساس كل علاقة).
 * - **تاريخي vs جديد**: `isNew` و`readAt` حالتان منفصلتان (§20 «السجل
 *   التاريخي للإشعارات يبقى منفصلاً عن حالة جديد») — فتعليم المقروء لا
 *   يحذف الصف ولا يمحو تاريخه.
 * - **لا قيم مخترعة**: قيم `Reminder.status` **غير محددة في الخطة**، فلا
 *   نضع هنا قائمة حالات. العمود يبقى حرفياً كما أنشأه الترحيل 0004
 *   (TBD موثّق في `PHASE_21_REPORT.md` §4).
 */

/**
 * أنواع الإشعارات المعتمدة (§20) — مرآة قيد `notifications.kind` في 0004.
 *
 * `important_change` نوع معتمد لكنه **لا مُولِّد له في Phase 21**: نصّ
 * الخطة لا يحدّد ما الذي يجعل التغيّر «مهماً» ولا لمن يُرسَل، فإصداره
 * سيكون اختراع قاعدة (TBD في `PHASE_21_REPORT.md` §4).
 */
export const NOTIFICATION_KINDS = [
  'book_available',
  'new_broadcast',
  'important_change',
  'new_request',
  'request_update',
  'due_reminder',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** تسمية عربية لكل نوع — للعرض فقط؛ القرار يبقى في النوع لا في النص. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  book_available: 'كتاب متاح لك',
  new_broadcast: 'إعمام جديد',
  important_change: 'تغيّر مهم',
  new_request: 'طلب جديد',
  request_update: 'تحديث طلب',
  due_reminder: 'تذكير مستحق',
};

/**
 * أنواع المورد التي يمكن أن يشير إليها إشعار.
 *
 * **محدودة بما ينتجه هذا المشروع فعلاً**: `transaction` (كتاب) و`request`
 * (طلب) و`reminder` (تذكير). لا تُضاف نوعاً لم يُنشأ له مسار، فالإشارة
 * يجب أن تكون قابلة للفتح على مصدرها الحقيقي (§22 «العنصر الزمني يجب
 * أن يقود إلى مصدره الحقيقي إن كان ذلك ممكناً»).
 */
export const NOTIFICATION_RESOURCE_KINDS = ['transaction', 'request', 'reminder'] as const;

export type NotificationResourceKind = (typeof NOTIFICATION_RESOURCE_KINDS)[number];

/**
 * حمولة الإشعار — **مرجع وليس نسخة** (§37).
 *
 * `resourceKind` + `resourceId` هما المرجع (قاعدة 7)، و`summary` خلاصة
 * قصيرة تُغني الواجهة عن فتح المصدر لعرض سطر واحد. ولا حقل لكائن المورد
 * ولا لقائمة مرتبطة به.
 */
export interface NotificationPayload {
  /** نوع المورد المُشار إليه — `undefined` إن كان الحدث بلا مورد. */
  resourceKind?: NotificationResourceKind;
  /** معرّف المورد (uuid) — المرجع الحقيقي، لا رابط نصي. */
  resourceId?: string;
  /** خلاصة قصيرة للعرض فقط (رقم كتاب / نوع طلب / نص التذكير). */
  summary?: string;
  /**
   * المورد **المرتبط بالتذكير** (`reminders.related_kind`/`related_id`).
   *
   * يُحمل فقط في `due_reminder`: فالتذكير قد يشير إلى سجل آخر هو
   * موضوع المتابعة، والضغط على الإشعار يجب أن يقود إلى ذلك السجل لا
   * إلى التذكير نفسه (§22 «العنصر الزمني يجب أن يقود إلى مصدره الحقيقي
   * إن كان ذلك ممكناً»).
   *
   * `kind` هنا نص كما هو في `related_kind` — **بلا توسيع** لقائمة الأنواع
   * لأن أهداف التذكير غير مثبتة في الخطة (§7.14 · TBD).
   */
  relatedResource?: { kind: string; id: string };
}

/**
 * إشعار واحد كما يُقرأ (§7.13 · §37).
 *
 * `isNew` و`readAt` يُقرآن معاً: `isNew=false` مع `readAt` مضبوط يعني
 * «قُرئ»؛ و`isNew=false` بلا `readAt` حالة يسمح بها الجدول ولا تعني هنا
 * شيئاً — والقراءة تُعيد ما يخزّنه الصف بلا اشتقاق.
 */
export interface Notification {
  id: string;
  /** صاحب الإشعار — من هوية الحساب لا من جسم الطلب (§10.3). */
  userId: string;
  kind: NotificationKind;
  payload?: NotificationPayload;
  /** حالة «جديد» للجرس — تُصفَّر بالتعليم لا بالحذف (§20). */
  isNew: boolean;
  createdAt: string;
  /** وقت القراءة؛ `undefined` إن لم تُقرأ بعد. */
  readAt?: string;
}

/**
 * تذكير (§7.14 · §21).
 *
 * الحقول من الترحيل 0004 كما هي **بلا حقل مضاف**: `enabled` · `remindOn`
 * (التاريخ) · `remindAt` (الوقت) · `note` (النص المخصص) · `status`
 * (قيمته غير محددة في الخطة ⇒ TBD، ولا تُكتب في هذه المرحلة) ·
 * `relatedKind`/`relatedId` (مرجع السجل المتابع).
 *
 * **بلا `userId`**: نصّ §21 لا ينص على أن للتذكير مالكاً، و`notifications.user_id`
 * إلزامي، فمن ينتج `due_reminder` يحتاج قاعدة تختار المستلم — وهي
 * **TBD** لا تُخترع هنا (انظر `services/reminderDispatcher.ts`).
 */
export interface Reminder {
  id: string;
  enabled: boolean;
  /** تاريخ الاستحقاق YYYY-MM-DD. */
  remindOn: string;
  /** وقت الاستحقاق HH:mm. */
  remindAt: string;
  /** النص المخصص (§21). */
  note: string;
  /** قيمة الحالة كما تُخزَّن؛ قيمها غير محددة في الخطة (TBD). */
  status?: string;
  /** نوع السجل المتابع إن وُجد. */
  relatedKind?: string;
  /** معرّف السجل المتابع — مرجع بالمعرّف لا نص (القاعدة 7). */
  relatedId?: string;
  createdAt?: string;
  updatedAt?: string;
}