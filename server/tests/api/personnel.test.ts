/**
 * اختبارات الـAPI — شؤون المنتسبين (Phase 10، بند 5 · Phase 18: مع المحرك).
 *
 * الكيانات الأربعة مستقلة، وكلٌّ منها يُختبر بـround-trip + رفض القيم
 * خارج المعتمد.
 *
 * Phase 18: استجابة الإجازة والزمنية صارت `{ record, balance, … }` لأن
 * المحرك على الخادم هو من يحسب الرصيد (§34)، فلا تُحاكى القيم في الواجهة.
 * اختبارات القواعد نفسها في `leaveRules.test.ts`.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  newPersonnelRecord,
  readOne,
  updateOne,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase 10 — API: شؤون المنتسبين', () => {
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

  it('الإجازات: round-trip مع الرصيد في الاستجابة (Phase 18)', async () => {
    const employee = await newEmployee(suite.context);
    const created = await newPersonnelRecord<{
      leave: { id: string; type: string; status: string };
      balance: { annualBalance: number; unpaidDays: number } | null;
    }>(suite.context, '/api/leaves', {
      employeeId: employee.id,
      type: 'annual',
      startDate: '2026-08-16',
      endDate: '2026-08-20',
      days: 5,
      status: 'approved',
    });
    assert.equal(created.leave.type, 'annual');
    // الرصيد الافتتاحي صفر ⇒ الأيام كلها بدون راتب (§14.10) بلا رفض.
    assert.equal(created.balance?.annualBalance, 0);
    assert.equal(created.balance?.unpaidDays, 5);

    const read = await readOne<{ leave: { days?: number } }>(
      suite.context,
      `/api/leaves/${created.leave.id}`,
    );
    assert.equal(read.leave.days, 5);

    const patched = await updateOne<{ leave: { status: string } }>(
      suite.context,
      `/api/leaves/${created.leave.id}`,
      { status: 'cancelled' },
    );
    assert.equal(patched.leave.status, 'cancelled', 'الإلغاء عبر PATCH ينشئ حركة عكسية');
  });

  it('الزمنيات: round-trip مع المدة **المحسوبة** بالدقائق (الخطة §14.3)', async () => {
    const employee = await newEmployee(suite.context);
    // Phase 18: `durationMinutes` لم يعد حقل إدخال — المدة محسوبة من
    // `timeOut`/`timeIn` ومخزَّنة (مصدر حقيقة واحد)، والإرسال محرَّم.
    const created = await newPersonnelRecord<{
      record: { id: string; timeOut: string; durationMinutes?: number };
      balance: { emergencyRemainderMinutes: number } | null;
      coveredEmergencyDays: number;
    }>(suite.context, '/api/time-permissions', {
      employeeId: employee.id,
      date: '2026-09-08',
      timeOut: '10:30',
      timeIn: '13:00',
      status: 'registered',
    });
    assert.equal(created.record.timeOut, '10:30');
    assert.equal(created.record.durationMinutes, 150, 'المدة محسوبة ومخزّنة بالدقائق');
    // 150 دقيقة < 420 ⇒ لا يوم طارئ، والباقي محفوظ كـremainder.
    assert.equal(created.coveredEmergencyDays, 0);
    assert.equal(created.balance?.emergencyRemainderMinutes, 150);
  });

  it('إرسال durationMinutes من العميل مرفوض: المدة محسوبة لا مرسلة (§14.3)', async () => {
    const employee = await newEmployee(suite.context);
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/time-permissions', {
      employeeId: employee.id,
      date: '2026-09-09',
      timeOut: '10:30',
      timeIn: '13:00',
      durationMinutes: 150,
      status: 'registered',
    });
    assert.equal(response.status, 400);
  });

  it('وقت غير صالح بصيغة HH:mm يُرفض', async () => {
    const employee = await newEmployee(suite.context);
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/time-permissions', {
      employeeId: employee.id,
      date: '2026-09-08',
      timeOut: '25:99',
      status: 'registered',
    });
    assert.equal(response.status, 400);
  });

  it('التكليفات: round-trip', async () => {
    const employee = await newEmployee(suite.context);
    const created = await newPersonnelRecord<{ id: string; type: string }>(
      suite.context,
      '/api/assignments',
      {
        employeeId: employee.id,
        type: 'delegation',
        entity: 'إدارة المركز',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        status: 'registered',
      },
    );
    assert.equal(created.type, 'delegation');
  });

  it('الدورات: round-trip — startDate اختياري عمداً', async () => {
    const employee = await newEmployee(suite.context);
    const created = await newPersonnelRecord<{ id: string; name: string; startDate?: string }>(
      suite.context,
      '/api/courses',
      {
        employeeId: employee.id,
        name: 'دورة اختبار',
        organizer: 'جهة',
        participationType: 'participant',
        participationStatus: 'completed',
      },
    );
    assert.equal(created.name, 'دورة اختبار');
    assert.equal(created.startDate, undefined, 'تاريخ البداية يبقى غائباً');
  });

  it('نوع مشاركة أو نوع إجازة خارج القيم المعتمدة يُرفض', async () => {
    const employee = await newEmployee(suite.context);
    const badCourse = await postJson<ApiErrorBody>(baseUrl, '/api/courses', {
      employeeId: employee.id,
      name: 'د',
      organizer: 'ج',
      participationType: 'مخترع',
      participationStatus: 'registered',
    });
    assert.equal(badCourse.status, 400);

    const badLeave = await postJson<ApiErrorBody>(baseUrl, '/api/leaves', {
      employeeId: employee.id,
      type: 'مخترع',
      startDate: '2026-08-16',
      endDate: '2026-08-20',
      status: 'approved',
    });
    assert.equal(badLeave.status, 400);
  });

  it('لا مسار حذف لسجلات شؤون المنتسبين', async () => {
    const response = await deleteJson<ApiErrorBody>(baseUrl, '/api/leaves/any-id');
    assert.equal(response.status, 404);
  });
});
