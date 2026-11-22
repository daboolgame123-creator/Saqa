/**
 * اختبارات الـAPI — الموقف اليومي وشؤون المنتسبين والخط الزمني
 * (Phase 10، البنود 4 و5 و6 من ترتيب النقل).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, getJson, patchJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  newPersonnelRecord,
  newTransaction,
  readMany,
  readOne,
  updateOne,
  type EmployeeBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase 10 — API: الموقف اليومي (BR-13)', () => {
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

  it('round-trip مرتبط بـemployeeId لا بالاسم', async () => {
    const employee = await newEmployee(suite.context);
    const created = await newPersonnelRecord<{ id: string; employeeId: string; category: string }>(
      suite.context,
      '/api/daily-situations',
      {
        employeeId: employee.id,
        date: '2026-09-10',
        category: 'permanent_leaves',
        reason: 'إجازة اعتيادية',
      },
    );
    assert.equal(created.employeeId, employee.id);
    assert.equal(created.category, 'permanent_leaves');

    const read = await readOne<{ reason?: string }>(
      suite.context,
      `/api/daily-situations/${created.id}`,
    );
    assert.equal(read.reason, 'إجازة اعتيادية');

    const patched = await updateOne<{ reason?: string }>(
      suite.context,
      `/api/daily-situations/${created.id}`,
      { reason: 'إجازة معدّلة' },
    );
    assert.equal(patched.reason, 'إجازة معدّلة');
  });

  it('التصفية بالمنتسب والقسم تعمل', async () => {
    const first = await newEmployee(suite.context);
    const second = await newEmployee(suite.context);
    await newPersonnelRecord(suite.context, '/api/daily-situations', {
      employeeId: first.id,
      date: '2026-09-10',
      category: 'permanent_leaves',
    });
    await newPersonnelRecord(suite.context, '/api/daily-situations', {
      employeeId: second.id,
      date: '2026-09-11',
      category: 'permanent_time_permissions',
    });

    const byEmployee = await readMany<unknown>(
      suite.context,
      `/api/daily-situations?employeeId=${first.id}`,
    );
    assert.equal(byEmployee.length, 1);

    const byCategory = await readMany<unknown>(
      suite.context,
      '/api/daily-situations?category=permanent_time_permissions',
    );
    assert.equal(byCategory.length, 1);
  });

  it('قسم غير معروف يُرفض، وغياب الموظف إلزامي', async () => {
    const badCategory = await postJson<ApiErrorBody>(baseUrl, '/api/daily-situations', {
      employeeId: 'a',
      date: '2026-09-10',
      category: 'قسم مخترع',
    });
    assert.equal(badCategory.status, 400);

    const noEmployee = await postJson<ApiErrorBody>(baseUrl, '/api/daily-situations', {
      date: '2026-09-10',
      category: 'permanent_leaves',
    });
    assert.equal(noEmployee.status, 400);
  });

  it('Phase 6: الرابط المرتبط يجب أن يحتوي kind وid فقط وبصيغ صحيحة', async () => {
    const employee = await newEmployee(suite.context);
    const invalid = [
      {},
      { kind: 'leave' },
      { id: '00000000-0000-0000-0000-000000000001' },
      { kind: 'leave', id: null },
      { kind: 'leave', id: 'not-an-id' },
      { kind: 'leave', id: '00000000-0000-0000-0000-000000000001', actorId: 'spoofed' },
    ];
    for (const relatedRecord of invalid) {
      const response = await postJson<ApiErrorBody>(baseUrl, '/api/daily-situations', {
        employeeId: employee.id,
        date: '2026-09-15',
        category: 'permanent_leaves',
        relatedRecord,
      });
      assert.equal(response.status, 400, JSON.stringify(relatedRecord));
      assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    }
    const count = await suite.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM daily_situations',
    );
    assert.equal(count.rows[0].count, '0', 'invalid link never writes a record');
  });

  it('Phase 6: لا يمكن ربط قيد منتسب بإجازة منتسب آخر أو نقل مالك السجل', async () => {
    const owner = await newEmployee(suite.context, { name: 'مالك الإجازة' });
    const other = await newEmployee(suite.context, { name: 'منتسب مختلف' });
    const leave = await suite.pool.query<{ id: string }>(
      `INSERT INTO leaves
        (employee_id, type, start_date, end_date, days, status)
       VALUES ($1, 'annual', '2026-09-15', '2026-09-16', 2, 'registered')
       RETURNING id`,
      [owner.id],
    );
    const relatedRecord = { kind: 'leave', id: leave.rows[0].id };
    const denied = await postJson<ApiErrorBody>(baseUrl, '/api/daily-situations', {
      employeeId: other.id,
      date: '2026-09-15',
      category: 'permanent_leaves',
      relatedRecord,
    });
    assert.equal(denied.status, 409);
    assert.equal(denied.body.error?.code, 'DAILY_SITUATION_OWNER_MISMATCH');

    const missing = await postJson<ApiErrorBody>(baseUrl, '/api/daily-situations', {
      employeeId: owner.id,
      date: '2026-09-15',
      category: 'permanent_leaves',
      relatedRecord: { kind: 'leave', id: '00000000-0000-0000-0000-000000000000' },
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error?.code, 'DAILY_SITUATION_RELATED_NOT_FOUND');

    const created = await newPersonnelRecord<{ id: string; employeeId: string }>(
      suite.context, '/api/daily-situations', {
        employeeId: owner.id,
        date: '2026-09-15',
        category: 'permanent_leaves',
        relatedRecord,
      },
    );
    assert.equal(created.employeeId, owner.id);
    const moved = await updateOne<{ employeeId: string }>(
      suite.context, `/api/daily-situations/${created.id}`, { notes: 'مراجعة سجل' },
    );
    assert.equal(moved.employeeId, owner.id);

    const otherRecord = await newPersonnelRecord<{ id: string; employeeId: string }>(
      suite.context, '/api/daily-situations', {
        employeeId: other.id, date: '2026-09-18', category: 'permanent_leaves',
      },
    );
    const wrongLink = await patchJson<ApiErrorBody>(
      baseUrl, `/api/daily-situations/${otherRecord.id}`,
      { relatedRecord },
    );
    assert.equal(wrongLink.status, 409, 'cannot attach another employee\'s leave');
    assert.equal(wrongLink.body.error?.code, 'DAILY_SITUATION_OWNER_MISMATCH');

    const goodLink = await patchJson<{ relatedRecord?: { kind: string; id: string } }>(
      baseUrl, `/api/daily-situations/${created.id}`,
      { relatedRecord },
    );
    assert.equal(goodLink.status, 200, 'owner can keep their own related record');

    const badChange = await patchJson<ApiErrorBody>(
      baseUrl, `/api/daily-situations/${created.id}`, { employeeId: other.id },
    );
    assert.equal(badChange.status, 400);
    assert.equal(badChange.body.error?.code, 'VALIDATION_ERROR');
    const ownerAfter = await readOne<{ employeeId: string }>(
      suite.context, `/api/daily-situations/${created.id}`,
    );
    assert.equal(ownerAfter.employeeId, owner.id);
    const otherAfter = await readOne<{ relatedRecord?: unknown }>(
      suite.context, `/api/daily-situations/${otherRecord.id}`,
    );
    assert.equal(otherAfter.relatedRecord, undefined, 'failed PATCH did not change the link');
  });

  it('لا مسار حذف لقيود الموقف اليومي', async () => {
    const response = await deleteJson<ApiErrorBody>(baseUrl, '/api/daily-situations/any-id');
    assert.equal(response.status, 404);
  });
});
