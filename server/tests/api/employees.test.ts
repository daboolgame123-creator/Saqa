/**
 * اختبارات الـAPI — الموظفون (Phase 10، بند 1 من ترتيب النقل).
 *
 * round-trip كامل + تصفية + نقل الحالة (لا حذف — الخطة §32) + رفض
 * الحقول غير المعروفة. كل البيانات اصطناعية داخل قاعدة معزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, getJson, patchJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  readMany,
  readOne,
  updateOne,
  type EmployeeBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase 10 — API: الموظفون', () => {
  let suite: ApiTestSuite;
  let baseUrl: string;

  before(async () => {
    suite = await startApiSuite();
    baseUrl = suite.baseUrl;
  });

  after(async () => {
    await stopApiSuite(suite);
  });

  beforeEach(async () => {
    await resetDomainTables(suite.pool);
    // Phase 11: مسارات /api/* كلها تتطلب جلسة صالحة فنبني حسابا
    // حقيقيا عبر تدفق التسجيل والدخول الكامل قبل كل اختبار.
    await newAuthenticatedAccount(suite.context);
  });

  it('round-trip: إنشاء ← قراءة ← تعديل ← قراءة بلا فقد بيانات', async () => {
    const created = await newEmployee(suite.context, {
      badgeNumber: 'T-500',
      category: 'منتسب',
      joinedDate: '2025-09-01',
    });
    assert.match(created.id, /^[0-9a-f-]{36}$/, 'المعرّف UUID تولّدته القاعدة');
    assert.equal(created.status, 'active', 'الحالة الافتراضية active');
    assert.equal(created.badgeNumber, 'T-500');
    assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/, 'توقيت النظام بصيغة ISO');

    const read = await readOne<EmployeeBody>(
      suite.context,
      `/api/employees/${created.id}`,
    );
    assert.equal(read.name, created.name);
    assert.equal(read.department, created.department);

    const patched = await updateOne<EmployeeBody>(
      suite.context,
      `/api/employees/${created.id}`,
      { title: 'أخصائي' },
    );
    assert.equal(patched.title, 'أخصائي');
    assert.equal(patched.name, created.name, 'الحقول غير المُرسلة لم تتغيّر');
  });

  it('إنشاء وتعديل حالة المنتسب خارج مسار /status مرفوضان بلا تغيير تاريخي', async () => {
    const badCreate = await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
      name: 'منتسب لا يُنشأ كسابق', title: 'معاون', department: 'قسم الاختبار', status: 'former',
    });
    assert.equal(badCreate.status, 400, 'إنشاء موظف سابق بدون سبب وتاريخ ممنوع');
    assert.equal(badCreate.body.error?.code, 'VALIDATION_ERROR');

    const active = await newEmployee(suite.context, { name: 'منتسب يظل نشطاً' });
    for (const status of ['former', 'active']) {
      const bypass = await patchJson<ApiErrorBody>(
        baseUrl, `/api/employees/${active.id}`, { status },
      );
      assert.equal(bypass.status, 400, 'PATCH العام لا يغير الحالة');
      assert.equal(bypass.body.error?.code, 'VALIDATION_ERROR');
    }
    const unchanged = await readOne<EmployeeBody>(suite.context, `/api/employees/${active.id}`);
    assert.equal(unchanged.status, 'active');
    assert.equal(
      (await readOne<unknown[]>(suite.context, `/api/employees/${active.id}/status-history`)).length,
      0,
    );
    assert.equal(
      (await readMany<EmployeeBody>(suite.context, '/api/employees?search=منتسب لا يُنشأ كسابق')).length,
      0,
    );

    const moved = await postJson<EmployeeBody>(
      baseUrl, `/api/employees/${active.id}/status`,
      { status: 'former', serviceEndReason: 'تقاعد' },
    );
    assert.equal(moved.status, 200);
    assert.equal(moved.body.status, 'former');
    const historical = await readOne<{ status: string; serviceEndReason: string }[]>(
      suite.context, `/api/employees/${active.id}/status-history`,
    );
    assert.equal(historical.length, 1);
    assert.equal(historical[0].serviceEndReason, 'تقاعد');
  });

  it('لا يجوز سرقة ربط حساب نشط من منتسب آخر عبر إنشاء/تعديل السجل', async () => {
    const account = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'P2-ACC-2', phone: '07700000002',
    });
    const target = await newEmployee(suite.context, { name: 'المنتسب الثاني' });

    const moved = await patchJson<ApiErrorBody>(
      baseUrl, `/api/employees/${target.id}`, { userId: account.account.id },
    );
    assert.equal(moved.status, 409);
    assert.equal(moved.body.error?.code, 'EMPLOYEE_ACCOUNT_LINK_CONFLICT');

    const created = await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
      name: 'منتسب لا يُنشأ بسبب سرقة الحساب', title: 'موظف', department: 'قسم',
      userId: account.account.id,
    });
    assert.equal(created.status, 409);
    assert.equal(created.body.error?.code, 'EMPLOYEE_ACCOUNT_LINK_CONFLICT');

    const owner = await readOne<{ userId?: string }>(
      suite.context, `/api/employees/${account.employee.id}`,
    );
    assert.equal(owner.userId, account.account.id);
    const stillUnlinked = await readOne<{ userId?: string }>(
      suite.context, `/api/employees/${target.id}`,
    );
    assert.equal(stillUnlinked.userId, undefined);
    assert.equal(
      (await readMany<EmployeeBody>(
        suite.context, '/api/employees?search=منتسب لا يُنشأ بسبب سرقة الحساب',
      )).length,
      0,
    );
  });

  it('الربط بحساب غير موجود يعيد 404 دون إنشاء ملف منتسب يتيم', async () => {
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
      name: 'بيانات بلا حساب', title: 'موظف', department: 'قسم',
      userId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(response.status, 404);
    assert.equal(response.body.error?.code, 'ACCOUNT_LINK_NOT_FOUND');
    assert.equal(
      (await readMany<EmployeeBody>(suite.context, '/api/employees?search=بيانات بلا حساب')).length,
      0,
    );
  });

  it('القائمة تُعيد كل السجلات وتقبل تصفية الحالة', async () => {
    await newEmployee(suite.context, { name: 'نشط' });
    // Phase 11: كل اختبار يعمل خلف حساب حقيقي، و`newAuthenticatedAccount`
    // يزرع موظفاً واحداً (صاحب الحساب) قبل الاختبار. لذلك يُقاس العدد على
    // **ما يضيفه الاختبار نفسه** عبر بحث بالاسم بدل العدد المطلق — فيبقى
    // المقصود من الاختبار (الترشيح بالحالة) واضحاً وغير متأثر ببذور المصادقة.
    const listed = await readMany<EmployeeBody>(suite.context, '/api/employees?search=نشط');
    assert.equal(listed.length, 1, 'العامل المُضاف يظهر في القائمة العامة');

    assert.equal(
      (await readMany<EmployeeBody>(suite.context, '/api/employees?search=نشط&status=active')).length,
      1,
      'وهو في تصفية النشِط',
    );
    assert.equal(
      (await readMany<EmployeeBody>(suite.context, '/api/employees?search=نشط&status=former')).length,
      0,
      'لا موظف سابق بعد',
    );
  });

  it('البحث الجزئي في الاسم يعمل', async () => {
    await newEmployee(suite.context, { name: 'محمد المختبر' });
    await newEmployee(suite.context, { name: 'سارة المختبرة' });
    const found = await readMany<EmployeeBody>(suite.context, '/api/employees?search=محمد');
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'محمد المختبر');
  });

  it('نقل الحالة إلى «موظف سابق» يستلزم سبب انتهاء خدمة معتمداً (الخطة §13)', async () => {
    const employee = await newEmployee(suite.context);

    const withoutReason = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/employees/${employee.id}/status`,
      { status: 'former' },
    );
    assert.equal(withoutReason.status, 400);
    assert.equal(withoutReason.body.error?.code, 'VALIDATION_ERROR');
    assert.ok(
      withoutReason.body.error?.details?.some((d) => d.field.includes('serviceEndReason')),
      'الرسالة تذكر الحقل الناقص',
    );

    const withReason = await postJson<EmployeeBody>(
      baseUrl,
      `/api/employees/${employee.id}/status`,
      { status: 'former', serviceEndReason: 'تقاعد' },
    );
    assert.equal(withReason.status, 200);
    assert.equal(withReason.body.status, 'former');
  });

  it('تكرار طلب الحالة نفسها لا ينشئ سجلاً تاريخياً ثانياً', async () => {
    const employee = await newEmployee(suite.context);
    const first = await postJson<EmployeeBody>(
      baseUrl, `/api/employees/${employee.id}/status`,
      { status: 'former', serviceEndReason: 'تقاعد' },
    );
    assert.equal(first.status, 200);

    const repeated = await postJson<ApiErrorBody>(
      baseUrl, `/api/employees/${employee.id}/status`,
      { status: 'former', serviceEndReason: 'تقاعد' },
    );
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.error?.code, 'EMPLOYEE_STATUS_UNCHANGED');

    const history = await readOne<{ id: string; status: string }[]>(
      suite.context, `/api/employees/${employee.id}/status-history`,
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'former');
  });

  it('سبب انتهاء خدمة خارج القيم المعتمدة يُرفض', async () => {
    const employee = await newEmployee(suite.context);
    const response = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/employees/${employee.id}/status`,
      { status: 'former', serviceEndReason: 'سبب مخترع' },
    );
    assert.equal(response.status, 400);
  });

  it('سجل التغييرات يُسجَّل عند النقل ويبقى قابلاً للقراءة', async () => {
    const employee = await newEmployee(suite.context);
    await postJson(baseUrl, `/api/employees/${employee.id}/status`, {
      status: 'former',
      serviceEndReason: 'استقالة',
    });
    const history = await readOne<{ status: string; serviceEndReason: string }[]>(
      suite.context,
      `/api/employees/${employee.id}/status-history`,
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'former');
    assert.equal(history[0].serviceEndReason, 'استقالة');
  });

  it('404 لموظف غير موجود', async () => {
    const missing = await getJson<ApiErrorBody>(
      baseUrl,
      '/api/employees/00000000-0000-0000-0000-000000000000',
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  it('التحقق يرفض الحقول الناقصة والزائدة والقيم غير المعروفة', async () => {
    const missingName = await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
      title: 'بدون اسم',
      department: 'قسم',
    });
    assert.equal(missingName.status, 400);
    assert.ok(missingName.body.error?.details?.some((d) => d.field.includes('name')));

    const unknownField = await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
      name: 'س',
      title: 'ع',
      department: 'ق',
      غيرمعروف: 'x',
    });
    assert.equal(unknownField.status, 400, 'الحقل الزائد مرفوض');

    const badStatus = await patchJson<ApiErrorBody>(baseUrl, '/api/employees/any', {
      status: 'محذوف',
    });
    assert.equal(badStatus.status, 400, 'قيمة الحالة غير معروفة مرفوضة');
  });

  it('لا يوجد مسار حذف للموظف — الخطة §32 تمنعه', async () => {
    const response = await deleteJson<ApiErrorBody>(baseUrl, '/api/employees/any-id');
    assert.equal(response.status, 404, 'المسار غير موجود أصلاً — لا حذف للموظف');
  });
});
