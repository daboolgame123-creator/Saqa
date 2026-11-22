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
  newAuthenticatedAccount,
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
    // Phase 11: مسارات /api/* كلها تتطلب جلسة صالحة فنبني حسابا
    // حقيقيا عبر تدفق التسجيل والدخول الكامل قبل كل اختبار.
    await newAuthenticatedAccount(suite.context);
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

  it('منع تكرار الرابط بلا دور مع السماح بأدوار مختلفة', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context);
    const link = { transactionId: transaction.id, employeeId: employee.id };

    const first = await postJson<{ id: string }>(baseUrl, '/api/transaction-employees', link);
    assert.equal(first.status, 201);
    const duplicate = await postJson<ApiErrorBody>(baseUrl, '/api/transaction-employees', link);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'TRANSACTION_EMPLOYEE_ALREADY_LINKED');

    const typed1 = await postJson<{ id: string }>(
      baseUrl, '/api/transaction-employees', { ...link, relationshipType: 'subject' },
    );
    const typed2 = await postJson<{ id: string }>(
      baseUrl, '/api/transaction-employees', { ...link, relationshipType: 'recipient' },
    );
    assert.equal(typed1.status, 201);
    assert.equal(typed2.status, 201);
    const repeatedRole = await postJson<ApiErrorBody>(
      baseUrl, '/api/transaction-employees', { ...link, relationshipType: 'subject' },
    );
    assert.equal(repeatedRole.status, 409);
    assert.equal(repeatedRole.body.error.code, 'TRANSACTION_EMPLOYEE_ALREADY_LINKED');

    const links = await readMany<{ employeeId: string }>(
      suite.context, `/api/transaction-employees?transactionId=${transaction.id}`,
    );
    assert.equal(links.length, 3);
    assert.ok(links.every((row) => row.employeeId === employee.id));
    const mirror = await readOne<TransactionBody>(
      suite.context, `/api/transactions/${transaction.id}`,
    );
    assert.deepEqual(mirror.employeeIds, [employee.id], 'الأدوار المتعددة لا تكرر معرّف المنتسب');
  });

  it('التعديل إلى دور رابط مكرر يُرفض 409', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context, {
      employeeLinks: [
        { employeeId: employee.id, relationshipType: 'subject' },
        { employeeId: employee.id, relationshipType: 'recipient' },
      ],
    });
    const links = await readMany<{ id: string; relationshipType?: string }>(
      suite.context, `/api/transaction-employees?transactionId=${transaction.id}`,
    );
    const recipient = links.find((row) => row.relationshipType === 'recipient');
    assert.ok(recipient);
    const response = await patchJson<ApiErrorBody>(
      baseUrl, `/api/transaction-employees/${recipient.id}`,
      { relationshipType: 'subject' },
    );
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'TRANSACTION_EMPLOYEE_ALREADY_LINKED');
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

  it('ربط بموظف غير موجود يعيد 404 لا 500', async () => {
    const transaction = await newTransaction(suite.context);
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/transaction-employees', {
      transactionId: transaction.id,
      employeeId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(response.status, 404, 'قيد FK معروف يجب أن يترجم إلى 404');
    assert.equal(response.body.error.code, 'RESOURCE_NOT_FOUND');
  });
});
