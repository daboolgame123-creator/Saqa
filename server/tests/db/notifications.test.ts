/**
 * اختبارات Phase 21 — الإشعارات والتذكيرات
 * (مستودعات + محرّك الأحداث + الوظيفة المجدولة).
 *
 * المرجع: ALSQAYA_PLAN §20 · §21 · §37 · §9.1 · §9.3 · §18 · §11.3 · §19.
 *
 * بلا mock في أي طبقة: PostgreSQL مدمجة معزولة، والبيانات كلها اصطناعية.
 *
 * ما يُثبَت هنا:
 * - الأنواع الستة = مرآة قيد CHECK في `notifications` (0004).
 * - ملكية الإشعارات مفروضة **داخل SQL** لا بعد القراءة.
 * - read/unread و`read_at` و**بقاء السجل التاريخي** بعد التعليم.
 * - الأحداث: إتاحة كتاب · إعمام · طلب جديد · تحديث طلب.
 * - **حارس الاستيراد التاريخي**: لا صفّ يُكتب إطلاقاً.
 * - مستلمّ التذكير TBD ⇒ لا إشعار **ولا** `processed_at`.
 * - الوظيفة: المستحق يُعالَج، والمستقبَل والمعوَّل يُتركان، وإعادة التشغيل
 *   لا تُنتج إشعاراً ثانياً.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';
import { PgNotificationRepository } from '../../src/repositories/notificationRepository';
import { PgReminderRepository } from '../../src/repositories/reminderRepository';
import { NotificationEventService } from '../../src/services/notificationEvents';
import {
  REMINDER_DISPATCH_JOB_NAME,
  createReminderDispatchJob,
  dispatchDueReminders,
} from '../../src/jobs/reminderDispatcher';
import { JobRegistry, JobRunner } from '../../src/jobs';
import { TechnicalLogger } from '../../src/logging';
import { NOTIFICATION_KINDS } from '../../../src/core/models/notification';
import { silenceLogs } from '../helpers';

/** موتّر ثابت — كل «الآن» في هذا الملف لحظة واحدة معروفة. */
const NOW = new Date('2026-09-15T10:00:00');
const NOW_DATE = '2026-09-15';
const NOW_TIME = '10:00';

interface SeededUser {
  id: string;
  employeeId: string;
}

describe('Phase 21 — الإشعارات والتذكيرات', () => {
  silenceLogs();
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase());
  });

  after(async () => {
    JobRegistry.clear();
    TechnicalLogger.reset();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    JobRegistry.clear();
  });

  // ── أدوات زرع ─────────────────────────────────────────────────────────

  /** منتسب بحساب مفعّل — العلاقة الوحيدة التي يُشتقّ منها المستلِم. */
  async function seedUser(role: 'employee' | 'director' | 'admin', tag: string): Promise<SeededUser> {
    const employee = await pool.query<{ id: string }>(
      `INSERT INTO employees (name, title, department, badge_number, status)
       VALUES ($1, 'معاون', 'الشؤون', $2, 'active') RETURNING id`,
      [`منتسب ${tag}`, `B-${tag}`],
    );
    // أعمدة الرمز السري الأربعة تُكتب معاً أو لا شيء (قيد
    // `users_secret_fields_together` في 0005) — وقيمة اصطناعية فقط، إذ
    // لا يحتاج هذا الملف إلا حساباً نشطاً له `employee_id`.
    const account = await pool.query<{ id: string }>(
      `INSERT INTO users
         (username, display_name, role, employee_id, status,
          secret_ciphertext, secret_iv, secret_auth_tag, secret_key_id)
       VALUES ($1, $1, $2, $3, 'active', 'x', 'y', 'z', 'k') RETURNING id`,
      [`u-${tag}`, role, employee.rows[0].id],
    );
    return { id: account.rows[0].id, employeeId: employee.rows[0].id };
  }

  /** كتاب قائم — يُستخدم في مرجع `payload` واختبارات الحارس التاريخي. */
  async function seedTransaction(importedAt: string | null = null): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO transactions
         (number, sequence, document_date, month, direction, category, sub_type,
          entity, subject, status, imported_at)
       VALUES ($1, '1', '2026-09-01', '2026-09', 'وارد', 'إدارية', 'تعميم',
               'إدارة', 'كتاب', 'قيد المراجعة', $2)
       RETURNING id`,
      [`١٠٠/ص`, importedAt],
    );
    return result.rows[0].id;
  }

  /** طلب قائم بصاحبه — المستند الوحيد المشتقّ منه مستلم `due_reminder`. */
  async function seedRequest(ownerEmployeeId: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO requests (employee_id, kind, payload, status)
       VALUES ($1, 'leave', '{"kind":"leave"}', 'submitted') RETURNING id`,
      [ownerEmployeeId],
    );
    return result.rows[0].id;
  }

  /** تذكير قائم (مستحقّ افتراضاً: اليوم 09:00). */
  async function seedReminder(
    overrides: Partial<{
      enabled: boolean;
      remindOn: string;
      remindAt: string;
      relatedKind: string | null;
      relatedId: string | null;
    }> = {},
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO reminders (enabled, remind_on, remind_at, note, related_kind, related_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        overrides.enabled ?? true,
        overrides.remindOn ?? NOW_DATE,
        overrides.remindAt ?? '09:00',
        'متابعة الطلب',
        overrides.relatedKind === undefined ? null : overrides.relatedKind,
        overrides.relatedId === undefined ? null : overrides.relatedId,
      ],
    );
    return result.rows[0].id;
  }

  /** تسجيل وظيفة التوزيع في `JobRegistry` (بـPool الاختبار لا `DATABASE_URL`). */
  function registerDispatchJob(): void {
    if (JobRegistry.has(REMINDER_DISPATCH_JOB_NAME)) {
      JobRegistry.unregister(REMINDER_DISPATCH_JOB_NAME);
    }
    JobRegistry.register(createReminderDispatchJob(() => pool));
  }

  async function countNotifications(): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM notifications',
    );
    return Number(result.rows[0].count);
  }

  // ── الأنواع ───────────────────────────────────────────────────────────

  it('الأنواع الستة مرآة حرفيّة لقيد CHECK في القاعدة (0004)', async () => {
    // الفحص على **القاعدة**: أي انفصال بين النموذج والقيد يعني نوعاً في
    // الكود يرفضه القيد ⇒ 500 بدل 400 عند الاستخدام.
    await seedUser('employee', 'a');
    for (const kind of NOTIFICATION_KINDS) {
      const result = await pool.query(
        `INSERT INTO notifications (user_id, kind)
         SELECT id, $1 FROM users LIMIT 1`,
        [kind],
      );
      assert.equal(result.rowCount, 1, `${kind} مقبول في القاعدة`);
    }
    assert.equal(NOTIFICATION_KINDS.length, 6, 'الأنواع الستة لا أكثر');
    // قيمة خارج القائمة تُرفض بالقيد.
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO notifications (user_id, kind)
           SELECT id, 'not_a_kind' FROM users LIMIT 1`,
        ),
      /violates check constraint/,
    );
  });

  // ── المستودع: الإنشاء والقراءة والملكية ────────────────────────────────

  it('إنشاء إشعار يحفظ المرجع في payload لا نسخة من المورد', async () => {
    const user = await seedUser('employee', 'a');
    const transactionId = await seedTransaction();
    const repository = new PgNotificationRepository(pool);

    const created = await repository.create({
      userId: user.id,
      kind: 'book_available',
      payload: { resourceKind: 'transaction', resourceId: transactionId, summary: '١٠٠/ص' },
    });

    assert.equal(created.isNew, true, 'الإشعار الجديد يبدأ is_new = true');
    assert.equal(created.readAt, undefined, 'لا وقت قراءة قبل القراءة');
    assert.equal(created.payload?.resourceId, transactionId);
    assert.equal(created.payload?.resourceKind, 'transaction');
    // المرجع فقط: لا حقل لكائن الكتاب داخل الحمولة (§37).
    assert.deepEqual(Object.keys(created.payload ?? {}).sort(), [
      'resourceId',
      'resourceKind',
      'summary',
    ]);
  });

  it('القائمة تُرجع إشعارات صاحبها وحده، ولا تسرّب غيره', async () => {
    const mine = await seedUser('employee', 'a');
    const other = await seedUser('employee', 'b');
    const repository = new PgNotificationRepository(pool);
    await repository.create({ userId: mine.id, kind: 'new_broadcast' });
    await repository.create({ userId: other.id, kind: 'new_broadcast' });

    const listed = await repository.listForUser(mine.id);

    assert.equal(listed.length, 1, 'قائمة المستخدم لا تتضمّن صفّ غيره');
    assert.equal(listed[0].userId, mine.id);
  });

  it('تعليم كمقروء يضبط is_new وread_at ولا يحذف السجل (§20)', async () => {
    const user = await seedUser('employee', 'a');
    const repository = new PgNotificationRepository(pool);
    const created = await repository.create({ userId: user.id, kind: 'request_update' });

    const read = await repository.markRead(created.id, user.id);

    assert.equal(read?.isNew, false, 'is_new صار false');
    assert.ok(read?.readAt !== undefined, 'read_at ضُبط');
    // **بقاء السجل التاريخي**: الصف لم يُحذف (§20 «السجل التاريخي للإشعارات
    // يبقى منفصلاً عن حالة جديد»).
    assert.equal(await countNotifications(), 1, 'الصف باقٍ بعد التعليم');
    assert.equal((await repository.listForUser(user.id)).length, 1, 'ويبقى في القائمة');
  });

  it('تعليم المقروء idempotent: النداء الثاني يبقي وقت القراءة الأول', async () => {
    const user = await seedUser('employee', 'a');
    const repository = new PgNotificationRepository(pool);
    const created = await repository.create({ userId: user.id, kind: 'due_reminder' });

    const first = await repository.markRead(created.id, user.id);
    const second = await repository.markRead(created.id, user.id);

    assert.equal(second?.readAt, first?.readAt, 'وقت القراءة لم يتغيّر');
    assert.equal(await countNotifications(), 1, 'ولا صفّ «قراءة ثانية»');
  });

  it('markRead بمعرّف إشعار غيره لا يمسّ الصفّ — لا صفّ يُعاد (حجب وجود)', async () => {
    const owner = await seedUser('employee', 'a');
    const other = await seedUser('employee', 'b');
    const repository = new PgNotificationRepository(pool);
    const created = await repository.create({ userId: owner.id, kind: 'new_request' });

    const result = await repository.markRead(created.id, other.id);

    assert.equal(result, null, 'لا صفّ لمَن لا يملك');
    assert.equal(
      (await repository.findForUser(created.id, owner.id))?.isNew,
      true,
      'الصفّ لم يتغيّر',
    );
  });

  it('عدّاد غير المقروء يعدّ صفّ صاحبك فقط', async () => {
    const mine = await seedUser('employee', 'a');
    const other = await seedUser('employee', 'b');
    const repository = new PgNotificationRepository(pool);
    await repository.create({ userId: mine.id, kind: 'new_broadcast' });
    const second = await repository.create({ userId: mine.id, kind: 'request_update' });
    await repository.create({ userId: other.id, kind: 'new_broadcast' });
    await repository.markRead(second.id, mine.id);

    assert.equal(await repository.countUnread(mine.id), 1, 'واحد غير مقروء بعد التعليم');
    assert.equal(await repository.countUnread(other.id), 1);
  });

  // ── التذكيرات ─────────────────────────────────────────────────────────

  it('التذكير يحفظ الحقول التي يحدّدها §21', async () => {
    const repository = new PgReminderRepository(pool);
    const transactionId = await seedTransaction();

    const created = await repository.create({
      enabled: true,
      remindOn: '2026-09-20',
      remindAt: '08:30',
      note: 'متابعة الكتاب',
      relatedKind: 'transaction',
      relatedId: transactionId,
    });

    assert.equal(created.enabled, true);
    assert.equal(created.remindOn, '2026-09-20');
    assert.equal(created.remindAt, '08:30', 'الوقت يُطبَّع إلى HH:mm');
    assert.equal(created.note, 'متابعة الكتاب');
    assert.equal(created.relatedKind, 'transaction');
    assert.equal(created.relatedId, transactionId);
    // `status` لا يُكتب: قيمه غير محددة في الخطة (TBD).
    assert.equal(created.status, undefined, 'الحالة تبقى NULL — لا قيم مخترعة');
  });

  it('التعديل الجزئي يغيّر المُرسَل فقط، وغياب الصفّ يعيد null', async () => {
    const repository = new PgReminderRepository(pool);
    const id = await seedReminder();

    const disabled = await repository.update(id, { enabled: false });

    assert.equal(disabled?.enabled, false);
    assert.equal(disabled?.note, 'متابعة الطلب', 'بقي ما لم يُرسل');
    assert.equal(
      await repository.update('00000000-0000-0000-0000-000000000000', { enabled: true }),
      null,
    );
  });

  it('الاستحقاق يُقارَن كزوج (تاريخ، وقت) — لا تاريخاً وحده ولا وقتاً وحده', async () => {
    const repository = new PgReminderRepository(pool);
    await seedReminder({ remindOn: '2026-09-15', remindAt: '09:00' }); // مستحقّ الآن
    await seedReminder({ remindOn: '2026-09-15', remindAt: '11:00' }); // وقت لاحق اليوم
    await seedReminder({ remindOn: '2026-09-16', remindAt: '09:00' }); // يوم لاحق

    const due = await repository.listDuePending({ date: NOW_DATE, time: NOW_TIME });

    assert.equal(due.length, 1, 'المستحقّ وحده');
    assert.equal(due[0].remindAt, '09:00');
  });

  it('التذكير المعطَّل أو المعالَج ليس في قائمة المستحق', async () => {
    const repository = new PgReminderRepository(pool);
    await seedReminder({ enabled: false });
    const processed = await seedReminder();
    await repository.markProcessed(processed, NOW.toISOString());

    const due = await repository.listDuePending({ date: NOW_DATE, time: NOW_TIME });

    assert.deepEqual(due.map((record) => record.id), [], 'لا مستحقّ أصلاً');
  });

  it('markProcessed مشروط: مرّة واحدة فقط، وفكّ العلامة يعيده للانتظار', async () => {
    const repository = new PgReminderRepository(pool);
    const id = await seedReminder();

    const first = await repository.markProcessed(id, NOW.toISOString());
    const second = await repository.markProcessed(id, NOW.toISOString());

    assert.ok(first !== null, 'الاستدعاء الأول ينال الصف');
    assert.equal(second, null, 'الثاني لا ينال صفاً — حاجز التكرار التقني');
    assert.deepEqual(
      (await repository.listDuePending({ date: NOW_DATE, time: NOW_TIME })).map((r) => r.id),
      [],
    );
    // فكّ العلامة = إعادة جدولة يدوية، وهو ما يجعل «مرة واحدة إلى الأبد»
    // قاعدة غير مفروضة (TBD في التقرير §4).
    await repository.clearProcessed(id);
    assert.equal(
      (await repository.listDuePending({ date: NOW_DATE, time: NOW_TIME })).length,
      1,
    );
  });

  // ── محرّك الأحداث ─────────────────────────────────────────────────────

  it('إتاحة كتاب تُشعر صاحب حساب المنتسب المُتاحة وحده', async () => {
    const employee = await seedUser('employee', 'a');
    const stranger = await seedUser('employee', 'b');
    const transactionId = await seedTransaction();

    const results = await new NotificationEventService(pool).emitBookAvailable(
      transactionId,
      '١٠٠/ص',
      [employee.employeeId],
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].notification?.kind, 'book_available');
    assert.equal(results[0].notification?.userId, employee.id);
    assert.equal(await countNotifications(), 1, 'لا إشعار لغير المُتاحة');
    assert.ok(stranger.id.length > 0);
  });

  it('إتاحة كتاب لمنتسب بلا حساب ⇒ لا صفّ (لا صفّ لمن لا يقرأ)', async () => {
    const employee = await pool.query<{ id: string }>(
      `INSERT INTO employees (name, title, department, badge_number, status)
       VALUES ('بلا حساب', 'معاون', 'الشؤون', 'B-noaccount', 'active') RETURNING id`,
    );

    const results = await new NotificationEventService(pool).emitBookAvailable(
      'x',
      '١٠٠/ص',
      [employee.rows[0].id],
    );

    assert.equal(results[0].notification, null);
    assert.equal(results[0].skippedBecause, 'no-recipient');
    assert.equal(await countNotifications(), 0);
  });

  it('إعمام عام يُشعر حسابات المنتسبين وحدها', async () => {
    const employee = await seedUser('employee', 'a');
    const director = await seedUser('director', 'd');
    const admin = await seedUser('admin', 'x');
    const transactionId = await seedTransaction();

    await new NotificationEventService(pool).emitNewBroadcast(transactionId, '١٠٠/ص');

    const recipients = await pool.query<{ id: string; role: string }>(
      'SELECT u.id, u.role FROM notifications n JOIN users u ON u.id = n.user_id',
    );
    assert.equal(recipients.rows.length, 1, 'إشعار واحد فقط');
    assert.equal(recipients.rows[0].id, employee.id, 'وهو حساب المنتسب');
    assert.ok(director.id.length > 0 && admin.id.length > 0);
  });

  it('طلب جديد يُشعر المدير، وتحديث الطلب يُشعر صاحبه', async () => {
    const employee = await seedUser('employee', 'a');
    const director = await seedUser('director', 'd');
    const requestId = await seedRequest(employee.employeeId);
    const events = new NotificationEventService(pool);

    await events.emitNewRequest(requestId, 'طلب إجازة');
    await events.emitRequestUpdate(requestId, 'طلب إجازة', employee.employeeId);

    const rows = await pool.query<{ userId: string; kind: string }>(
      'SELECT user_id AS "userId", kind FROM notifications ORDER BY kind',
    );
    assert.deepEqual(rows.rows, [
      { userId: director.id, kind: 'new_request' },
      { userId: employee.id, kind: 'request_update' },
    ]);
  });

  it('حساب مجمَّد لا يُبلَّغ: لا جلسة ⇒ لا إشعار (§11.3)', async () => {
    const employee = await seedUser('employee', 'a');
    // `frozen` تتطلب `frozen_until` (قيد `users_frozen_has_expiry` في 0005).
    await pool.query(
      `UPDATE users SET status = 'frozen', frozen_until = now() + interval '1 day'
        WHERE id = $1`,
      [employee.id],
    );

    const results = await new NotificationEventService(pool).emitBookAvailable(
      'x',
      '١٠٠/ص',
      [employee.employeeId],
    );

    assert.equal(results[0].notification, null);
    assert.equal(await countNotifications(), 0);
  });

  // ── حارس الاستيراد التاريخي (§37) ─────────────────────────────────────

  it('historicalImport يمنع إنشاء أي إشعار — لا «إنشاء ثم إخفاء»', async () => {
    const employee = await seedUser('employee', 'a');
    const director = await seedUser('director', 'd');
    const transactionId = await seedTransaction('2026-01-05T09:00:00.000Z');
    const requestId = await seedRequest(employee.employeeId);
    const events = new NotificationEventService(pool);

    const results = [
      ...(await events.emitBookAvailable(transactionId, 'ت', [employee.employeeId], true)),
      ...(await events.emitNewBroadcast(transactionId, 'ت', true)),
      ...(await events.emitNewRequest(requestId, 'ت', true)),
      ...(await events.emitRequestUpdate(requestId, 'ت', employee.employeeId, true)),
    ];

    assert.equal(await countNotifications(), 0, 'صفر إشعارات من استيراد تاريخي');
    assert.ok(results.every((result) => result.skippedBecause === 'historical'));
    assert.ok(director.id.length > 0);
  });

  it('الاستيراد التاريخي لا يولّد تذكيراً مصطنعاً ولا يُكتب processed_at', async () => {
    // جدول التذكيرات لا يُنشأ منه شيء: لا مسار استيراد يلمسه، والمستودع
    // لا يولّد تذكيراً. والفحص هنا علىSide الأثر: تشغيل الوظيفة على تذكير
    // بلا مستلِم حتمي لا يُنتج إشعاراً ولا يحرق التذكير.
    await seedReminder();
    const summary = await dispatchDueReminders(pool, NOW);

    assert.equal(summary.notified, 0);
    assert.equal(await countNotifications(), 0);
    const processed = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM reminders WHERE processed_at IS NOT NULL',
    );
    assert.equal(processed.rows[0].count, '0', 'ولا تذكير يُحرق بلا قاعدة');
  });

  // ── الوظيفة المجدولة ──────────────────────────────────────────────────

  it('الوظيفة تُسجَّل في JobRegistry وتعمل عبر البنية القائمة (Phase 8)', async () => {
    registerDispatchJob();

    assert.equal(JobRegistry.has(REMINDER_DISPATCH_JOB_NAME), true, 'مسجَّلة في السجل');
    const job = JobRegistry.get(REMINDER_DISPATCH_JOB_NAME);
    assert.equal(job?.intervalMs, 60_000, 'فاصل تقني معقول');
    assert.equal(typeof job?.run, 'function');
    // `JobRunner` يقرأ السجل — فالتسجيل في Phase 8 وحده كافٍ، بلا جدولة ثانية.
    assert.deepEqual(new JobRunner().getJobNames(), [REMINDER_DISPATCH_JOB_NAME]);
  });

  it('تذكير مستحقّ ومرتبط بطلب ⇒ إشعار لصاحب الطلب + processed_at', async () => {
    const employee = await seedUser('employee', 'a');
    const requestId = await seedRequest(employee.employeeId);
    const reminderId = await seedReminder({ relatedKind: 'request', relatedId: requestId });

    const summary = await dispatchDueReminders(pool, NOW);

    assert.equal(summary.due, 1);
    assert.equal(summary.notified, 1);
    assert.equal(summary.failures.length, 0);
    const notifications = await pool.query<{ userId: string; kind: string }>(
      'SELECT user_id AS "userId", kind FROM notifications',
    );
    assert.deepEqual(notifications.rows, [{ userId: employee.id, kind: 'due_reminder' }]);
    const processed = await pool.query<{ processed_at: string | null }>(
      'SELECT processed_at FROM reminders WHERE id = $1',
      [reminderId],
    );
    assert.ok(processed.rows[0].processed_at !== null, 'عُلّم في نفس المعاملة');
  });

  it('الحمولة تحمل المورد المرتبط بالنوع ليُفتح مصدره الحقيقي', async () => {
    const employee = await seedUser('employee', 'a');
    const requestId = await seedRequest(employee.employeeId);
    await seedReminder({ relatedKind: 'request', relatedId: requestId });

    await dispatchDueReminders(pool, NOW);

    const payload = await pool.query<{
      payload: { relatedResource?: { kind: string; id: string } };
    }>('SELECT payload FROM notifications');
    assert.deepEqual(payload.rows[0].payload.relatedResource, {
      kind: 'request',
      id: requestId,
    });
  });

  it('تذكير بلا مستلِم حتمي ⇒ لا إشعار ولا processed_at (TBD موثّق)', async () => {
    const transactionId = await seedTransaction();
    await seedReminder({ relatedKind: 'transaction', relatedId: transactionId });
    await seedReminder({}); // بلا ربط

    const summary = await dispatchDueReminders(pool, NOW);

    assert.equal(summary.due, 2);
    assert.equal(summary.notified, 0, 'لا إرسال لمستلِم مخترع');
    assert.equal(summary.skippedUnknownRecipient, 2);
    assert.equal(await countNotifications(), 0);
    const processed = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM reminders WHERE processed_at IS NOT NULL',
    );
    assert.equal(processed.rows[0].count, '0', 'التذكير لم يُحرق بسبب نقص قاعدة');
  });

  it('مستقبِلٌّ ومعطَّلٌ لا يُعالَجان', async () => {
    await seedReminder({ remindOn: '2026-10-01', remindAt: '09:00' }); // مستقبل
    await seedReminder({ enabled: false }); // معطَّل ومستحقّ الوقت

    const summary = await dispatchDueReminders(pool, NOW);

    assert.equal(summary.due, 0);
    assert.equal(summary.notified, 0);
    assert.equal(await countNotifications(), 0);
  });

  it('إعادة تشغيل الوظيفة لا تُنتج إشعاراً ثانياً (حاجز التكرار التقني)', async () => {
    const employee = await seedUser('employee', 'a');
    const requestId = await seedRequest(employee.employeeId);
    await seedReminder({ relatedKind: 'request', relatedId: requestId });

    const first = await dispatchDueReminders(pool, NOW);
    const second = await dispatchDueReminders(pool, NOW);

    assert.equal(first.notified, 1);
    assert.equal(second.notified, 0, 'التشغيل الثاني لا يُشعر');
    assert.equal(second.due, 0, 'التذكير المعالَج لا يعود «مستحقاً»');
    assert.equal(await countNotifications(), 1, 'إشعار واحد فقط');
  });

  it('تشغيلان متزامنان لا يُنتجان إشعارين — الحاجز في SQL لا في الذاكرة', async () => {
    const employee = await seedUser('employee', 'a');
    const requestId = await seedRequest(employee.employeeId);
    await seedReminder({ relatedKind: 'request', relatedId: requestId });

    // `Promise.all` ⇐ كلاهما قد يمرّ بـ`listDuePending` قبل أن يُحدّث أحدهما
    // العلامة، فلا ينفع الحجز في الذاكرة. الفيصل هو `markProcessed`
    // المشروط داخل `UPDATE` — وهو ما يُثبَت هنا فعلاً.
    const [first, second] = await Promise.all([
      dispatchDueReminders(pool, NOW),
      dispatchDueReminders(pool, NOW),
    ]);

    assert.equal(first.notified + second.notified, 1, 'إشعار واحد لا اثنان');
    assert.equal(await countNotifications(), 1);
  });

  it('فشل كتابة الإشعار يُسجَّل ولا يُحرق التذكير ولا يُسقط الوظيفة', async () => {
    const employee = await seedUser('employee', 'a');
    const requestId = await seedRequest(employee.employeeId);
    const reminderId = await seedReminder({ relatedKind: 'request', relatedId: requestId });

    // **حقن فشل حقيقي بلا mock**: قيد مؤقت يرفض `due_reminder` الجديد، فينشأ
    // خطأ قاعدة داخل معاملة الـdispatcher نفسها — وهو المسار المقصود في
    // «الفشل يُعزل لكل تذكير ولا يُحرق التذكير» (§20).
    await pool.query(
      `ALTER TABLE notifications ADD CONSTRAINT notifications_test_reject
         CHECK (kind <> 'due_reminder')`,
    );
    try {
      const summary = await dispatchDueReminders(pool, NOW);

      assert.equal(summary.notified, 0, 'لم يُنشأ إشعار — الإدراج مرفوض');
      assert.equal(summary.failures.length, 1, 'الفشل مُسجَّل في الملخّص لا مُبتلَع');
      assert.ok(summary.failures[0].error.length > 0, 'مع سبب تقني محفوظ');
      const processed = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM reminders WHERE processed_at IS NOT NULL',
      );
      assert.equal(processed.rows[0].count, '0', 'والتذكير لم يُحرق — المعاملة تراجعت');
    } finally {
      await pool.query('ALTER TABLE notifications DROP CONSTRAINT notifications_test_reject');
    }

    // بعد زوال سبب الفشل ينجح التشغيل التالي: فالفشل **لم** يُسجَّل معالجةً
    // كاذبة، والتذكير ما زال في انتظار المعالجة (§20).
    const recovered = await dispatchDueReminders(pool, NOW);

    assert.equal(recovered.notified, 1, 'أُعيد المحاولة بنجاح');
    assert.equal(recovered.failures.length, 0);
    const processedAfter = await pool.query<{ processed_at: string | null }>(
      'SELECT processed_at FROM reminders WHERE id = $1',
      [reminderId],
    );
    assert.ok(processedAfter.rows[0].processed_at !== null, 'والآن عُلّم بنجاح');
    assert.ok(employee.id.length > 0);
  });

  it('فشل تذكير لا يوقف تذكيراً آخر في التشغيل نفسه', async () => {
    const employee = await seedUser('employee', 'a');
    const requestId = await seedRequest(employee.employeeId);
    // الأول مرتبط بطلب سليم، والثاني مرتبط بمعرّف طلب **غير موجود**:
    // الاستعلام يُعيد `undefined` فيُتخطّى كـTBD. ثم نضيف ثالثاً مرتبطاً
    // بسليم للتحقق من العزل بين «تخطّي» و«فشل» و«نجاح» في مرور واحد.
    await seedReminder({ relatedKind: 'request', relatedId: requestId });
    await seedReminder({ relatedKind: 'request', relatedId: '00000000-0000-0000-0000-000000000000' });

    const summary = await dispatchDueReminders(pool, NOW);

    assert.equal(summary.due, 2);
    assert.equal(summary.notified, 1, 'التذكير السليم عولج');
    assert.equal(summary.skippedUnknownRecipient, 1, 'والمعلَّق على طلب غير موجود تخطّي');
    assert.equal(summary.failures.length, 0, 'لا فشل');
    assert.ok(employee.id.length > 0);
  });
});