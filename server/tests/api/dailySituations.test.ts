/**
 * اختبارات الـAPI — الموقف اليومي وشؤون المنتسبين والخط الزمني
 * (Phase 10، البنود 4 و5 و6 من ترتيب النقل).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { deleteJson, getJson, postJson, type ApiErrorBody } from './apiTestHelpers';
import {
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

  it('لا مسار حذف لقيود الموقف اليومي', async () => {
    const response = await deleteJson<ApiErrorBody>(baseUrl, '/api/daily-situations/any-id');
    assert.equal(response.status, 404);
  });
});
