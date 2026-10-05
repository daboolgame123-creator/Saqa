/**
 * خدمات الإشعارات والتذكيرات في طبقة الـAPI (Phase 21 · §20 · §21 · §37).
 *
 * الفصل الحاكم في هذا الملف: **المستخدم يأتي من هوية الجلسة حصراً** ولا
 * يُقبل `userId` من العميل في أي مكان (§28). طبقة HTTP تمرّر `userId` من
 * `req.auth`، والخدمة تمرّره إلى مستودع يفرضه في `WHERE` — فلا تُقرأ
 * إشعارات غيره لا بالتخمين ولا بمُعامل استعلام.
 *
 * **ولا تقرؤ «غير المقروء» كحذف**: `markRead` يصفّر `is_new` ويضبط
 * `read_at` فقط؛ الصف يبقى وسجله التاريخي محفوظ (§20 «السجل التاريخي
 * للإشعارات يبقى منفصلاً عن حالة جديد»).
 */
import type {
  NotificationRecord,
  NotificationRepository,
  ReminderRecord,
  ReminderRepository,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import { toNotificationDto, toReminderDto } from '../dto/recordMappers';
import type {
  CreateReminderDto,
  NotificationDto,
  NotificationListQuery,
  ReminderDto,
  UnreadCountDto,
  UpdateReminderDto,
} from '../dto/notification';

const ARABIC_NOTIFICATION = 'الإشعار';
const ARABIC_REMINDER = 'التذكير';

/**
 * خدمة قراءة الإشعارات لمستخدم واحد.
 *
 * **`userId` معامل إلزامي من الجلسة في كل دالة** — لا قيمة افتراضية ولا
 * «كل المستخدمين»؛ والفرض النهائي في `WHERE user_id = $1` داخل المستودع.
 */
export class NotificationApiService {
  constructor(private readonly notifications: NotificationRepository) {}

  /** قائمة إشعارات المستخدم — الأحدث أولاً، والملكية مفروضة في SQL. */
  async list(userId: string, query: NotificationListQuery = {}): Promise<NotificationDto[]> {
    const records = await this.notifications.listForUser(userId, {
      ...(query.isNew !== undefined && { isNew: query.isNew }),
      ...(query.kind !== undefined && { kind: query.kind }),
      ...(query.limit !== undefined && { limit: query.limit }),
      ...(query.offset !== undefined && { offset: query.offset }),
    });
    return records.map(toNotificationDto);
  }

  /** عدّاد الجرس (§20 «جرس» + «حالة جديد») — لغير المقروء وحده. */
  async unreadCount(userId: string): Promise<UnreadCountDto> {
    return { unread: await this.notifications.countUnread(userId) };
  }

  /**
   * تعليم إشعار كمقروء.
   *
   * **404 لا 403** لِما ليس له: من مرّر معرّف إشعار غيره لا يعرف أصلاً أن
   * المعرّف موجود (حجب وجود، §12) — والفرق مقصود: 403 كان سيكشف وجود
   * صفٍّ لغيره.
   *
   * والإخفاء (idempotent) يأتي من المستودع: `COALESCE(read_at, now())`
   * يبقي وقت القراءة الأول مهما تكرّر النداء.
   */
  async markRead(id: string, userId: string): Promise<NotificationDto> {
    const record = await this.notifications.markRead(id, userId);
    if (record === null) {
      throw new ResourceNotFoundError('notification', id, ARABIC_NOTIFICATION);
    }
    return toNotificationDto(record);
  }

  /** إشعار واحد ضمن مالكه — للتفاصيل في الواجهة لاحقاً (UI-08). */
  async getById(id: string, userId: string): Promise<NotificationDto> {
    const record = await this.notifications.findForUser(id, userId);
    if (record === null) {
      throw new ResourceNotFoundError('notification', id, ARABIC_NOTIFICATION);
    }
    return toNotificationDto(record);
  }
}

/**
 * خدمة التذكيرات (Phase 21 · §21).
 *
 * **بلا `status` في الإدخال أو الإخراج الموجَّه**: قيم الحالة غير محسومة
 * في الخطة (TBD)، والخدمة تنقل ما خزّنته القاعدة فقط. و`processed_at` لا
 * يُعرض أصلاً — هو حاجز تقني (§19).
 *
 * **`relatedKind` يُتحقق منه شكلاً فقط**: القيد `REMINDER_RELATED_KINDS`
 * يمنع قيمةً لا مسار لها، **ولا يفحص وجود المرتبط** — لأن `related_id`
 * بلا FK بنصّ 0004، والخطة لم تحسم أهداف التذكير (§7.14). فاختراع تحقق
 * كان سيضيف قاعدة «يجب أن يوجد المرتبط» لم تنصّ عليها الخطة.
 */
export class ReminderApiService {
  constructor(private readonly reminders: ReminderRepository) {}

  async list(filter: { enabled?: boolean } = {}): Promise<ReminderDto[]> {
    const records = await this.reminders.list(filter);
    return records.map(toReminderDto);
  }

  /** إنشاء تذكير — `enabled` يُفترض `true` (§21 «التذكير اختياري»). */
  async create(dto: CreateReminderDto): Promise<ReminderDto> {
    const record = await this.reminders.create({
      enabled: dto.enabled ?? true,
      remindOn: dto.remindOn,
      remindAt: dto.remindAt,
      note: dto.note,
      ...(dto.relatedKind !== undefined && { relatedKind: dto.relatedKind }),
      ...(dto.relatedId !== undefined && { relatedId: dto.relatedId }),
    });
    return toReminderDto(record);
  }

  async getById(id: string): Promise<ReminderDto> {
    return toReminderDto(await this.requireReminder(id));
  }

  /** تعديل جزئي — 404 عند غياب التذكير (حجب وجود، §12). */
  async update(id: string, dto: UpdateReminderDto): Promise<ReminderDto> {
    const record = await this.reminders.update(id, dto);
    if (record === null) {
      throw new ResourceNotFoundError('reminder', id, ARABIC_REMINDER);
    }
    return toReminderDto(record);
  }

  /**
   * تفعيل/تعطيل تذكير — العملية الوحيدة التي يخوّلها نصّ §21 صراحةً
   * («يحفظ: enabled»)، وهي المسار الذي تعتمد عليه الواجهة لاحقاً.
   */
  async setEnabled(id: string, enabled: boolean): Promise<ReminderDto> {
    return this.update(id, { enabled });
  }

  /** سجل التذكير أو 404 — موضع واحد لكل عمليات القراءة والتعديل. */
  private async requireReminder(id: string): Promise<ReminderRecord> {
    const record = await this.reminders.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('reminder', id, ARABIC_REMINDER);
    }
    return record;
  }
}