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

  it('Phase 5: أرشفة الكتاب تمنع إنشاء أو تعديل أو حذف روابطه التاريخية', async () => {
    const employee = await newEmployee(suite.context, { name: 'منتسب سجل مؤرشف' });
    const second = await newEmployee(suite.context, { name: 'منتسب ثان' });
    const transaction = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
    });
    const links = await readMany<{ id: string; notes?: string }>(
      suite.context, `/api/transaction-employees?transactionId=${transaction.id}`,
    );
    assert.equal(links.length, 1);

    const archived = await deleteJson<TransactionBody>(
      baseUrl, `/api/transactions/${transaction.id}?expectedVersion=${transaction.version}`,
    );
    assert.equal(archived.status, 200);
    assert.ok(archived.body);
    const newLink = await postJson<ApiErrorBody>(
      baseUrl, '/api/transaction-employees', {
        transactionId: transaction.id, employeeId: second.id, relationshipType: 'recipient',
      },
    );
    assert.equal(newLink.status, 404, 'archived books accept no new links');

    const modified = await patchJson<ApiErrorBody>(
      baseUrl, `/api/transaction-employees/${links[0].id}`,
      { notes: 'تغيير ممنوع' },
    );
    assert.equal(modified.status, 404, 'historical link notes remain unchanged');

    const removed = await deleteJson<ApiErrorBody>(
      baseUrl, `/api/transaction-employees/${links[0].id}`,
    );
    assert.equal(removed.status, 404, 'historical link must not be deleted');

    const raw = await suite.pool.query<{ id: string; employee_id: string; notes: string | null }>(
      'SELECT id, employee_id, notes FROM transaction_employees WHERE transaction_id = $1',
      [transaction.id],
    );
    assert.equal(raw.rows.length, 1);
    assert.equal(raw.rows[0].id, links[0].id);
    assert.equal(raw.rows[0].employee_id, employee.id);
    assert.equal(raw.rows[0].notes, null);

    const restored = await postJson<TransactionBody>(
      baseUrl, `/api/transactions/${transaction.id}/restore?expectedVersion=${archived.body.version}`,
    );
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body.employeeIds, [employee.id]);
    const visibleAgain = await readMany<{ id: string }>(
      suite.context, `/api/transaction-employees?transactionId=${transaction.id}`,
    );
    assert.deepEqual(visibleAgain.map((item) => item.id), [links[0].id]);
  });

  it('Phase 5: يمكن للمنتسب أن يتعدد دوره في الكتاب دون ضياع كل رابط', async () => {
    const employee = await newEmployee(suite.context);
    const transaction = await newTransaction(suite.context, {
      employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
    });
    const second = await postJson<{ id: string; relationshipType?: string }>(
      baseUrl, '/api/transaction-employees',
      { transactionId: transaction.id, employeeId: employee.id, relationshipType: 'recipient' },
    );
    assert.equal(second.status, 201);
    const links = await readMany<{ id: string; relationshipType?: string }>(
      suite.context, `/api/transaction-employees?transactionId=${transaction.id}`,
    );
    assert.deepEqual(links.map((link) => link.relationshipType).sort(), ['recipient', 'subject']);
    assert.equal(new Set(links.map((link) => link.id)).size, 2);
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
