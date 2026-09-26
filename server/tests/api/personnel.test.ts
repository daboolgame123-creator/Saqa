/**
 * اختبارات الـAPI — شؤون المنتسبين (Phase 10، بند 5).
 *
 * الكيانات الأربعة مستقلة، وكلٌّ منها يُختبر بـround-trip + رفض القيم
 * خارج المعتمد. لا يُختبر هنا أي شرط على الإجازة ولا رصيد: محرك القواعد
 * مرحلة لاحقة (Phase 18)، وهذه المرحلة تنقل السجلات فقط.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import { newEmployee, newPersonnelRecord, readOne, updateOne } from './apiTestData';
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
  });

  it('الإجازات: round-trip', async () => {
    const employee = await newEmployee(suite.context);
    const created = await newPersonnelRecord<{ id: string; type: string }>(
      suite.context,
      '/api/leaves',
      {
        employeeId: employee.id,
        type: 'annual',
        startDate: '2026-08-16',
        endDate: '2026-08-20',
        days: 5,
        status: 'approved',
      },
    );
    assert.equal(created.type, 'annual');

    const read = await readOne<{ days?: number }>(suite.context, `/api/leaves/${created.id}`);
    assert.equal(read.days, 5);

    const patched = await updateOne<{ status: string }>(
      suite.context,
      `/api/leaves/${created.id}`,
      { status: 'cancelled' },
    );
    assert.equal(patched.status, 'cancelled');
  });

  it('الزمنيات: round-trip مع المدة الاختيارية بالدقائق (الخطة §14.3)', async () => {
    const employee = await newEmployee(suite.context);
    const created = await newPersonnelRecord<{ id: string; timeOut: string; durationMinutes?: number }>(
      suite.context,
      '/api/time-permissions',
      {
        employeeId: employee.id,
        date: '2026-09-08',
        timeOut: '10:30',
        timeIn: '13:00',
        durationMinutes: 150,
        status: 'registered',
      },
    );
    assert.equal(created.timeOut, '10:30');
    assert.equal(created.durationMinutes, 150);
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
