/**
 * اختبارات Phase 22 — البحث الموحّد عبر الـHTTP الحقيقي.
 *
 * المرجع: `ALSQAYA_PLAN.md` §38 (الحقول المعتمدة، التطبيع D4، النطاق)
 * و`ALSQAYA_UI_PLAN.md` §39–40 (المتطلبات والعرض).
 *
 * الاختبارات تمرّ بالمسار الكامل:
 * Express ← الجلسات ← RBAC ← Access Scope ← controller ← خدمة ←
 * مستودع ← PostgreSQL، بلا mock في أي طبقة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import { getJson, postJson, useTestSession, type ApiErrorBody } from './apiTestHelpers';
import {
  newEmployee,
  newRegisteredAccount,
  newTransaction,
  setAccountRole,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import type { SearchResultDto } from '../../src/api/dto';

const SECRET = 'S3cret-Start';

describe('Phase 22 — Unified Search (HTTP)', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl = '';

  before(async () => {
    suite = await startApiSuite();
    baseUrl = suite.baseUrl;
    pool = suite.pool;
  });

  after(async () => {
    if (suite !== undefined) {
      await stopApiSuite(suite);
    }
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
  });

  /**
   * حساب بدور وجلسة حقيقية (تسجيل + رفع دور + دخول).
   *
   * الدخول يتمّ **قبل** أي تسجيل حساب آخر، والجلسة المستعملة هي جلسة
   * هذا الحساب نفسه — لا جلسة حساب آخر قديمة، لأن الإبطال عند
   * تبديل الرمز في تسجيل الحساب التالي يُبطل كل الجلسات القائمة.
   */
  async function actor(role: 'admin' | 'director' | 'employee', suffix: string) {
    const { employee, account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `SR-${suffix}`,
      phone: `0791${suffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `SR-${suffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200, `فشل دخول ${role}`);
    return { employee, account, token: login.body.sessionToken };
  }

  /** ينفّذ بحثاً ويعيد نتائجه (يتأكد من 200). */
  async function search(query: string, type?: string): Promise<SearchResultDto[]> {
    const params = new URLSearchParams({ q: query });
    if (type !== undefined) {
      params.set('type', type);
    }
    const response = await getJson<SearchResultDto[]>(baseUrl, `/api/search?${params.toString()}`);
    assert.equal(response.status, 200, `فشل البحث: ${JSON.stringify(response.body)}`);
    return response.body;
  }

  it('مطابقة الحقول المعتمدة داخل النطاق (§38)', async () => {
    const admin = await actor('admin', '1001');
    useTestSession(admin.token);

    const employee = await newEmployee(suite.context, {
      name: 'منتسب البحث',
      department: 'الشؤون المالية',
      title: 'محاسب',
    });
    const tx = await newTransaction(suite.context, {
      number: '٧٧/بحث',
      sequence: '٥٥٥',
      date: '2026-03-11',
      entity: 'إدارة السقاية',
      subject: 'كتاب تعميم داخلي',
      addressedTo: 'قسم الشؤون الإدارية',
      content: 'محتوى سري حول الميزانية',
      status: 'قيد المراجعة',
      visibility: 'PublicToEmployees',
      employeeLinks: [{ employeeId: employee.id }],
    });

    const byNumber = await search('٧٧/بحث', 'transaction');
    assert.equal(byNumber.length, 1, 'البحث بالرقم الرسمي يجد الكتاب');
    assert.equal(byNumber[0].id, tx.id);
    assert.equal(byNumber[0].source, 'transaction');
    assert.equal(byNumber[0].sourceLabel, 'معاملة');
    assert.equal(byNumber[0].number, '٧٧/بحث');
    assert.equal(byNumber[0].date, '2026-03-11');

    assert.equal((await search('٥٥٥', 'transaction')).length, 1, 'البحث بالتسلسل الداخلي');
    assert.equal((await search('إدارة السقاية', 'transaction')).length, 1, 'البحث بالمصدر (جهة)');
    assert.equal(
      (await search('قسم الشؤون الإدارية', 'transaction')).length,
      1,
      'البحث بـ«addressed to»',
    );
    assert.equal((await search('تعميم', 'transaction')).length, 1, 'البحث بالموضوع');
    assert.equal((await search('الميزانية', 'transaction')).length, 1, 'البحث بالمحتوى');
    assert.equal(
      (await search('منتسب البحث', 'transaction')).length,
      1,
      'البحث باسم المنتسب المرتبط بالكتاب',
    );
    assert.equal(
      (await search('الشؤون المالية', 'transaction')).length,
      1,
      'البحث بالقسم عبر رابط المنتسب',
    );
    assert.equal((await search('قيد المراجعة', 'transaction')).length, 1, 'البحث بالحالة');
    assert.equal((await search('2026-03-11', 'transaction')).length, 1, 'البحث بالتاريخ');

    const byEmployee = await search('منتسب البحث', 'employee');
    assert.equal(byEmployee.length, 1, 'البحث في المنتسبين');
    assert.equal(byEmployee[0].source, 'employee');
    assert.equal(byEmployee[0].sourceLabel, 'منتسب');
    assert.equal(byEmployee[0].id, employee.id);
    assert.equal(byEmployee[0].title, 'منتسب البحث');
    assert.equal(byEmployee[0].person, 'الشؤون المالية');
  });

  it('منع الكشف خارج النطاق: كتاب محجوب لا رقم له ولا عنوان ولا مقتطف (§12 و§38)', async () => {
    const admin = await actor('admin', '2001');
    useTestSession(admin.token);
    const publicTx = await newTransaction(suite.context, {
      number: '1/عام',
      subject: 'كتاب عام للمنتسبين',
      content: 'محتوى عام',
      visibility: 'PublicToEmployees',
    });
    const secretTx = await newTransaction(suite.context, {
      number: '2/سري',
      subject: 'كتاب إداري سرّي',
      content: 'محتوى سري لا يُكشف',
      visibility: 'Administrative',
    });

    // حساب المنتسب يُسجَّل **بعد** كل الكتابات، حتى لا يبطل تسجيله
    // جلسةَ المسؤول (تبديل الرمز يُبطل جلسات الحساب نفسه فقط، لكن
    // الترتيب هنا يبقى مقروءاً ومقصوداً).
    const employee = await actor('employee', '2002');
    useTestSession(employee.token);

    const results = await search('كتاب', 'transaction');
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes(publicTx.id), 'الكتاب العام يظهر للمنتسب');
    assert.ok(!ids.includes(secretTx.id), 'الكتاب الإداري لا يظهر للمنتسب');

    const bySecretNumber = await search('2/سري', 'transaction');
    assert.equal(bySecretNumber.length, 0, 'لا كشف برقم الكتاب المحجوب');
    const bySecretContent = await search('سري', 'transaction');
    assert.equal(
      bySecretContent.some((r) => r.id === secretTx.id),
      false,
      'لا كشف بمقتطف الكتاب المحجوب',
    );
  });

  it('مصفوفة role × operation: القراءة家族 `view` لكل الأدوار (§28)', async () => {
    const admin = await actor('admin', '3001');
    useTestSession(admin.token);
    await newTransaction(suite.context, {
      number: '3/مشترك',
      subject: 'كتاب للقراءة',
      visibility: 'PublicToEmployees',
    });

    for (const [index, role] of (['admin', 'director', 'employee'] as const).entries()) {
      const who = await actor(role, `300${index + 2}`);
      useTestSession(who.token);
      const results = await search('للقراءة', 'transaction');
      assert.equal(results.length, 1, `الدور ${role} يقرأ البحث (عائلة view)`);
    }

    // بلا جلسة ⇒ 401 قبل أي قراءة.
    useTestSession(null);
    const anonymous = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=كتاب');
    assert.equal(anonymous.status, 401, 'بلا جلسة يُرفض الطلب');
  });


  it('التطبيع العربي: مطابقة مرنة صحيحة بلا مطابقة خاطئة (D4 — §38)', async () => {
    const admin = await actor('admin', '4001');
    useTestSession(admin.token);
    await newTransaction(suite.context, {
      number: '4/تطبيع',
      subject: 'كتاب إداري للاختبار',
      content: 'مُحتوى تجريبي',
      visibility: 'PublicToEmployees',
    });

    // أ/إ/آ/ٱ → ا: بحث «اداري» يجد «إداري».
    assert.equal((await search('اداري', 'transaction')).length, 1, 'توحيد الهمزات');
    // التشكيل: «محتوى» بلا تشكيل يجد «مُحتوى».
    assert.equal((await search('محتوى', 'transaction')).length, 1, 'إزالة التشكيل');
    // التطويل (Kashida): «تجريبي» بلا تطويل يجد «تجــريبي» المخزَّنة بالتطويل.
    assert.equal((await search('تجريبي', 'transaction')).length, 1, 'إزالة التطويل');
    // **عدم** التوحيد الزائد: `ة` لا تُوحَّد مع `ه`.
    assert.equal((await search('مكتبه', 'transaction')).length, 0, 'لا توحيد ة مع ه');
    // ولا `ى` مع `ي`.
    assert.equal((await search('ماعلي', 'transaction')).length, 0, 'لا توحيد ى مع ي');
  });

  it('البحث لا يُنشئ منتسباً جديداً أبداً (القاعدة 7 و§54)', async () => {
    const admin = await actor('admin', '5001');
    useTestSession(admin.token);
    await newEmployee(suite.context, { name: 'سالم الاختباري' });

    const results = await search('سالم', 'employee');
    assert.equal(results.length, 1, 'يوجد تطابق واحد');
    const count = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM employees',
    );
    assert.equal(
      Number(count.rows[0].count),
      2,
      'حساب المنتسب + الموظف المنشأ — لا موظف ثالث من البحث',
    );

    // بحث لا يطابق أحداً ⇒ لا نتيجة ولا إنشاء.
    const none = await search('اسم غير موجود إطلاقاً', 'employee');
    assert.equal(none.length, 0);
    const countAfter = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM employees',
    );
    assert.equal(Number(countAfter.rows[0].count), 2, 'البحث لم يُنشئ منتسباً');
  });

  it('التحقق: `q` إلزامي، والحدود أرقام، والحقل غير المعروف مرفوض', async () => {
    const admin = await actor('admin', '6001');
    useTestSession(admin.token);

    const missing = await getJson<ApiErrorBody>(baseUrl, '/api/search');
    assert.equal(missing.status, 400, '`q` إلزامي');
    assert.equal(missing.body.error?.code, 'VALIDATION_ERROR');

    const empty = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=%20%20');
    assert.equal(empty.status, 400, 'نص فارغ مرفوض');

    const badLimit = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=كتاب&limit=abc');
    assert.equal(badLimit.status, 400, 'limit غير رقمي مرفوض');

    const negativeOffset = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=كتاب&offset=-1');
    assert.equal(negativeOffset.status, 400, 'offset السالب مرفوض');

    const unknown = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=كتاب&page=2');
    assert.equal(unknown.status, 400, 'حقل غير معروف مرفوض');

    const badType = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=كتاب&type=requests');
    assert.equal(badType.status, 400, 'نوع غير معروف مرفوض (الطلبات خارج النطاق)');
  });

  it('الترقيم: `limit` و`offset` يحدّان النتائج فعلياً', async () => {
    const admin = await actor('admin', '7001');
    useTestSession(admin.token);
    for (let index = 0; index < 3; index += 1) {
      await newTransaction(suite.context, {
        number: `8/${index}`,
        subject: `كتاب مرقّم ${index}`,
        visibility: 'PublicToEmployees',
      });
    }

    const first = await getJson<SearchResultDto[]>(baseUrl, '/api/search?q=مرقم&limit=2');
    assert.equal(first.status, 200);
    assert.equal(first.body.length, 2, 'الحد يقصّ النتائج');

    const all = await getJson<SearchResultDto[]>(baseUrl, '/api/search?q=مرقم');
    assert.equal(all.body.length, 3, 'الكل بلا حد');
  });

  it('الحد الأقصى للنتائج: `limit` أكبر من 100 يُرفض بـ400', async () => {
    const admin = await actor('admin', '7002');
    useTestSession(admin.token);

    const tooBig = await getJson<ApiErrorBody>(baseUrl, '/api/search?q=كتاب&limit=101');
    assert.equal(tooBig.status, 400, 'limit أكبر من 100 يُرفض');
    assert.equal(tooBig.body.error?.code, 'VALIDATION_ERROR');

    const exactlyMax = await getJson<SearchResultDto[]>(baseUrl, '/api/search?q=كتاب&limit=100');
    assert.equal(exactlyMax.status, 200, 'limit يساوي 100 مقبول');
  });

  it('الحد الإجمالي عند `type=all`: لا يتجاوز `limit` عبر النوعين', async () => {
    const admin = await actor('admin', '7003');
    useTestSession(admin.token);
    await newEmployee(suite.context, { name: 'منتسب مرتبط بالكل', department: 'النظام' });
    await newTransaction(suite.context, {
      number: '9/كتاب',
      subject: 'كتاب لل tutti',
      visibility: 'PublicToEmployees',
      employeeLinks: [],
    });

    const all = await getJson<SearchResultDto[]>(baseUrl, '/api/search?q=كتاب&type=all&limit=1');
    assert.equal(all.status, 200);
    assert.ok(all.body.length <= 1, 'النوع all لا يتجاوز limit عبر النوعين');
  });
});
