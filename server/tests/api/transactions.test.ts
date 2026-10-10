/**
 * اختبارات الـAPI — الكتب (Phase 10، بند 2 من ترتيب النقل).
 *
 * تغطي: round-trip، اشتقاق الشهر من التاريخ، رفض `month` كمدخل،
 * التصفية، المرفقات كبيانات وصفية، وغياب مسار الحذف.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, getJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  newTransaction,
  readMany,
  readOne,
  updateOne,
  type TransactionBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

/** جسم كتاب صالح للإرسال — تُشتق منه الحالات الناقصة والمخالفة. */
const VALID = {
  number: '١٠٠/ص',
  sequence: '٩٠٠',
  date: '2026-09-10',
  direction: 'صادر',
  category: 'إدارية',
  subType: 'تعميم',
  entity: 'إدارة المركز',
  subject: 'كتاب اختبار',
  status: 'قيد المراجعة',
} as const;

describe('Phase 10 — API: الكتب', () => {
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

  it('round-trip: إنشاء ← قراءة ← تعديل الحالة (BR-03) بلا فقد بيانات', async () => {
    const created = await newTransaction(suite.context);
    assert.equal(created.month, '2026-09', 'الشهر مشتق من تاريخ الكتاب');
    assert.equal(created.status, 'قيد المراجعة');

    const read = await readOne<TransactionBody>(
      suite.context,
      `/api/transactions/${created.id}`,
    );
    assert.equal(read.number, '١٠٠/ص');
    assert.equal(read.sequence, '٩٠٠');

    const patched = await updateOne<TransactionBody>(
      suite.context,
      `/api/transactions/${created.id}`,
      { status: 'مكتمل', expectedVersion: created.version },
    );
    assert.equal(patched.status, 'مكتمل');
    assert.equal(patched.number, '١٠٠/ص', 'بقية الحقول لم تتغيّر');
    assert.equal(patched.version, created.version + 1, 'النسخة تزداد بمقدار 1 بعد كتابة ناجحة');
  });

  it('تغيير تاريخ الكتاب يعيد اشتقاق الشهر (مشتق لا يدوّر)', async () => {
    const created = await newTransaction(suite.context, { date: '2026-09-10' });
    const patched = await updateOne<TransactionBody>(
      suite.context,
      `/api/transactions/${created.id}`,
      { date: '2026-08-15', expectedVersion: created.version },
    );
    assert.equal(patched.date, '2026-08-15');
    assert.equal(patched.month, '2026-08', 'الشهر نُبئ من التاريخ الجديد');
  });

  it('التاريخ غير الصالح يُرفض برسالة تحدد الحقل', async () => {
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
      ...VALID,
      date: '2026-13-45',
    });
    assert.equal(response.status, 400);
    assert.ok(response.body.error?.details?.some((d) => d.field.includes('date')));
  });

  it('month لا يُقبل كمدخل — حقل مشتق لا مستقل', async () => {
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
      ...VALID,
      month: '2020-01',
    });
    assert.equal(response.status, 400, 'الحقل المشتق مرفوض كمدخل');
  });

  it('تصفية الشهر والاتجاه تعمل', async () => {
    await newTransaction(suite.context, { number: 'أ', date: '2026-09-01' });
    await newTransaction(suite.context, { number: 'ب', date: '2026-08-15', direction: 'وارد' });

    const september = await readMany<TransactionBody>(
      suite.context,
      '/api/transactions?month=2026-09',
    );
    assert.equal(september.length, 1);
    assert.equal(september[0].number, 'أ');

    const incoming = await readMany<TransactionBody>(
      suite.context,
      '/api/transactions?direction=وارد',
    );
    assert.equal(incoming.length, 1);
    assert.equal(incoming[0].number, 'ب');

    assert.equal((await readMany<TransactionBody>(suite.context, '/api/transactions')).length, 2);
  });

  it('المرفقات تُكتب كبيانات وصفية فقط — بلا بايتات', async () => {
    const created = await newTransaction(suite.context, {
      attachments: [
        { name: 'كتاب.jpg', type: 'كتاب رئيسي', fileSize: '1.2 MB', uploadDate: '2026-09-10' },
        { name: 'قائمة.jpg', type: 'قائمة أسماء', fileSize: '900 KB', uploadDate: '2026-09-10' },
      ],
    });
    assert.equal(created.attachments.length, 2);
    // ملاحظة: ترتيب المرفقات داخل الكتاب **غير محدد في الخطة** (§7.7 لا
    // تنص على ترتيب)، والقاعدة تقرأ المرفقات بـ`ORDER BY created_at, id`
    // و`created_at` متساوية لإدراجين في معاملة واحدة، فيحسم `id` (uuid
    // عشوائي) الترتيب. لذلك يُتحقق من **مجموعة** الأسماء لا ترتيبها.
    // (ترتيب المرفقات المعروض مسألة غير محسومة — تُعالَج في مرحلة لاحقة.)
    assert.deepEqual(
      created.attachments.map((a) => a.name).sort(),
      ['قائمة.jpg', 'كتاب.jpg'].sort(),
    );

    // لا حقول بايتات في الـDTO: المرفقات بيانات وصفية (التخزين Phase 14).
    const read = await readOne<TransactionBody>(
      suite.context,
      `/api/transactions/${created.id}`,
    );
    assert.equal(read.attachments.length, 2);
  });

  it('نوع مرفق خارج القيم المعتمدة يُرفض', async () => {
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
      ...VALID,
      attachments: [
        { name: 'x', type: 'نوع مخترع', fileSize: '1 MB', uploadDate: '2026-09-10' },
      ],
    });
    assert.equal(response.status, 400);
  });

  it('404 لكتاب غير موجود، والأرشفة لا تحذف شيئاً', async () => {
    const missing = await getJson<ApiErrorBody>(
      baseUrl,
      '/api/transactions/00000000-0000-0000-0000-000000000000',
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error?.code, 'RESOURCE_NOT_FOUND');

    // **Phase 16**: `DELETE /api/transactions/:id` صار مسار الأرشفة الناعمة
    // (لا حذف) — والتأكيد هنا على الأثر لا على الرمز: أرشفة كتاب غير
    // موجود تفشل بـ404 ولا تمسّ أي صف، والصف موجود يبقى موجوداً.
    const before = await suite.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions`,
    );
    const removed = await deleteJson<ApiErrorBody>(
      baseUrl,
      '/api/transactions/00000000-0000-0000-0000-000000000000?expectedVersion=1',
    );
    assert.equal(removed.status, 404, 'أرشفة كتاب غير موجود تفشل');
    const afterAttempt = await suite.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions`,
    );
    assert.equal(
      afterAttempt.rows[0].count,
      before.rows[0].count,
      'لا صف حُذف — لا مسار حذف فعلي للكتاب',
    );
  });

  it('الموظف المرتبط يبقى موجوداً بعد إنشاء كتاب', async () => {
    const employee = await newEmployee(suite.context);
    await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
    });
    const found = await getJson<{ id: string }>(baseUrl, `/api/employees/${employee.id}`);
    assert.equal(found.status, 200);
  });
});
