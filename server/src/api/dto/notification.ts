/**
 * DTOs الإشعارات والتذكيرات (Phase 21 · §20 · §21).
 *
 * **عقد الاستجابة = إشعار + مرجع مورد، لا نسخة من المورد** (§37). الحقل
 * `payload` يحمل `resourceKind`/`resourceId` (المعرّف هو المرجع، القاعدة 7)
 * و`summary` سطراً قصيراً للعرض — ولا حقل لكائن الكتاب ولا للطلب. والواجهة
 * (UI-08) ستفتح المصدر الحقيقي بنفس المعرّف.
 *
 * **بلا `userId` في DTO الإشعار**: صاحب الإشعار هو صاحب الجلسة دائماً،
 * وإعادته في الاستجابة لا تفيد العميل وتشجّعه على الاعتماد عليه بدل
 * الجلسة (§28). والـ`relatedId` في DTO التذكير **ليس** `userId` — هو
 * معرّف المورد المتابَع (القاعدة 7)، والمرتبط يُقرأ فقط بلا تحقق.
 */
import type {
  NotificationKind,
  NotificationPayload,
} from '../../../../src/core/models/notification';

/** إشعار واحد كما يُعاد إلى العميل. */
export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  /** المرجع والخلاصة — **لا نسخة من المورد** (§37). */
  payload?: NotificationPayload;
  /** حالة «جديد» (§20) — الجرس ومؤشر النقطة الحمراء. */
  isNew: boolean;
  createdAt: string;
  /** وقت القراءة؛ غائب إن لم تُقرأ بعد. */
  readAt?: string;
}

/** عدّاد غير المقروء — يقرأه جرس UI-08. */
export interface UnreadCountDto {
  unread: number;
}

/** فلاتر قراءة قائمة الإشعارات — كلها اختيارية. */
export interface NotificationListQuery {
  /** تصفية حالة «جديد». */
  isNew?: boolean;
  /** تصفية بالنوع. */
  kind?: NotificationKind;
  limit?: number;
  offset?: number;
}

/** تذكير واحد كما يُعاد إلى العميل (§21). */
export interface ReminderDto {
  id: string;
  enabled: boolean;
  remindOn: string;
  remindAt: string;
  note: string;
  /**
   * `status` كما تُخزَّنه القاعدة. قيمه غير محددة في الخطة والخدمة لا
   * تكتبه (TBD) — فالحقل للقراءة فقط ولا يُقبل في الإدخال.
   */
  status?: string;
  relatedKind?: string;
  relatedId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * إنشاء تذكير (§21).
 *
 * `enabled` اختياري ويُفترض `true` (عمود `enabled NOT NULL DEFAULT true`
 * في 0004). **بلا `status`**: قيمته غير محسومة، وقبوله من العميل كان
 * سيخترع قائمة حالات أعمال.
 */
export interface CreateReminderDto {
  remindOn: string;
  remindAt: string;
  note: string;
  enabled?: boolean;
  relatedKind?: string;
  relatedId?: string;
}

/** تعديل تذكير — جزئي، والحقول غير المذكورة تبقى كما هي. */
export type UpdateReminderDto = Partial<CreateReminderDto>;