/**
 * notificationEvents — إنشاء الإشعارات من أحداث النظام (Phase 21 · §20 · §37).
 *
 * **هذا موضع «منطق الإنشاء» الوحيد.** كل مسار آخر يستدعي دوال هذا الملف
 * ولا يكتب `INSERT` في `notifications` بنفسه (وإلا لانتشر منطق الإشعار
 * في كل controller).
 *
 * ── القاعدة الحاكمة: لا إشعار بلا حدث مُسند ──────────────────────────
 * الإشعار يُنشأ **عند حدث** لا عند كتابة تقنية. فالدوال هنا ليست «أي
 * تغيير ⇒ إشعار»، بل قائمة أحداث مغلقة لكلٍّ منها سند نصي:
 *
 * | الحدث | النوع | السند |
 * |---|---|---|
 * | إتاحة كتاب لمنتسب | `book_available` | §9.3 «عند الإتاحة … ينش��ع إشعار داخلي إذا كان الحدث جديدًا» |
 * | كتاب وارد عام | `new_broadcast` | §9.1 إعمام عام + §20 «كتاب إعمام جديد» |
 * | إرسال طلب | `new_request` | §18 «المنتسب يرسل الطلب» + §20 «طلب جديد للجهة التي يجب أن تتابعه» |
 * | قرار على طلب | `request_update` | §18 «موافقة / رفض / طلب توضيح» + §20 «تحديث طلب» |
 * | تذكير مستحق | `due_reminder` | §21 «التنفيذ عبر Scheduled Jobs» + §20 |
 * | **تغيّر مهم** | `important_change` | **بلا مُولِّد** — TBD (§4) |
 *
 * **لماذا لا مُولِّد لـ`important_change`**: §20 تذكره كاستخدام أساسي، لكن
 * نصّ الخطة **لا يعرّف ما الذي يجعل التغيّر «مهماً»** ولا لمن يُرسَل ولا
 * بأي صلاحية يوجب الإشعار. فأي شرط نضعه اختيارٌ نحن لا الخطة. النوع
 * محفوظ ومقبول في قيد CHECK وفي الـAPI، لكنه لا يُنشأ حتى تُحسم القاعدة.
 * وهذا الفرق بين «نوع معتمد» و«نوع مستخدَم».
 *
 * **ولا إشعار لكل UPDATE**: تعديل كتاب أو طلب لا يُنشئ إشعاراً إلا في
 * الحالة المحددة أعلاه (إتاحة · إشعار عام · قرار طلب). عدا ذلك فالتعديل
 * تقني ولا يولّد حدثاً (§4).
 *
 * ── حارس الاستيراد التاريخي (§37) ─────────────────────────────────────
 * `historicalImport` (= `transactions.imported_at` القائم، المكافئ المعتمد
 * في `PHASE_20_REPORT.md`) يمرّ صريحاً إلى كل دالة، وهي **لا تكتب شيئاً
 * عند true**. الحارس **قبل** الكتابة لا بعدها: لا «نُنشئ ثم نُخفي»، ولا
 * «نُنشئ مئات الصفوف ثم نحذفها» (§18).
 */
import type {
  NotificationKind,
  NotificationPayload,
} from '../../../src/core/models/notification';
import type {
  CreateNotificationInput,
  NotificationRecord,
} from '../repositories/contracts';
import type { Db } from '../repositories/shared';
import { TechnicalLogger } from '../logging';

/** نتيجة محاولة إنشاء إشعار واحد. */
export interface NotificationEmissionResult {
  /** صف الإشعار المنشأ، أو `null` إن لم يُنشأ. */
  notification: NotificationRecord | null;
  /**
   * سبب عدم الإنشاء: حارس تاريخي، أو لا حساب يستقبل الإشعار. سببان لا
   * ثالث — لا «خطأ»: التخطي قرار نظامي يُسجَّل تقنياً ولا يُخترع له كود خطأ.
   */
  skippedBecause?: 'historical' | 'no-recipient';
}

/** حساب مستخدم مُبلَّغ — `(id, role)` كما يُقرآن من `users`. */
interface UserAccount {
  id: string;
  role: string;
}
/**
 * مُحرّك إنشاء الإشعارات.
 *
 * `db` نفس الاتصال الذي بُنيت عليه بقية المستودعات (نمط Phase 10)، وحلّ
 * المستلمين بـSQL على `users` لا بقراءة كل الحسابات وفلترتها في الذاكرة.
 *
 * ── حلّ المستلم (recipient resolution) ────────────────────────────────
 * `notifications.user_id` إلزامي، فكل حدث يحتاج مستخدماً حقيقياً. الحلّ
 * **من العلاقات القائمة في القاعدة**، لا بقاعدة مخترعة:
 *
 * - **إتاحة كتاب** → حساب المنتسب المُتاحة (`users.employee_id`): نصّ
 *   §9.3 حرفياً «عند الإتاحة … ينشأ إشعار داخلي» لمن أُتيحت له، فالمستلم
 *   محدَّد نصاً.
 * - **طلب جديد** → حسابات **المدير**: §20 «طلب جديد **للجهة التي يجب أن
 *   تتابعه**» و§18 «المدير يراجعه» ⇒ الجهة المتابعة هي المدير. استنتاج
 *   مباشر من سير نصّي، لا قاعدة جديدة.
 * - **تحديث طلب** → حساب **صاحب الطلب** (`users.employee_id` من
 *   `requests.employee_id`): هو من ينتظر قرار المدير على طلبه.
 * - **إعمام جديد** → كل حسابات دور `employee`، لأن §9.1 «كل المنتسبين
 *   يرونه تلقائيًا ما دام نطاق الرؤية عامًا للمنتسبين» فالجمهور محدَّد
 *   نصاً. ولا يُضمّ `admin`/`director`: §9.1 لا يعدّهما من متلقّي الإعمام،
 *   وتوسيع الجمهور بلا سند اختراع أيضاً.
 *
 * **حساب غير موجود أو غير نشط ⇒ لا إشعار**: لا صفّ لمن لا يملك حساباً،
 * ولا صفّ لمجمَّد أو محظور (لا يستطيع الدخول أصلاً، §11.3).
 */
export class NotificationEventService {
  constructor(private readonly db: Db) {}

  /**
   * إشعار «كتاب متاح لك» (§9.3).
   *
   * `employeeIds` المنتسبون الذين أُتيحت لهم الكتاب **فعلاً** (الصفوف
   * المنشأة في `grant` الآن) — فمن كانت له إتاحة سارية لم يُنشأ له صف،
   * فلا يُنشأ له إشعار مرتين.
   */
  async emitBookAvailable(
    transactionId: string,
    transactionSummary: string,
    employeeIds: readonly string[],
    historicalImport = false,
  ): Promise<NotificationEmissionResult[]> {
    if (historicalImport) {
      return this.skipAll(employeeIds.length, 'historical');
    }
    const recipients = await this.accountsByEmployeeIds(employeeIds);
    return this.emitToEach(recipients, () => ({
      kind: 'book_available' as NotificationKind,
      payload: {
        resourceKind: 'transaction' as const,
        resourceId: transactionId,
        summary: transactionSummary,
      },
    }));
  }

  /**
   * إشعار «إعمام جديد» (§9.1 + §20) إلى كل حسابات دور `employee`.
   *
   * لا يُضمّ `admin` ولا `director`: §9.1 لا يعدّهما من متلقّي الإعمام.
   */
  async emitNewBroadcast(
    transactionId: string,
    transactionSummary: string,
    historicalImport = false,
  ): Promise<NotificationEmissionResult[]> {
    if (historicalImport) {
      return this.skipAll(1, 'historical');
    }
    const recipients = await this.accountsByRole('employee');
    return this.emitToEach(recipients, () => ({
      kind: 'new_broadcast' as NotificationKind,
      payload: {
        resourceKind: 'transaction' as const,
        resourceId: transactionId,
        summary: transactionSummary,
      },
    }));
  }

  /**
   * إشعار «طلب جديد» — إلى **الجهة التي يجب أن تتابعه** (§20)، وهي
   * المدير في سير نصّي (§18 «المدير يراجعه» · §10.2).
   */
  async emitNewRequest(
    requestId: string,
    requestSummary: string,
    historicalImport = false,
  ): Promise<NotificationEmissionResult[]> {
    if (historicalImport) {
      return this.skipAll(1, 'historical');
    }
    const recipients = await this.accountsByRole('director');
    return this.emitToEach(recipients, () => ({
      kind: 'new_request' as NotificationKind,
      payload: {
        resourceKind: 'request' as const,
        resourceId: requestId,
        summary: requestSummary,
      },
    }));
  }

  /**
   * إشعار «تحديث طلب» — إلى **صاحب الطلب** (§20 + §18: القرار يصبّ في
   * طلبه هو). `ownerEmployeeId` من `requests.employee_id` مباشرةً، فالمستلم
   * محدَّد بعلاقة قائمة لا بقاعدة مخترعة.
   */
  async emitRequestUpdate(
    requestId: string,
    requestSummary: string,
    ownerEmployeeId: string,
    historicalImport = false,
  ): Promise<NotificationEmissionResult[]> {
    if (historicalImport) {
      return this.skipAll(1, 'historical');
    }
    const recipients = await this.accountsByEmployeeIds([ownerEmployeeId]);
    return this.emitToEach(recipients, () => ({
      kind: 'request_update' as NotificationKind,
      payload: {
        resourceKind: 'request' as const,
        resourceId: requestId,
        summary: requestSummary,
      },
    }));
  }

  /**
   * إشعار «تذكير مستحق» (§20 + §21) — إلى **مستلِم حتمي**.
   *
   * `recipientUserId` يجب أن يكون قد اشتُق **قبل** النداء من علاقة قائمة
   * (انظر `jobs/reminderDispatcher.ts`). إن كان `undefined` ⇒ لا إشعار ولا
   * صفّ: المستلِم غير محسوم، وهذا TBD (§5) لا `user_id` افتراضي ولا
   * «المدير».
   *
   * ولا يُكتب `processed_at` هنا — مسؤولية الـdispatcher **بعد** نجاح
   * الإشعار، فلا يُحرق تذكير بسبب نقص قاعدة.
   */
  async emitDueReminder(
    recipientUserId: string | undefined,
    reminderId: string,
    reminderSummary: string,
    related?: { kind: string; id: string },
  ): Promise<NotificationEmissionResult> {
    if (recipientUserId === undefined) {
      return this.skipOne('no-recipient');
    }
    const payload: NotificationPayload = {
      resourceKind: 'reminder',
      resourceId: reminderId,
      summary: reminderSummary,
      ...(related !== undefined && { relatedResource: related }),
    };
    const notification = await this.insert({
      userId: recipientUserId,
      kind: 'due_reminder',
      payload,
    });
    return { notification };
  }

  // ── إنشاء مشترك ──────────────────────────────────────────────────────

  /** ينشئ صفاً واحداً في `notifications` — **نقطة INSERT الوحيدة**. */
  private async insert(input: CreateNotificationInput): Promise<NotificationRecord> {
    const result = await this.db.query<NotificationRecord>(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, $2, $3)
       RETURNING id, user_id AS "userId", kind, payload,
                 is_new AS "isNew", created_at AS "createdAt", read_at AS "readAt"`,
      [input.userId, input.kind, JSON.stringify(input.payload ?? {})],
    );
    return result.rows[0];
  }

  /** يمرّر نفس الحدث على قائمة مستلمين، ويعيد نتيجة لكل واحد. */
  private async emitToEach(
    recipients: readonly UserAccount[],
    build: () => Omit<CreateNotificationInput, 'userId'>,
  ): Promise<NotificationEmissionResult[]> {
    if (recipients.length === 0) {
      return [this.skipOne('no-recipient')];
    }
    const results: NotificationEmissionResult[] = [];
    for (const account of recipients) {
      results.push({ notification: await this.insert({ userId: account.id, ...build() }) });
    }
    return results;
  }

  /** نتيجة تخطٍّ واحدة مع تسجيل تقني — الفشل يُسجَّل ولا يُخفى. */
  private skipOne(reason: 'historical' | 'no-recipient'): NotificationEmissionResult {
    TechnicalLogger.info('notification skipped', {
      source: 'notifications',
      data: { reason },
    });
    return { notification: null, skippedBecause: reason };
  }

  /** نفس `skipOne` بعددٍ يساوي حجم الجمهور المتوقّع. */
  private skipAll(
    count: number,
    reason: 'historical' | 'no-recipient',
  ): NotificationEmissionResult[] {
    const results: NotificationEmissionResult[] = [];
    for (let index = 0; index < Math.max(count, 1); index += 1) {
      results.push(this.skipOne(reason));
    }
    return results;
  }

  // ── حلّ المستلمين: SQL على `users` لا فلترة في الذاكرة ─────────────────

  /**
   * حسابات مرتبطة بمنتسبين بعينهم (`users.employee_id` — العلاقة القائمة
   * الوحيدة بين الحساب والمنتسب، ترحيل 0001). والحساب المجمَّد أو المحظور
   * **مستبعَد**: حساب لا يستطيع الدخول لا يصله إشعار.
   */
  private async accountsByEmployeeIds(employeeIds: readonly string[]): Promise<UserAccount[]> {
    if (employeeIds.length === 0) {
      return [];
    }
    const result = await this.db.query<UserAccount>(
      `SELECT id, role FROM users
        WHERE employee_id = ANY($1::uuid[]) AND status = 'active'
        ORDER BY id`,
      [[...employeeIds]],
    );
    return result.rows;
  }

  /** حسابات نشطة بدور معيّن — لجمهور «كل المنتسبين» و«الجهة المتابعة». */
  private async accountsByRole(role: string): Promise<UserAccount[]> {
    const result = await this.db.query<UserAccount>(
      `SELECT id, role FROM users WHERE role = $1 AND status = 'active' ORDER BY id`,
      [role],
    );
    return result.rows;
  }
}