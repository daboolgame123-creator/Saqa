/**
 * اختبارات الـAPI — روابط الكتاب بالمنتسب (Phase 10، بند 3، BR-05).
 *
 * تركز على القاعدة 7: العلاقة بمعرّفات لا بأسماء، وحذف الرابط يزيل
 * سطر العلاقة وحده لا طرفَيها.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import {
  deleteJson,
  getJson,
  patchJson,
  postJson,
  type ApiErrorBody,
} from './apiTestHelpers';
import {
  newEmployee,
  newTransaction,
  readMany,
  readOne,
  type EmployeeBody,
  type TransactionBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

describe('Phase 10 — API: روابط الكتاب والمنتسب', () => {
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

  it('الإنشاء مع الكتاب يعكس employeeIds كمعرّفات لا أسماء', async () => {
    const employee = await newEmployee(suite.context, { name: 'أحمد mínimos' });
    const transaction = await newTransaction(suite.context, {
      employeeName: employee.name,
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
    });
    assert.deepEqual(transaction.employeeIds, [employee.id]);
  });

  it('القراءة بنطاق الكتاب وبنطاق المنتسب متسقةان', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id }],
    });

    const byTransaction = await readMany<{ employeeId: string }>(
      suite.context,
      `/api/transaction-employees?transactionId=${transaction.id}`,
    );
    assert.equal(byTransaction.length, 1);
    assert.equal(byTransaction[0].employeeId, employee.id);

    const byEmployee = await readMany<{ transactionId: string }>(
      suite.context,
      `/api/transaction-employees?employeeId=${employee.id}`,
    );
    assert.equal(byEmployee.length, 1);
    assert.equal(byEmployee[0].transactionId, transaction.id);
  });

  it('القراءة بلا نطاق أو بنطاقين معاً تُرفض 400', async () => {
    const none = await getJson<ApiErrorBody>(baseUrl, '/api/transaction-employees');
    assert.equal(none.status, 400);

    const both = await getJson<ApiErrorBody>(
      baseUrl,
      '/api/transaction-employees?employeeId=a&transactionId=b',
    );
    assert.equal(both.status, 400);
  });

  it('تعديل دور العلاقة والملاحظات يعمل', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
    });
    const links = await readMany<{ id: string }>(
      suite.context,
      `/api/transaction-employees?transactionId=${transaction.id}`,
    );

    const updated = await patchJson<{ relationshipType?: string; notes?: string }>(
      baseUrl,
      `/api/transaction-employees/${links[0].id}`,
      { relationshipType: 'beneficiary', notes: 'مستفيد' },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.relationshipType, 'beneficiary');
    assert.equal(updated.body.notes, 'مستفيد');
  });

  it('حذف الرابط يزيل سطر العلاقة فقط — الكتاب والموظف يبقيان', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id }],
    });
    const links = await readMany<{ id: string }>(
      suite.context,
      `/api/transaction-employees?transactionId=${transaction.id}`,
    );

    const deleted = await deleteJson(baseUrl, `/api/transaction-employees/${links[0].id}`);
    assert.equal(deleted.status, 204);

    const afterDelete = await readOne<TransactionBody>(
      suite.context,
      `/api/transactions/${transaction.id}`,
    );
    assert.equal(afterDelete.employeeIds.length, 0, 'الروابط أُزيلت');

    const employeeAfter = await readOne<EmployeeBody>(
      suite.context,
      `/api/employees/${employee.id}`,
    );
    assert.equal(employeeAfter.id, employee.id, 'الموظف لم يُحذف');
  });

  it('حذف رابط غير موجود يعيد 404', async () => {
    const response = await deleteJson<ApiErrorBody>(
      baseUrl,
      '/api/transaction-employees/00000000-0000-0000-0000-000000000000',
    );
    assert.equal(response.status, 404);
  });

  it('دور خارج الأدوار المعتمدة يُرفض', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context);
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/transaction-employees', {
      transactionId: transaction.id,
      employeeId: employee.id,
      relationshipType: 'دور مخترع',
    });
    assert.equal(response.status, 400);
  });

  it('ربط بموظف غير موجود يفشل على قيد FK في القاعدة', async () => {
    const transaction = await newTransaction(suite.context);
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/transaction-employees', {
      transactionId: transaction.id,
      employeeId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(response.status, 500, 'قيد FK المرجعي مفروض في القاعدة');
  });
});
