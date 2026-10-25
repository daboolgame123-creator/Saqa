/**
 * reminderDispatcher — تنفيذ التذكيرات المستحقة (Phase 21 · §21 · §37).
 *
 * **أبنية Phase 8 كما هي، بلا جدولة جديدة**: يعرّف `ScheduledJobDefinition`
 * ويسجَّل نفسه في `JobRegistry`، ويتولى `JobRunner` المؤقت ومنع التراكب
 * وتسجيل النتائج. لا Redis ولا طابور ولا مُجدول ثانٍ (§57 بند 7).
 *
 * ── مسار التنفيذ الواحد ───────────────────────────────────────────────
 *   1. `listDuePending` — استعلام واحد: مفعَّل ∧ لم يُعالج ∧ (تاريخ, وقت)
 *      ≤ الآن. المعطَّل والمستقبلي **لا يُقرأان أصلاً** (ليسا محمَّلين ثم
 *      مُستبعَدين — التصفية في SQL).
 *   2. **حلّ المستلم** من المورد المرتبط (انظر أدناه).
 *   3. في **معاملة واحدة**: `markProcessed` (مشروط) + إنشاء الإشعار.
 *   4. الفشل يُسجَّل **لكل تذكير على حدة** ولا يوقف الباقي ولا يُسقط
 *      الوظيفة (`JobRunner` يمسك الخطأ أصلاً).
 *
 * ── المستلم: قاعدة قائمة أم TBD؟ (Decision Point) ──────────────────────
 * `notifications.user_id` إلزامي، والتذكير في §21 **بلا مالك**. فالمستلم
 * يُشتق من **المورد المرتبط فقط**، لا من مالك مُختلَق:
 *
 * - `related_kind = 'request'` ⇒ صاحبه هو `requests.employee_id`، ومن
 *   حسابه (`users.employee_id`) يأتي `user_id`. **قائمة:** علاقة موجودة
 *   في القاعدة، والمستَلَم صحيح نصياً (الطلب طلبه، §18).
 * - `related_kind = 'transaction'` ⇒ الكتاب ليس له مالك واحد (له رابط
 *   بعدة منتسبين، Phase 5)، فاختيار واحد منهم **قاعدة أعمال لم تحسمها
 *   الخطة** ⇒ **TBD**.
 * - بلا ربط، أو بنوع غير معروف ⇒ **TBD**.
 *
 * في الحالات TBD: **لا يُنشأ إشعار ولا تُكتب `processed_at`**، فيبقى
 * التذكير مستحقاً بانتظار قرارٍ بشري. ولا «حلول» بديلة مرفوضة صراحةً:
 * لا إرسال للمدير (تلقّي الطلب وارد في نصّ §18، لكن نصّ §21 لا يقرّر
 * أن كل تذكير يُرسل إليه)، ولا إرسال لكل المنتسبين (اختراع)، ولا
 * `user_id` افتراضي.
 *
 * ── لماذا `processed_at` كحاجز تكرار (وليس كقاعدة أعمال) ───────────────
 * §19 يفصل «تقليل duplicate processing التقني» عن «قاعدة تفرّد الإشعار».
 * `markProcessed` **مشروط بـ`processed_at IS NULL` داخل `UPDATE`**، فهو
 * يمنح المتزامنَ الثاني صفاً فارغاً ⇒ لا إشعار ثانٍ. هذا حدّه الأدنى.
 * وهو **لا** يفرض «إشعاراً واحداً إلى الأبد»: إعادة جدولة التذكير أو فكّ
 * العلامة يُعيده للانتظار (قاعدة كهذه غير مثبتة في الخطة ⇒ TBD).
 *
 * ── الذرّية ────────────────────────────────────────────────────────────
 * «علامة معالجة بلا إشعار» و«إشعار بلا علامة معالجة» حالتان سيئتان
 * كلتاهما: الأولى تحرق التذكير صامتاً، والثانية تُنتج إشعاراً في كل
 * تشغيل. لذلكgehما في `withTransaction` واحدة. و`JobRunner` يمنع التراكب
 * على مستوى العملية، و`markProcessed` المشروط يمنع التكرار عبر عمليتين.
 */
import type { Pool } from 'pg';
import { localDateOnly } from '../database/dateTime';
import { withTransaction } from '../database/pool';
import { TechnicalLogger } from '../logging';
import type { JobContext, ScheduledJobDefinition } from './jobTypes';
import { JobRegistry } from './jobRegistry';
import { PgNotificationRepository } from '../repositories/notificationRepository';
import { PgReminderRepository } from '../repositories/reminderRepository';
import type { ReminderRecord } from '../repositories/contracts';
import { NotificationEventService } from '../services/notificationEvents';

/**
 * الفاصل بين تشغيلات الوظيفة.
 *
 * **قرار تقني لا قاعدة أعمال**: الخطة لم تحدّد تكراراً (§21 «التنفيذ عبر
 * Scheduled Jobs» بلا رقم)، والقيمة دقيقة واحدة فسنتائجُ التذكيرات
 * المتقاربة تُلتقط في نافذة معقولة دون انتظار ساعة. تغيّرها later قرار
 * تشغيلي لا يمسّCorrectness (§33) لأن الاستحقاق مفهرسPairs ومقارَن.
 */
export const REMINDER_DISPATCH_INTERVAL_MS = 60_000;

/** اسم الوظيفة — تقني، يُستخدم في السجلات. */
export const REMINDER_DISPATCH_JOB_NAME = 'reminder-dispatcher';

/** ملخّص تشغيل واحد — للتشخيص ولاختبارات الجدولة. */
export interface ReminderDispatchSummary {
  /** عدد التذكيرات المستحقة التي رآها الاستعلام. */
  due: number;
  /** عدد الإشعارات المنشأة فعلاً. */
  notified: number;
  /** عدد التذكيرات التي استُثنيت لأن مستلمها TBD (§5). */
  skippedUnknownRecipient: number;
  /** أخطاء لكل تذكير — الفشل لا يُخفى ولا يوقف الباقي. */
  failures: { reminderId: string; error: string }[];
}

/** الوقت المحلي للمنشأة بصيغة `HH:mm` (نفس `localDateOnly` للتاريخ). */
function localTimeOfDay(now: Date): string {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * يقرأ حساب صاحب الطلب من `requests.employee_id` ثم `users.employee_id`.
 *
 * كلا الاستعلامين من علاقات قائمة فعلاً؛ فلا يُخترع مالك، ولا يُرسل
 * الإشعار إلى «المدير» لمجرد أنه الأقدر (§5 TBD).
 */
async function resolveRequestOwnerUser(
  pool: Pool,
  requestId: string,
): Promise<string | undefined> {
  const result = await pool.query<{ userId: string | null }>(
    `SELECT u.id AS "userId"
       FROM requests r
       LEFT JOIN users u ON u.employee_id = r.employee_id AND u.status = 'active'
      WHERE r.id = $1`,
    [requestId],
  );
  return result.rows[0]?.userId ?? undefined;
}

/**
 * يحلّ مستلم `due_reminder` من المورد المرتبط — أو `undefined` إن كان
 * المستلِم **TBD** (كتاب، أو بلا ربط، أو نوع غير معروف).
 *
 * الدالة **لا ترمي** ولا تختلق قيمة: `undefined` تعني «لا قاعدة» وهي
 * نتيجة مشروعة موثّقة، لا خطأ (§5 · §28: TBD ليس إذناً للاجتهاد).
 */
async function resolveDueRecipient(
  pool: Pool,
  reminder: ReminderRecord,
): Promise<string | undefined> {
  if (reminder.relatedKind === 'request' && reminder.relatedId !== undefined) {
    return resolveRequestOwnerUser(pool, reminder.relatedId);
  }
  return undefined;
}

/**
 * تشغيل واحد للتوزيع.
 *
 * معلن كدالة مستقلة (لا كإغلاق داخل `run`) ليبقى **قابلاً للاختبار مباشرة**
 * بلا مؤقتات، مع بقاء `run` غلافاً رقيقاً يمرّر له `context`.
 */
export async function dispatchDueReminders(
  pool: Pool,
  now: Date = new Date(),
): Promise<ReminderDispatchSummary> {
  const due = await new PgReminderRepository(pool).listDuePending({
    date: localDateOnly(now),
    time: localTimeOfDay(now),
  });

  const summary: ReminderDispatchSummary = {
    due: due.length,
    notified: 0,
    skippedUnknownRecipient: 0,
    failures: [],
  };

  for (const reminder of due) {
    // الخطأ يُعزل لكل تذكير: فشل واحد لا يُسقط الباقي ولا الوظيفة.
    try {
      const recipient = await resolveDueRecipient(pool, reminder);
      if (recipient === undefined) {
        // لا مستلِم حتمي ⇒ لا إشعار **ولا** `processed_at`: التذكير يبقى
        // مستحقاً بانتظار قرار بشري، فلا يُحرق ولا يُعلَم بأنه «عولج».
        summary.skippedUnknownRecipient += 1;
        TechnicalLogger.info('reminder due but recipient is unresolved', {
          source: 'jobs',
          data: {
            reminderId: reminder.id,
            relatedKind: reminder.relatedKind ?? null,
            reason: 'recipient-tbd',
          },
        });
        continue;
      }

      // الذرّية: العلامة والإشعار في معاملة واحدة. و`markProcessed` مشروط
      // بـ`processed_at IS NULL` ⇒ المتزامن لا ينال صفاً فلا إشعار ثانٍ.
      await withTransaction(pool, async (client) => {
        const claimed = await new PgReminderRepository(client).markProcessed(
          reminder.id,
          now.toISOString(),
        );
        if (claimed === null) {
          return;
        }
        const related =
          reminder.relatedKind !== undefined && reminder.relatedId !== undefined
            ? { kind: reminder.relatedKind, id: reminder.relatedId }
            : undefined;
        const emission = await new NotificationEventService(client).emitDueReminder(
          recipient,
          reminder.id,
          reminder.note,
          ...(related !== undefined ? [related] : []),
        );
        if (emission.notification !== null) {
          summary.notified += 1;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failures.push({ reminderId: reminder.id, error: message });
      TechnicalLogger.error('reminder dispatch failed', {
        source: 'jobs',
        data: {
          reminderId: reminder.id,
          error: message,
          attemptedAt: now.toISOString(),
        },
      });
    }
  }

  // الفشل لا يُبتلع ولا يُنسب إلى نجاح: `JobRunner` يسجّل النتيجة، وهذا
  // السجل يحفظ أي تذكير فشل ومتى — فلا «نجاح كاذب» (§20).
  return summary;
}

/**
 * يوفّر الـPool عند التنفيذ.
 *
 * **دالة لا Pool**: `getSharedPool()` كـ`() => Pool` حتى لا يفتح الاتصال
 * عند الإقلاع ولا في تسجيل الوظيفة — بل عند أول تشغيل فعلي. والاختبارات
 * تمرّر `() => pool` لعنقود الاختبار المعزول بلا `DATABASE_URL` إطلاقاً
 * (نفس نمط `useApiServices` في Phase 10).
 */
export type PoolProvider = () => Pool;

/**
 * يبني تعريف الوظيفة المجدولة — نفس شكل `ScheduledJobDefinition` في
 * Phase 8، بلا أي حقل جديد ولا جدولة موازية.
 */
export function createReminderDispatchJob(resolvePool: PoolProvider): ScheduledJobDefinition {
  return {
    name: REMINDER_DISPATCH_JOB_NAME,
    intervalMs: REMINDER_DISPATCH_INTERVAL_MS,
    run: async (_context: JobContext): Promise<void> => {
      await dispatchDueReminders(resolvePool());
    },
  };
}

/**
 * يسجّل الوظيفة في `JobRegistry` — يُستدعى من `server.ts` عند الإقلاع.
 *
 * `JobRegistry.register` يرفض التكرار بالاسم، فيُحذف المسجَّل قبل التسجيل
 * ليصلح استدعاء متكرر (إعادة تشغيل في الاختبار مثلاً) بلا رمي.
 */
export function registerReminderDispatchJob(resolvePool: PoolProvider): void {
  if (JobRegistry.has(REMINDER_DISPATCH_JOB_NAME)) {
    JobRegistry.unregister(REMINDER_DISPATCH_JOB_NAME);
  }
  JobRegistry.register(createReminderDispatchJob(resolvePool));
}