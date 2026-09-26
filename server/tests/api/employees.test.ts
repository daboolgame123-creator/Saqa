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
import { newEmployee, readMany, readOne, updateOne, type EmployeeBody } from './apiTestData';
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

  it('القائمة تُعيد كل السجلات وتقبل تصفية الحالة', async () => {
    await newEmployee(suite.context, { name: 'نشط' });
    assert.equal((await readMany<EmployeeBody>(suite.context, '/api/employees')).length, 1);
    assert.equal(
      (await readMany<EmployeeBody>(suite.context, '/api/employees?status=active')).length,
      1,
    );
    assert.equal(
      (await readMany<EmployeeBody>(suite.context, '/api/employees?status=former')).length,
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
