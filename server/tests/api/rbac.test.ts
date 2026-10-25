/**
 * اختبارات Phase 12 — RBAC عبر الـHTTP الحقيقي (إلزامية §28).
 *
 * لكل Role × عملية حساسة:
 * - allowed،
 * - denied،
 * - denied **عند استدعاء API مباشر** يتجاوز الواجهة.
 *
 * «مباشر» هنا معناه الطلب الفعلي إلى الخادم عبر fetch بلا أي مكوّن
 * React في المسار — وكل اختبارات هذا الملف كذلك، لأن طبقة الاختبار
 * لا تعرف الواجهة إطلاقاً. الممنوع يُمنع قبل الـcontroller على الخادم.
 *
 * المصفوفة مصدرها §10: admin يدير (§10.1)، director إشرافي/اطلاعي
 * (§10.2)، employee رؤية (§10.3). النطاق المرئي للسجلات ليس من هذه
 * المرحلة (Access Scope = Phase 13)، فالقراءة مسموحة للأدوار الثلاثة.
 *
 * كل البيانات اصطناعية داخل قاعدة `alsqaya_test` المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  getJson,
  patchJson,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
  type JsonResponse,
} from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  newPersonnelRecord,
  newRegisteredAccount,
  newTransaction,
  setAccountRole,
  type AccountBody,
  type TestRole,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

const SECRET = 'S3cret-Start';

/** حساب بدور معين وجالة محقونة. */
interface Actor {
  account: AccountBody;
  token: string;
  /** الدور المرفوع في القاعدة — يُقرأ من الطلب الفعلي لا من زمن التسجيل. */
  role: TestRole;
}

describe('Phase 12 — RBAC: Role × عملية حساسة', () => {
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

  /** يبني حساباً بدور الخطة ويحقن جلسته (زرع الدور SQL كما في §ملاحظات المرحلة). */
  async function actorWithRole(role: TestRole): Promise<Actor> {
    seq += 1;
    const { account, sessionToken } = await newAuthenticatedAccount(suite.context, {
      badgeNumber: `RB-${role}-${seq}`,
      phone: `0771${String(seq).padStart(7, '0')}`,
      secret: SECRET,
      role,
    });
    return { account, token: sessionToken, role };
  }

  /** يؤكد رفض التفويض: 403 وليس 401، والرمز PERMISSION_DENIED. */
  function assertDenied(response: JsonResponse<ApiErrorBody>, label: string): void {
    assert.equal(
      response.status,
      403,
      `${label}: الرفض يجب أن يكون 403 — ${JSON.stringify(response.body)}`,
    );
    assert.equal(
      response.body.error?.code,
      'PERMISSION_DENIED',
      `${label}: رمز الخطأ يجب أن يكون PERMISSION_DENIED`,
    );
  }

  // ── view: عائلة مسموحة للأدوار الثلاثة (§10 كله يرى ما يلزم له) ──

  it('view: الأدوار الثلاثة يقرؤون الموارد — القراءة ليست حصراً لدور', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');
    for (const actor of [admin, director, employee]) {
      useTestSession(actor.token);
      const response = await getJson<unknown[]>(baseUrl, '/api/employees');
      assert.equal(response.status, 200, `${actor.role} يقرأ القائمة`);
    }
  });

  // ── create / update على الموظفين ─────────────────────────────────

  it('create: إنشاء منتسب — admin مسموح · director/employee مرفوض', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');
    const body = { name: 'منتسب المصفوفة', title: 'معاون إداري', department: 'الشؤون الإدارية' };

    useTestSession(admin.token);
    const allowed = await postJson(baseUrl, '/api/employees', body);
    assert.equal(allowed.status, 201, 'admin ينشئ (§10.1)');

    // استدعاء مباشر للـAPI من غير واجهة — الرفض على الخادم.
    useTestSession(director.token);
    assertDenied(await postJson<ApiErrorBody>(baseUrl, '/api/employees', body), 'director create');
    useTestSession(employee.token);
    assertDenied(await postJson<ApiErrorBody>(baseUrl, '/api/employees', body), 'employee create');

    // كل حساب اختبار يسجّل موظفه هو (شرط §11.1)، فنعدّ سجل «المنتسب»
    // الذي حاولت المصاحبان إنشاءه وحده — الممنوع لم يكتب في القاعدة.
    const rows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM employees WHERE name = $1`,
      ['منتسب المصفوفة'],
    );
    assert.equal(rows.rows[0].count, '1', 'المرفوض لم يكتب في القاعدة');
  });

  it('update: تعديل منتسب — admin مسموح · director/employee مرفوض', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');
    useTestSession(admin.token);
    const target = await newEmployee(suite.context);

    useTestSession(admin.token);
    const allowed = await patchJson<{ name: string }>(
      baseUrl,
      `/api/employees/${target.id}`,
      { name: 'منتسب معدّل' },
    );
    assert.equal(allowed.status, 200, 'admin يعدّل (§10.1)');
    assert.equal(allowed.body.name, 'منتسب معدّل');

    useTestSession(director.token);
    assertDenied(
      await patchJson<ApiErrorBody>(baseUrl, `/api/employees/${target.id}`, { name: 'محاولة' }),
      'director update',
    );
    useTestSession(employee.token);
    assertDenied(
      await patchJson<ApiErrorBody>(baseUrl, `/api/employees/${target.id}`, { name: 'محاولة' }),
      'employee update',
    );

    const rows = await pool.query<{ name: string }>(`SELECT name FROM employees WHERE id = $1`, [
      target.id,
    ]);
    assert.equal(rows.rows[0].name, 'منتسب معدّل', 'المرفوض لم يعدّل السجل');
  });

  // ── الكتب: نفي §10.2 الصريح للمدير ───────────────────────────────

  it('الكتب: إنشاء وتعديل — admin مسموح · director مرفوض صراحةً (§10.2) · employee مرفوض', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');

    useTestSession(admin.token);
    const created = await newTransaction(suite.context);
    const patch = { subject: 'كتاب معدّل', expectedVersion: created.version };
    const allowed = await patchJson(baseUrl, `/api/transactions/${created.id}`, patch);
    assert.equal(allowed.status, 200, 'admin يعدّل الكتاب (§10.1)');

    useTestSession(director.token);
    assertDenied(
      await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
        number: '١٠١/ص',
        sequence: '٩٠١',
        date: '2026-09-10',
        direction: 'صادر',
        category: 'إدارية',
        subType: 'تعميم',
        entity: 'إدارة المركز',
        subject: 'محاولة مدير',
        status: 'قيد المراجعة',
      }),
      'director create transaction',
    );
    assertDenied(
      await patchJson<ApiErrorBody>(baseUrl, `/api/transactions/${created.id}`, patch),
      'director update transaction',
    );

    useTestSession(employee.token);
    assertDenied(
      await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
        number: '١٠٢/ص',
        sequence: '٩٠٢',
        date: '2026-09-10',
        direction: 'صادر',
        category: 'إدارية',
        subType: 'تعميم',
        entity: 'إدارة المركز',
        subject: 'محاولة منتسب',
        status: 'قيد المراجعة',
      }),
      'employee create transaction',
    );
    assertDenied(
      await patchJson<ApiErrorBody>(baseUrl, `/api/transactions/${created.id}`, patch),
      'employee update transaction',
    );
  });

  // ── delete/archive: عائلة الحذف على روابط العلاقة ────────────────

  it('delete/archive: حذف رابط — admin مسموح · director/employee مرفوض', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');

    useTestSession(admin.token);
    const target = await newEmployee(suite.context);
    await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: target.id, relationshipType: 'subject' }],
    });
    const links = await getJson<{ id: string }[]>(
      baseUrl,
      `/api/transaction-employees?employeeId=${target.id}`,
    );
    assert.equal(links.status, 200);
    const linkId = links.body[0].id;

    useTestSession(director.token);
    assertDenied(
      await requestWithToken<ApiErrorBody>(baseUrl, `/api/transaction-employees/${linkId}`, {
        method: 'DELETE',
        token: director.token,
      }),
      'director delete',
    );
    useTestSession(employee.token);
    assertDenied(
      await requestWithToken<ApiErrorBody>(baseUrl, `/api/transaction-employees/${linkId}`, {
        method: 'DELETE',
        token: employee.token,
      }),
      'employee delete',
    );

    // الرابط باقٍ بعد محاولتي الحذف المرفوضتين (يُقرأ بطلب admin لرؤية الكتاب كاملاً).
    useTestSession(admin.token);
    const still = await getJson<{ id: string }[]>(
      baseUrl,
      `/api/transaction-employees?employeeId=${target.id}`,
    );
    assert.equal(still.body.length, 1, 'المرفوض لم يحذف');

    const allowed = await requestWithToken(baseUrl, `/api/transaction-employees/${linkId}`, {
      method: 'DELETE',
      token: admin.token,
    });
    assert.equal(allowed.status, 204, 'admin يحذف سطر العلاقة (§10.1)');
  });

  // ── شؤون المنتسبين والموقف اليومي: البيانات الوظيفية للمسؤول ────

  it('شؤون المنتسبين والموقف اليومي: كتابة admin وحده', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');
    useTestSession(admin.token);
    const subject = await newEmployee(suite.context);
    const leave = {
      employeeId: subject.id,
      type: 'annual',
      startDate: '2026-08-16',
      endDate: '2026-08-20',
      days: 5,
      status: 'approved',
    };
    const situation = {
      employeeId: subject.id,
      date: '2026-09-10',
      category: 'permanent_leaves',
      reason: 'إجازة اختبار المصفوفة',
    };

    useTestSession(admin.token);
    const leaveAllowed = await newPersonnelRecord(suite.context, '/api/leaves', leave);
    assert.ok(leaveAllowed);
    const situationAllowed = await postJson(baseUrl, '/api/daily-situations', situation);
    assert.equal(situationAllowed.status, 201, 'admin يسجّل الموقف اليومي (§10.1)');

    for (const actor of [director, employee]) {
      useTestSession(actor.token);
      assertDenied(
        await postJson<ApiErrorBody>(baseUrl, '/api/leaves', leave),
        `${actor.role} create leave`,
      );
      assertDenied(
        await postJson<ApiErrorBody>(baseUrl, '/api/daily-situations', situation),
        `${actor.role} create situation`,
      );
    }
  });

  // ── عائلتا الإدارة: manage accounts و manage security (§11.7/§11.8) ──

  it('manage accounts: إعادة الضبط الإدارية — admin مسموح · director/employee مرفوض', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');
    const target = await newRegisteredAccount(suite.context, {
      badgeNumber: 'T-RB1',
      phone: '07720000001',
      secret: 'Target-Secret-1',
    });

    useTestSession(director.token);
    assertDenied(
      await postJson<ApiErrorBody>(
        baseUrl,
        `/api/auth/accounts/${target.account.id}/reset`,
        undefined,
      ),
      'director reset',
    );
    useTestSession(employee.token);
    assertDenied(
      await postJson<ApiErrorBody>(
        baseUrl,
        `/api/auth/accounts/${target.account.id}/reset`,
        undefined,
      ),
      'employee reset',
    );

    useTestSession(admin.token);
    const allowed = await postJson<{ temporarySecret: string }>(
      baseUrl,
      `/api/auth/accounts/${target.account.id}/reset`,
      undefined,
    );
    assert.equal(allowed.status, 200, 'admin يعيد الضبط (§10.1/§11.7)');
    assert.ok(allowed.body.temporarySecret.length > 0);
  });

  it('manage security: كشف الرمز السري — admin مسموح · director/employee مرفوض', async () => {
    const admin = await actorWithRole('admin');
    const director = await actorWithRole('director');
    const employee = await actorWithRole('employee');

    useTestSession(director.token);
    assertDenied(
      await getJson<ApiErrorBody>(baseUrl, `/api/auth/accounts/${employee.account.id}/secret`),
      'director reveal',
    );
    useTestSession(employee.token);
    assertDenied(
      await getJson<ApiErrorBody>(baseUrl, `/api/auth/accounts/${employee.account.id}/secret`),
      'employee reveal',
    );

    useTestSession(admin.token);
    const allowed = await getJson<{ secret: string }>(
      baseUrl,
      `/api/auth/accounts/${employee.account.id}/secret`,
    );
    assert.equal(allowed.status, 200, 'admin يكشف الرمز (§11.8)');
    assert.equal(allowed.body.secret, SECRET, 'الرمز المقروء يطابق المخزّن');
  });

  // ── الفصل بين المصادقة والتفويض: 401 مقابل 403 ──────────────────

  it('401 بلا جلسة · 403 بجلسة دون صلاحية — وحتى عبر استدعاء API مباشر', async () => {
    const employee = await actorWithRole('employee');
    const target = await newRegisteredAccount(suite.context, {
      badgeNumber: 'T-RB2',
      phone: '07720000002',
      secret: 'Target-Secret-2',
    });
    const writePath = '/api/employees';
    const adminPath = `/api/auth/accounts/${target.account.id}/secret`;

    // بلا هوية: مصادقة فاشلة — 401 في المسارين معاً.
    // `useTestSession(null)` ضروري: رفعة الاختبارات المحقونة تُرسل في كل
    // طلب، ومن يختبر الغياب يجب أن يمحوها صراحةً.
    useTestSession(null);
    for (const path of [writePath, adminPath]) {
      const anonymous = await requestWithToken<ApiErrorBody>(baseUrl, path, { method: 'POST' });
      assert.equal(anonymous.status, 401, `${path} بلا جلسة ⇒ 401`);
      assert.equal(anonymous.body?.error?.code, 'AUTHENTICATION_REQUIRED');
    }

    // بجلسة صحيحة دون صلاحية: تفويض مرفوض — 403 وليس 401.
    const directWrite = await requestWithToken<ApiErrorBody>(baseUrl, writePath, {
      method: 'POST',
      token: employee.token,
      body: { name: 'تجاوز مباشر', title: 'x', department: 'y' },
    });
    assert.equal(directWrite.status, 403, 'استدعاء الكتابة المباشر يُرفض على الخادم');
    assert.equal(directWrite.body?.error?.code, 'PERMISSION_DENIED');

    const directAdmin = await requestWithToken<ApiErrorBody>(baseUrl, adminPath, {
      method: 'GET',
      token: employee.token,
    });
    assert.equal(directAdmin.status, 403, 'استدعاء الإدارة المباشر يُرفض على الخادم');
    assert.equal(directAdmin.body?.error?.code, 'PERMISSION_DENIED');
  });

  it('الخدمات الذاتية تبقى متاحة لكل دور — لا منع زائد عن الخطة', async () => {
    const employee = await actorWithRole('employee');
    useTestSession(employee.token);
    const me = await getJson<{ userId: string }>(baseUrl, '/api/auth/me');
    assert.equal(me.status, 200, 'جلستي مفتوحة لصاحبها');
    const logout = await postJson(baseUrl, '/api/auth/logout', undefined);
    assert.equal(logout.status, 204, 'تسجيل الخروج ذاتي بلا صلاحية خاصة');
  });

  it('الدور الموروث archivist: محفوظ في البيانات ومغلق في الصلاحيات', async () => {
    // قيمة موروثة من قيد CHECK في Phase 9 — لا نحذفها من القاعدة، ولا
    // مصفوفة الخطة (§28) تعترف بها، فالرفض fail-closed إلى أن تحسم
    // الخطة مصيرها (مصيرها قرار وظيفي غير محسوم — موثّق في التقرير).
    const { account } = await newRegisteredAccount(suite.context, {
      badgeNumber: 'ARC-1',
      phone: '07730000001',
      secret: SECRET,
    });
    await setAccountRole(suite.context, account.id, 'archivist');
    const { sessionToken } = await (async (): Promise<{ sessionToken: string }> => {
      const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
        identifier: 'ARC-1',
        secret: SECRET,
      });
      assert.equal(login.status, 200);
      return { sessionToken: login.body.sessionToken };
    })();
    useTestSession(sessionToken);

    const stored = await pool.query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [
      account.id,
    ]);
    assert.equal(stored.rows[0].role, 'archivist', 'القيمة التاريخية باقية كما هي');

    assertDenied(
      await getJson<ApiErrorBody>(baseUrl, '/api/employees'),
      'archivist view (fail-closed)',
    );
    assertDenied(
      await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
        name: 'محاولة',
        title: 'x',
        department: 'y',
      }),
      'archivist create',
    );
    assertDenied(
      await postJson<ApiErrorBody>(baseUrl, `/api/auth/accounts/${account.id}/reset`, undefined),
      'archivist reset',
    );
  });
});

