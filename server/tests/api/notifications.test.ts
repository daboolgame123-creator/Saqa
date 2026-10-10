/**
 * اختبارات Phase 21 عبر الـHTTP الحقيقي — الإشعارات والتذكيرات.
 *
 * المرجع: ALSQAYA_PLAN §20 · §21 · §37 · §28 · §10.3 · §18.
 *
 * المسار المُختبَر كاملاً بلا mock:
 * `middleware → authorization → validation → controller → service →
 *  repository → PostgreSQL`
 *
 * مصفوفة الصلاحيات (من §28 القائمة، **بلا صلاحية جديدة**):
 * | الدور | GET notifications | POST :id/read | GET reminders | POST reminders |
 * |---|---|---|---|---|
 * | admin | 200 | 200 | 200 | 201 |
 * | director | 200 | 200 | 200 | 403 (`create`) |
 * | employee | 200 | 200 | 200 | 403 (`create`) |
 *
 * وأهم ما يُثبَت: **لا يمكن لأحد قراءة إشعارات غيره** — لا بمُعامل استعلام
 * (مرفوض 400 كحقل غير معروف) ولا بمعرّف في المسار (404 حجب وجود).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  deleteJson,
  getJson,
  patchJson,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
  type JsonResponse,
} from './apiTestHelpers';
import { newAuthenticatedAccount } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

interface NotificationBody {
  id: string;
  kind: string;
  payload?: {
    resourceKind?: string;
    resourceId?: string;
    summary?: string;
    relatedResource?: { kind: string; id: string };
  };
  isNew: boolean;
  createdAt: string;
  readAt?: string;
}

interface ReminderBody {
  id: string;
  enabled: boolean;
  remindOn: string;
  remindAt: string;
  note: string;
  relatedKind?: string;
  relatedId?: string;
  /**
   * حاجز التكرار التقني (§19) — **يجب ألّا يظهر** في عقد الاستجابة.
   * والفحص هنا هو ما يثبت ذلك: لو سُرّب الحقل لأثبتّه الاختبار.
   */
  processedAt?: string;
  /** حالة العمل — قيمتها غير محسومة (TBD)، ويجب ألّا تصل من الخادم. */
  status?: string;
}

const SECRET = 'S3cret-Start';

describe('Phase 21 — API: الإشعارات والتذكيرات', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;
  let seq = 0;

  before(async () => {
    suite = await startApiSuite();
    pool = suite.pool;
    baseUrl = suite.baseUrl;
  });

  after(async () => {
    await stopApiSuite(suite);
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
  });

  /** حساب بدور الخطة وجلسة محقونة. */
  async function actorWithRole(role: 'admin' | 'director' | 'employee'): Promise<string> {
    seq += 1;
    const created = await newAuthenticatedAccount(suite.context, {
      badgeNumber: `R21-${role}-${seq}`,
      phone: `0772${String(seq).padStart(7, '0')}`,
      secret: SECRET,
      role,
    });
    return created.sessionToken;
  }

  /** يزرع إشعاراً مباشرةً لِحسابٍ بعينه (لا مسار إنشاء من الـAPI عمداً). */
  async function seedNotification(userId: string, kind: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, $2, '{"summary":"بذرة"}') RETURNING id`,
      [userId, kind],
    );
    return result.rows[0].id;
  }

  /**
   * معرّف الحساب من هوية الجلسة نفسها (`GET /api/auth/me`).
   *
   * يُقرأ من الخادم لا من مُعاملات الاختبار، فيُثبَت أن `userId` المستخدم
   * في كل طلب هو **نفس** معرّف الجلسة — وهو ما يجعل باقي اختبارات
   * الملكية ذات معنى.
   */
  async function userIdOf(token: string): Promise<string> {
    useTestSession(token);
    const response = await getJson<{ userId: string }>(baseUrl, '/api/auth/me');
    assert.equal(response.status, 200, 'قراءة هوية الجلسة');
    return response.body.userId;
  }

  // ── الإشعارات: القراءة والملكية ────────────────────────────────────────

  it('GET /api/notifications يرجع إشعارات صاحب الجلسة وحدها', async () => {
    const token = await actorWithRole('admin');
    const myId = await userIdOf(token);
    const otherToken = await actorWithRole('admin');
    const otherId = await userIdOf(otherToken);
    await seedNotification(myId, 'book_available');
    await seedNotification(otherId, 'new_broadcast');

    useTestSession(token);
    const response = await getJson<NotificationBody[]>(baseUrl, '/api/notifications');

    assert.equal(response.status, 200);
    assert.equal(response.body.length, 1, 'لا تسرّب من حساب آخر');
    assert.equal(response.body[0].kind, 'book_available');
    assert.equal(response.body[0].isNew, true, 'يبدأ «جديد»');
    assert.equal(response.body[0].readAt, undefined);
  });

  it('?userId=<غيره> مرفوض 400 — لا مُعامل لاختيار صاحب الإشعارات', async () => {
    const token = await actorWithRole('admin');
    const otherToken = await actorWithRole('admin');
    const otherId = await userIdOf(otherToken);
    await seedNotification(otherId, 'new_request');

    useTestSession(token);
    const response = await getJson<ApiErrorBody>(baseUrl, '/api/notifications?userId=' + otherId);

    assert.equal(response.status, 400, 'حقل غير معروف — لا يُقبل من العميل');
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
  });

  it('POST /:id/read يصفّر is_new ويضبط read_at، ولا يحذف السجل (§20)', async () => {
    const token = await actorWithRole('employee');
    const myId = await userIdOf(token);
    const notificationId = await seedNotification(myId, 'request_update');

    useTestSession(token);
    const response = await postJson<NotificationBody>(
      baseUrl,
      `/api/notifications/${notificationId}/read`,
      {},
    );

    assert.equal(response.status, 200, 'المنتسب (view فقط) يستطيع التعليم');
    assert.equal(response.body.isNew, false);
    assert.ok(response.body.readAt !== undefined, 'read_at مضبوط');

    // السجل التاريخي باقٍ — القراءة تُعيده بلا is_new.
    const listed = await getJson<NotificationBody[]>(baseUrl, '/api/notifications');
    assert.equal(listed.body.length, 1, 'الصف لم يُحذف');
    assert.equal(listed.body[0].isNew, false);
    assert.equal(listed.body[0].createdAt, response.body.createdAt, 'وقت الإنشاء محفوظ');
  });

  it('تعليم إشعار غيرك = 404 (حجب وجود)، والصفّ غير متأثر', async () => {
    const ownerToken = await actorWithRole('employee');
    const ownerId = await userIdOf(ownerToken);
    const otherToken = await actorWithRole('employee');
    const foreignId = await seedNotification(ownerId, 'due_reminder');

    useTestSession(otherToken);
    const response = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/notifications/${foreignId}/read`,
      {},
    );

    assert.equal(response.status, 404, '404 لا 403 — لا كشف وجود');
    assert.equal(response.body.error?.code, 'RESOURCE_NOT_FOUND');

    useTestSession(ownerToken);
    const listed = await getJson<NotificationBody[]>(baseUrl, '/api/notifications');
    assert.equal(listed.body[0].isNew, true, 'الصفّ ما زال «جديداً»');
  });

  it('GET /unread-count يعدّ غير المقروء لصاحب الجلسة وحده', async () => {
    const token = await actorWithRole('employee');
    const myId = await userIdOf(token);
    const first = await seedNotification(myId, 'new_broadcast');
    await seedNotification(myId, 'request_update');

    useTestSession(token);
    const beforeRead = await getJson<{ unread: number }>(
      baseUrl,
      '/api/notifications/unread-count',
    );
    assert.equal(beforeRead.body.unread, 2);

    await postJson(baseUrl, `/api/notifications/${first}/read`, {});
    const afterRead = await getJson<{ unread: number }>(
      baseUrl,
      '/api/notifications/unread-count',
    );
    assert.equal(afterRead.body.unread, 1, 'ينقص واحد بعد التعليم');
  });

  it('?isNew=true يصفّح غير المقروء فقط', async () => {
    const token = await actorWithRole('employee');
    const myId = await userIdOf(token);
    const first = await seedNotification(myId, 'new_broadcast');
    await seedNotification(myId, 'request_update');
    await postJson(baseUrl, `/api/notifications/${first}/read`, {});

    useTestSession(token);
    const response = await getJson<NotificationBody[]>(baseUrl, '/api/notifications?isNew=true');

    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].kind, 'request_update');
  });

  it('?kind=<قيمة خارج الست> مرفوض 400 (قائمة الأنواع مغلقة)', async () => {
    useTestSession(await actorWithRole('admin'));

    const bad = await getJson<ApiErrorBody>(baseUrl, '/api/notifications?kind=not_a_kind');
    assert.equal(bad.status, 400);

    const good = await getJson<NotificationBody[]>(
      baseUrl,
      '/api/notifications?kind=new_broadcast',
    );
    assert.equal(good.status, 200, 'القيمة المعتمدة تُقبل');
  });

  it('بلا جلسة ⇒ 401 على كل مسارات الإشعارات (الهوية شرط لا خيار)', async () => {
    useTestSession(null);
    for (const path of ['/api/notifications', '/api/notifications/unread-count']) {
      const response = await getJson(baseUrl, path);
      assert.equal(response.status, 401, `${path} محمية بلا جلسة`);
    }
    const withToken = await requestWithToken(baseUrl, '/api/notifications', {
      token: 'invalid',
    });
    assert.equal(withToken.status, 401, 'رفعة غير صالحة لا تمرّ');

  // ── التذكيرات ─────────────────────────────────────────────────────────

  it('POST /api/reminders ينشئ تذكيراً بالحقول التي يحدّدها §21', async () => {
    useTestSession(await actorWithRole('admin'));

    const response = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'متابعة الكتاب',
      relatedKind: 'transaction',
      relatedId: '11111111-1111-1111-1111-111111111111',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.enabled, true, 'enabled يُفترض true');
    assert.equal(response.body.remindOn, '2026-10-01');
    assert.equal(response.body.remindAt, '08:30');
    assert.equal(response.body.note, 'متابعة الكتاب');
    assert.equal(response.body.relatedKind, 'transaction');
    // حاجز التكرار التقني لا يظهر في العقد العام (§19).
    assert.equal(response.body.processedAt, undefined);
    assert.equal(response.body.status, undefined, 'الحالة غير محسومة (TBD) — لا تُخترع');
  });

  it('PATCH يبدّل enabled، وبلا DELETE (التعطيل هو الإيقاف §32)', async () => {
    const employeeToken = await actorWithRole('employee');
    useTestSession(await actorWithRole('admin'));
    const created = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'متابعة',
    });

    const patched = await patchJson<ReminderBody>(
      baseUrl,
      `/api/reminders/${created.body.id}`,
      { enabled: false },
    );
    assert.equal(patched.status, 200);
    assert.equal(patched.body.enabled, false);
    assert.equal(patched.body.note, 'متابعة', 'بقي ما لم يُرسل');

    // المسار غير موجود أصلاً ⇒ 404. و`admin` يملك `delete_archive` فيرى
    // ذلك 404 (المسار غائب)، بينما `employee` يُرفض 403 قبله — وكلاهما
    // يُثبت **غياب مسار الحذف** دون مسار يقود إلى حذف (§32).
    const asAdmin = await deleteJson(baseUrl, `/api/reminders/${created.body.id}`);
    assert.equal(asAdmin.status, 404, 'لا مسار DELETE أصلاً');
    const asEmployee = await requestWithToken(
      baseUrl,
      `/api/reminders/${created.body.id}`,
      { method: 'DELETE', token: employeeToken },
    );
    assert.equal(asEmployee.status, 403, 'وغير المخوّل يُرفض قبل المسار');
  });

  it('PATCH على تذكير غير موجود = 404 (حجب وجود)', async () => {
    useTestSession(await actorWithRole('admin'));

    const response = await patchJson<ApiErrorBody>(
      baseUrl,
      '/api/reminders/00000000-0000-0000-0000-000000000000',
      { enabled: false },
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  it('جسم غير صالح ⇒ 400، وstatus مرفوض كحقل زائد', async () => {
    useTestSession(await actorWithRole('admin'));

    const badDate = await postJson<ApiErrorBody>(baseUrl, '/api/reminders', {
      remindOn: '01-10-2026',
      remindAt: '08:30',
      note: 'س',
    });
    assert.equal(badDate.status, 400);

    const badTime = await postJson<ApiErrorBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '25:99',
      note: 'س',
    });
    assert.equal(badTime.status, 400);

    // `status` غير مقبول: قيمته غير محسومة في الخطة.
    const withStatus = await postJson<ApiErrorBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'س',
      status: 'done',
    });
    assert.equal(withStatus.status, 400, 'حقل زائد — لا قيم حالات مخترعة');

    const badKind = await postJson<ApiErrorBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'س',
      relatedKind: 'not_a_resource',
    });
    assert.equal(badKind.status, 400, 'نوع مرتبط بلا مسار');
  });

  it('GET /api/reminders يقرأ للجميع (view) بلا تمييز أدوار', async () => {
    const adminToken = await actorWithRole('admin');
    await postJson(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'تذكير مشترك',
    });

    useTestSession(adminToken);
    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const response = await getJson<ReminderBody[]>(baseUrl, '/api/reminders');
      assert.equal(response.status, 200, `${role} يقرأ التذكيرات`);
      assert.equal(response.body.length, 1);
    }
  });

  // ── مصفوفة الصلاحيات (§28 — بلا Role ولا Permission جديدة) ────────────

  it('إنشاء تذكير: admin 201 · director 403 · employee 403', async () => {
    for (const [role, expected] of [
      ['admin', 201],
      ['director', 403],
      ['employee', 403],
    ] as const) {
      useTestSession(await actorWithRole(role));
      const response = await postJson(baseUrl, '/api/reminders', {
        remindOn: '2026-10-01',
        remindAt: '08:30',
        note: 'اختبار الصلاحية',
      });
      assert.equal(response.status, expected, `${role} ⇒ ${expected}`);
    }
  });

  it('تعليم كمقروء متاح لكل الأدوار (view) — استثناء مثل «اطلعت»', async () => {
    // هذا الاختبار هو ما يجعل `POST /:id/read` استثناءً في خريطة الصلاحيات:
    // لو فُرض عليه `create` لأُغلق على المنتسب (view فقط) بلا فائدة وظيفية،
    // مع أن العملية تخصّ صفّه وحده ومقيّدة بـ`user_id` في SQL.
    for (const role of ['admin', 'director', 'employee'] as const) {
      const token = await actorWithRole(role);
      const userId = await userIdOf(token);
      const notificationId = await seedNotification(userId, 'new_broadcast');
      useTestSession(token);

      const response = await postJson<NotificationBody>(
        baseUrl,
        `/api/notifications/${notificationId}/read`,
        {},
      );
      assert.equal(response.status, 200, `${role} يستطيع تعليم ما قرأه`);
    }
  });

  it('لا مسار إنشاء إشعار — الإنشاء من الحدث وحده (§28)', async () => {
    useTestSession(await actorWithRole('admin'));

    const created = await postJson<ApiErrorBody>(baseUrl, '/api/notifications', {
      userId: '00000000-0000-0000-0000-000000000000',
      kind: 'new_request',
    });
    assert.equal(created.status, 404, 'المسار غير موجود أصلاً');
  });

  it('قراءة إشعارات غيرك عبر تعديل المسار = 404، لا تسريب', async () => {
    const ownerToken = await actorWithRole('employee');
    const ownerId = await userIdOf(ownerToken);
    const foreignId = await seedNotification(ownerId, 'book_available');
    const otherToken = await actorWithRole('employee');

    useTestSession(otherToken);
    const response = await getJson<ApiErrorBody>(baseUrl, `/api/notifications/${foreignId}`);

    assert.equal(response.status, 404, '404 لا 403 — لا كشف وجود لصفّ غيره');
    assert.equal(response.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  it('بلا جلسة ⇒ 401 على مسارات التذكيرات أيضاً', async () => {
    useTestSession(null);
    const response = await getJson(baseUrl, '/api/reminders');
    assert.equal(response.status, 401);
  });
});
  });