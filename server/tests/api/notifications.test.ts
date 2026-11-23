/**
 * اختبارات Phase 21 عبر الـHTTP الحقيقي — الإشعارات والتذكيرات.
 *
 * المرجع: ALSQAYA_PLAN §20 · §21 · §37 · §28 · §10.3 · §18.
 *
 * المسار المُختبَر كاملاً بلا mock:
 * `middleware → authorization → validation → controller → service →
 *  repository → PostgreSQL`
 *
 * مصفوفة الصلاحيات (§28، مع قرار **إدارية التذكيرات** المعتمد بعد التنفيذ —
 * ملحق `PHASE_21_REPORT.md`؛ **بلا صلاحية جديدة**، البوابة `view_audit_logs`
 * الإدارية على `/reminders` كما `audit-logs`):
 * | الدور | GET notifications | POST :id/read | GET reminders | POST reminders |
 * |---|---|---|---|---|
 * | admin | 200 | 200 | 200 | 201 |
 * | director | 200 | 200 | **403** | 403 (`create`) |
 * | employee | 200 | 200 | **403** | 403 (`create`) |
 *
 * وأهم ما يُثبَت: **لا يمكن لأحد قراءة إشعارات غيره** — لا بمُعامل استعلام
 * (مرفوض 400 كحقل غير معروف) ولا بمعرّف في المسار (404 حجب وجود). **وسجلات
 * التذكيرات إدارية**: لا يقرأها غير المسؤول أصلاً (403 قبل الوصول للبيانات).
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
import { newAuthenticatedAccount, newTransaction, type TransactionBody } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

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

  /**
   * معرّف المنتسب المربوط بالحساب — من القاعدة مباشرة.
   *
   * يلزم اختبارات النطاق: إنشاء طلب باسم مالك بعينه يتطلب `employeeId`
   * وهو غير مُعلن في عقد `GET /api/auth/me`.
   */
  async function employeeIdOf(token: string): Promise<string> {
    const userId = await userIdOf(token);
    const result = await pool.query<{ employeeId: string | null }>(
      'SELECT employee_id AS "employeeId" FROM users WHERE id = $1',
      [userId],
    );
    const employeeId = result.rows[0]?.employeeId;
    assert.ok(employeeId, 'الحساب مرتبط بمنتسب');
    return employeeId;
  }

  // Phase15-N: historic notification rows remain, but no endpoint reads or updates them.
  it('notification endpoints are retired while historical rows stay untouched', async () => {
    const token = await actorWithRole('employee');
    const userId = await userIdOf(token);
    const notificationId = await seedNotification(userId, 'new_broadcast');
    useTestSession(token);
    for (const [method, path] of [
      ['GET', '/api/notifications'],
      ['GET', '/api/notifications/unread-count'],
      ['GET', `/api/notifications/${notificationId}`],
      ['POST', `/api/notifications/${notificationId}/read`],
      ['POST', '/api/notifications'],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, {
        method, headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 404, 'retired endpoint must be absent');
    }
    const stillExists = await pool.query<{ is_new: boolean }>(
      'SELECT is_new FROM notifications WHERE id=$1', [notificationId],
    );
    assert.deepEqual(stillExists.rows, [{ is_new: true }], 'historical notification row is retained');
  });

  it('authentication gate remains active on retired notifications paths', async () => {
    useTestSession(null);
    const response = await getJson(baseUrl, '/api/notifications');
    assert.equal(response.status, 401);
  });

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
  });

  it('إنشاء تذكير: حقل relatedKind تحقق بنيوي فقط (بلا قائمة مغلقة)', async () => {
    useTestSession(await actorWithRole('admin'));
    // قيمة نصية غير فارغة مقبولة: الخطة أطلقت الحصر، والباقي من
    // التحقق (عدم قبول الحقول الزائدة وشكل النص) يبقى كما هو.
    const created = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'متابعة كتاب',
      relatedKind: 'not_a_resource',
      relatedId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(created.status, 201, 'نوع نصي غير فارغ مقبول');
    assert.equal(created.body.relatedKind, 'not_a_resource');
    // نص فارغ أو فارغ من المسافات => 400 فقط
    for (const kind of ['', '   '] as const) {
      const bad = await postJson<ApiErrorBody>(baseUrl, '/api/reminders', {
        remindOn: '2026-10-01',
        remindAt: '08:30',
        note: 'س',
        relatedKind: kind,
      });
      assert.equal(bad.status, 400, 'النوع النصي ' + (kind.trim() || '(فراغ') + ' مرفوض كحقل فارغ');
    }
  });

  it('قراءة التذكيرات إدارية: admin 200 · director/employee 403 · بلا جلسة 401', async () => {
    useTestSession(await actorWithRole('admin'));
    await postJson(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'تذكير مشترك',
    });

    // المسؤول المخوّل وحده يقرأ (البوابة الإدارية `view_audit_logs` على /reminders).
    useTestSession(await actorWithRole('admin'));
    const asAdmin = await getJson<ReminderBody[]>(baseUrl, '/api/reminders');
    assert.equal(asAdmin.status, 200, 'admin يقرأ التذكيرات');
    assert.equal(asAdmin.body.length, 1);

    // المدير والمنتسب مرفوضان على الخادم — لا مجرد إخفاء في الواجهة.
    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const response = await getJson<ApiErrorBody>(baseUrl, '/api/reminders');
      assert.equal(response.status, 403, `${role} مرفوض على قراءة التذكيرات`);
      assert.equal(response.body.error?.code, 'PERMISSION_DENIED');
    }

    // بلا جلسة: المصادقة تسبق التفويض ⇒ 401 لا 403.
    useTestSession(null);
    const anonymous = await getJson<ApiErrorBody>(baseUrl, '/api/reminders');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  it('تفاصيل تذكير محدّد إدارية أيضاً: director/employee 403 على /:id', async () => {
    useTestSession(await actorWithRole('admin'));
    const created = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'تذكير للتفاصيل',
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const response = await getJson<ApiErrorBody>(baseUrl, `/api/reminders/${id}`);
      assert.equal(response.status, 403, `${role} مرفوض على تفاصيل التذكير`);
      assert.equal(response.body.error?.code, 'PERMISSION_DENIED');
    }

    useTestSession(null);
    const anonymous = await getJson<ApiErrorBody>(baseUrl, `/api/reminders/${id}`);
    assert.equal(anonymous.status, 401, 'بلا جلسة ⇒ 401 قبل التفويض');
  });

  it('تعطيل/تفعيل تذكير إداري: director/employee 403 ولا يمسّان البيانات', async () => {
    useTestSession(await actorWithRole('admin'));
    const created = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'تذكير للتفعيل',
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal(created.body.enabled, true, 'يُنشأ مفعّلاً افتراضياً');

    // محاولتا تعطيل من غير المسؤول مرفوضتان — ولا تلمسان الصف.
    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const denied = await patchJson<ApiErrorBody>(baseUrl, `/api/reminders/${id}`, {
        enabled: false,
      });
      assert.equal(denied.status, 403, `${role} مرفوض على تعطيل التذكير`);
      assert.equal(denied.body.error?.code, 'PERMISSION_DENIED');
    }

    // الصف سليم كما أنشأه المسؤول (المرفوض لم يكتب في القاعدة).
    useTestSession(await actorWithRole('admin'));
    const afterDenied = await getJson<ReminderBody>(baseUrl, `/api/reminders/${id}`);
    assert.equal(afterDenied.status, 200);
    assert.equal(afterDenied.body.enabled, true, 'المحاولات المرفوضة لم تعطّل شيئاً');

    // والمسؤول يفعّل/يعطّل فعلاً: PATCH بعائلة `update` يعمل.
    const disabled = await patchJson<ReminderBody>(baseUrl, `/api/reminders/${id}`, {
      enabled: false,
    });
    assert.equal(disabled.status, 200, 'admin يعطّل');
    assert.equal(disabled.body.enabled, false);

    const enabled = await patchJson<ReminderBody>(baseUrl, `/api/reminders/${id}`, {
      enabled: true,
    });
    assert.equal(enabled.status, 200, 'admin يفعّل');
    assert.equal(enabled.body.enabled, true);
  });

  // ── نطاق رؤية المسؤول للتذكيرات + منع غير المخوّل (§12 · قرار الإدارية) ──

  it('المسؤول يرى كل التذكيرات بلا قيد نطاق — وغير المخوّل 403 لا قراءة', async () => {
    const adminToken = await actorWithRole('admin');
    useTestSession(adminToken);
    const publicTx = await newTransaction(suite.context, {
      number: '٢١/عام',
      visibility: 'PublicToEmployees',
      subject: 'كتاب عام',
    });
    const hiddenTx: TransactionBody = await newTransaction(suite.context, {
      number: '٢٢/إداري',
      visibility: 'Administrative',
      subject: 'كتاب إداري',
    });

    for (const [note, relatedId] of [
      ['كتاب عام', publicTx.id],
      ['كتاب إداري', hiddenTx.id],
    ] as const) {
      const created = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
        remindOn: '2026-10-01',
        remindAt: '08:30',
        note,
        relatedKind: 'transaction',
        relatedId,
      });
      assert.equal(created.status, 201, `إنشاء تذكير ${note}`);
    }
    await postJson(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'بلا ربط',
    });

    // المسؤول (نطاق الكتب `null`) يرى الثلاثة — قيد النطاق لا يحدّه.
    useTestSession(adminToken);
    const asAdmin = await getJson<ReminderBody[]>(baseUrl, '/api/reminders');
    assert.equal(asAdmin.body.length, 3, 'المسؤول بلا قيد');
    const hiddenReminder = asAdmin.body.find((r) => r.note === 'كتاب إداري');
    assert.ok(hiddenReminder, 'التذكير الإداري موجود للمسؤول');

    // غير المخوّل (مدير/منتسب) مرفوض أصلاً: البوابة الإدارية تسبق أي قيد نطاق،
    // فالقراءة بالنطاق لم تعد قابلة للوصول لغير المسؤول (§21 المعتمدة).
    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const deniedList = await getJson<ApiErrorBody>(baseUrl, '/api/reminders');
      assert.equal(deniedList.status, 403, `${role} مرفوض على القائمة`);
      const deniedById = await getJson<ApiErrorBody>(
        baseUrl,
        `/api/reminders/${hiddenReminder.id}`,
      );
      assert.equal(deniedById.status, 403, `${role} مرفوض على التفاصيل أيضاً`);
    }
  });

  it('تذكيرات الطلبات إدارية: المسؤول يراها كلها · والمنتسب/المدير 403', async () => {
    const adminToken = await actorWithRole('admin');
    const ownerEmployeeId = await employeeIdOf(await actorWithRole('employee'));
    const otherEmployeeId = await employeeIdOf(await actorWithRole('employee'));

    useTestSession(adminToken);
    const owned = await postJson<{ id: string }>(baseUrl, '/api/requests', {
      employeeId: ownerEmployeeId,
      kind: 'general',
      payload: { kind: 'general', subject: 'طلب المالك' },
    });
    assert.equal(owned.status, 201, `إنشاء طلب المالك: ${JSON.stringify(owned.body)}`);
    const foreign = await postJson<{ id: string }>(baseUrl, '/api/requests', {
      employeeId: otherEmployeeId,
      kind: 'general',
      payload: { kind: 'general', subject: 'طلب الغير' },
    });
    assert.equal(foreign.status, 201, `إنشاء طلب الغير: ${JSON.stringify(foreign.body)}`);

    for (const [note, relatedId] of [
      ['طلب المالك', owned.body.id],
      ['طلب الغير', foreign.body.id],
    ] as const) {
      const created = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
        remindOn: '2026-10-01',
        remindAt: '08:30',
        note,
        relatedKind: 'request',
        relatedId,
      });
      assert.equal(created.status, 201, `إنشاء تذكير ${note}`);
    }

    // والمسؤول بنطاق «الكل» يرى الاثنين.
    useTestSession(adminToken);
    const asAdmin = await getJson<ReminderBody[]>(baseUrl, '/api/reminders');
    assert.equal(asAdmin.body.length, 2, 'المسؤول بلا قيد على الطلبات');

    // المنتسب (مالك الطلب أو غيره) والمدير: مرفوضون — التذكيرات إدارية،
    // فلم يبق لقراءتها بنطاق الطلب وجود لغير المسؤول.
    const ownerReminder = await pool.query<{ id: string }>(
      'SELECT id FROM reminders WHERE related_id = $1',
      [owned.body.id],
    );
    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const deniedList = await getJson<ApiErrorBody>(baseUrl, '/api/reminders');
      assert.equal(deniedList.status, 403, `${role} مرفوض على قائمة التذكيرات`);
      const deniedById = await getJson<ApiErrorBody>(
        baseUrl,
        `/api/reminders/${ownerReminder.rows[0].id}`,
      );
      assert.equal(deniedById.status, 403, `${role} مرفوض على التفاصيل`);
    }
  });


  // ── مصفوفة الصلاحيات (§28 — بلا Role ولا Permission جديدة) ────────────

  it('إنشاء تذكير: admin 201 · director/employee 403 — والمرفوض لا يُنشئ صفاً (سلامة البيانات)', async () => {
    // المسؤول وحده ينشئ (§21 الإدارية). البوابة الإدارية تمنع الكتابة قبل
    // الـcontroller، فالاختبار مطالب بإثبات **غياب الأثر في القاعدة** لا الرمز
    // وحده — العدد المرجع يُقاس من جدول `reminders` مباشرةً.
    useTestSession(await actorWithRole('admin'));
    const allowed = await postJson<ReminderBody>(baseUrl, '/api/reminders', {
      remindOn: '2026-10-01',
      remindAt: '08:30',
      note: 'اختبار الصلاحية',
    });
    assert.equal(allowed.status, 201, 'admin ينشئ تذكيراً');

    const countReminders = async (): Promise<number> => {
      const result = await pool.query<{ id: string }>('SELECT id FROM reminders');
      return result.rows.length;
    };
    const beforeDenied = await countReminders();
    assert.equal(beforeDenied, 1, 'صفّ المسؤول الواحد هو المرجع');

    for (const role of ['director', 'employee'] as const) {
      useTestSession(await actorWithRole(role));
      const denied = await postJson<ApiErrorBody>(baseUrl, '/api/reminders', {
        remindOn: '2026-10-01',
        remindAt: '08:30',
        note: 'محاولة مرفوضة',
      });
      assert.equal(denied.status, 403, `${role} مرفوض على الإنشاء`);
      assert.equal(denied.body.error?.code, 'PERMISSION_DENIED', 'الرفض تفويض لا مصادقة');
    }
    const afterDenied = await countReminders();
    assert.equal(afterDenied, beforeDenied, 'المحاولات المرفوضة لم تُنشئ أي صف تذكير');
  });

  it('بلا جلسة ⇒ 401 على مسارات التذكيرات أيضاً', async () => {
    useTestSession(null);
    const response = await getJson(baseUrl, '/api/reminders');
    assert.equal(response.status, 401);
  });
});