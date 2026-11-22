/**
 * اختبارات الـAPI — الخط الزمني (Phase 10، بند 6: قراءة مشتقة).
 *
 * المبدأ الحاكم (الخطة §22 و§7.17): الخط الزمني ناتج مشتق لا جدول.
 * الاختبارات تتحقق من ذلك عملياً: أحداث تُبنى من مصادر أصلية مختلفة،
 * وتُحسب العدّادات، ولا يوجد أي مسار كتابة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, getJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  newPersonnelRecord,
  newTransaction,
  readOne,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

/** شكل استجابة الخط الزمني كما تعيدها الخدمة. */
interface TimelineBody {
  entries: { sourceType: string; description?: string }[];
  countsBySource: Record<string, number>;
  totalCount: number;
}

describe('Phase 10 — API: الخط الزمني', () => {
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

  it('يبني الأحداث من المصادر الأصلية بلا جدول timeline', async () => {
    const employee = await newEmployee(suite.context);
    await newPersonnelRecord(suite.context, '/api/leaves', {
      employeeId: employee.id,
      type: 'annual',
      startDate: '2026-08-16',
      endDate: '2026-08-20',
      status: 'approved',
    });
    await newPersonnelRecord(suite.context, '/api/courses', {
      employeeId: employee.id,
      name: 'دورة خط زمني',
      organizer: 'جهة',
      startDate: '2026-07-01',
      participationType: 'participant',
      participationStatus: 'completed',
    });
    await newTransaction(suite.context, { employeeLinks: [{ employeeId: employee.id }] });

    const timeline = await readOne<TimelineBody>(
      suite.context,
      `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(timeline.totalCount, 3, 'إجازة + دورة + كتاب');
    assert.deepEqual(
      timeline.entries.map((entry) => entry.sourceType).sort(),
      ['course', 'leave', 'transaction'],
    );
    assert.equal(timeline.countsBySource.leave, 1);
    assert.equal(timeline.countsBySource.course, 1);
    assert.equal(timeline.countsBySource.transaction, 1);
  });

  it('المعاملات تدخل عبر الروابط لا عبر الاسم النصي (القاعدة 7)', async () => {
    const employee = await newEmployee(suite.context);
    const unrelated = await newEmployee(suite.context, { name: 'موظف آخر' });
    await newTransaction(suite.context, {
      subject: 'كتاب مرتبط',
      employeeName: employee.name,
      employeeLinks: [{ employeeId: employee.id }],
    });
    await newTransaction(suite.context, {
      subject: 'كتاب غير مرتبط',
      employeeName: unrelated.name,
      employeeLinks: [{ employeeId: unrelated.id }],
    });

    const timeline = await readOne<TimelineBody>(
      suite.context,
      `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(timeline.totalCount, 1, 'كتاب واحد فقط مرتبط بهذا الموظف');
    assert.equal(timeline.entries[0].description, 'كتاب مرتبط');
  });

  it('Phase 7: عدة أدوار على الكتاب لا تكرر الحدث، والكتب غير المرتبطة تُستبعد في SQL', async () => {
    const employee = await newEmployee(suite.context, { name: 'منتسب خط زمني' });
    const unrelatedEmployee = await newEmployee(suite.context, { name: 'منتسب آخر' });
    const linkedBook = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
      subject: 'كتاب ذو دورين',
    });
    const secondRole = await postJson<{ id: string }>(
      baseUrl, '/api/transaction-employees', {
        transactionId: linkedBook.id,
        employeeId: employee.id,
        relationshipType: 'recipient',
      },
    );
    assert.equal(secondRole.status, 201, JSON.stringify(secondRole.body));
    for (let n = 0; n < 15; n++) {
      await newTransaction(suite.context, {
        number: `OUT-${n}`,
        sequence: `OUT-SEQ-${n}`,
        subject: 'كتاب غير مرتبط',
        employeeName: employee.name,
        employeeLinks: [{ employeeId: unrelatedEmployee.id, relationshipType: 'subject' }],
      });
    }

    const timeline = await readOne<TimelineBody>(
      suite.context, `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(timeline.totalCount, 1, 'real relation wins, and multi-role links do not duplicate');
    assert.deepEqual(timeline.entries.map((row) => row.description), ['كتاب ذو دورين']);
    assert.equal(timeline.countsBySource.transaction, 1);
  });

  it('Phase 7: أرشفة الكتاب تُخرجه من الخط الزمني ثم تعيده الاستعادة، بلا تخزين Timeline', async () => {
    const employee = await newEmployee(suite.context);
    const book = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
      subject: 'كتاب قابل للأرشفة',
    });
    const before = await readOne<TimelineBody>(
      suite.context, `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(before.countsBySource.transaction, 1);

    const archived = await deleteJson<{ version: number }>(
      baseUrl, `/api/transactions/${book.id}?expectedVersion=${book.version}`,
    );
    assert.equal(archived.status, 200, JSON.stringify(archived.body));

    const whileArchived = await readOne<TimelineBody>(
      suite.context, `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(whileArchived.countsBySource.transaction, 0);
    assert.equal(whileArchived.totalCount, 0);

    const restore = await postJson<{ version: number }>(
      baseUrl, `/api/transactions/${book.id}/restore?expectedVersion=${archived.body?.version}`,
    );
    assert.equal(restore.status, 200, JSON.stringify(restore.body));

    const after = await readOne<TimelineBody>(
      suite.context, `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(after.totalCount, 1);
    assert.equal(after.entries[0].description, 'كتاب قابل للأرشفة');
  });

  it('الموظف بلا سجلات يعيد خطاً زمنياً فارغاً لا خطأ', async () => {
    const employee = await newEmployee(suite.context);
    const timeline = await readOne<TimelineBody>(
      suite.context,
      `/api/timeline?employeeId=${employee.id}`,
    );
    assert.equal(timeline.totalCount, 0);
    assert.deepEqual(timeline.entries, []);
  });

  it('employeeId إلزامي، و404 لموظف غير موجود', async () => {
    const noEmployee = await getJson<ApiErrorBody>(baseUrl, '/api/timeline');
    assert.equal(noEmployee.status, 400);

    const missing = await getJson<ApiErrorBody>(
      baseUrl,
      '/api/timeline?employeeId=00000000-0000-0000-0000-000000000000',
    );
    assert.equal(missing.status, 404);
  });

  it('مصدر محجوز (غير منفَّذ) يُرفض بدل إرجاع خطأ مخترع', async () => {
    const employee = await newEmployee(suite.context);
    const response = await getJson<ApiErrorBody>(
      baseUrl,
      `/api/timeline?employeeId=${employee.id}&sourceTypes=appointment`,
    );
    assert.equal(response.status, 400, 'appointment مصدر محجوز بلا بيانات');
  });

  it('لا مسار كتابة للخط الزمني (ناتج مشتق — الخطة §22)', async () => {
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/timeline', {});
    assert.equal(response.status, 404);
  });
});
