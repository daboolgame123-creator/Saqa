/**
 * اختبارات Phase 13 — Access Scope وإتاحة الكتب عبر الـHTTP الحقيقي.
 *
 * المرجع: `ALSQAYA_PLAN.md` §12 و§28 و§29:
 * 1. المسؤول والمدير: يرون كل النطاقات.
 * 2. المنتسب: يرى PublicToEmployees والكتب المتاحة له صراحة عبر SpecificEmployees.
 * 3. حجب الوجود (404 لا 403): محاولة قراءة كتاب خارج النطاق تعيد 404 (ResourceNotFoundError).
 * 4. مسارات الإتاحة: منح، كشف السجل، منح بالجملة للمرتبطين، سحب، وحراسة manage_availability.
 * 5. الخط الزمني والروابط: لا تسرّب للكتب المحجوبة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  deleteJson,
  getJson,
  postJson,
  useTestSession,
  type ApiErrorBody,
} from './apiTestHelpers';
import {
  newTransaction,
  newRegisteredAccount,
  setAccountRole,
  type TransactionBody,
} from './apiTestData';
import type { TransactionAvailabilityDto } from '../../src/api/dto';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

const SECRET = 'S3cret-Start';

describe('Phase 13 — Access Scope + Book Availability (HTTP)', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;

  before(async () => {
    suite = await startApiSuite();
    baseUrl = suite.baseUrl;
    pool = suite.pool;
  });

  after(async () => {
    await stopApiSuite(suite);
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
  });

  async function actor(role: 'admin' | 'director' | 'employee', badgeSuffix: string) {
    const { employee, account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `BG-${badgeSuffix}`,
      phoneNumber: `0770${badgeSuffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `BG-${badgeSuffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200);
    return { employee, account, token: login.body.sessionToken };
  }

  it('المسؤول والمدير: يرون جميع الكتب بمختلف النطاقات في القائمة والمفرد (§10.1 و§10.2)', async () => {
    const admin = await actor('admin', '1001');
    const director = await actor('director', '1002');

    useTestSession(admin.token);
    const pubTx = await newTransaction(suite.context, {
      number: '1/عام',
      visibility: 'PublicToEmployees',
      subject: 'كتاب عام للمنتسبين',
    });
    const specTx = await newTransaction(suite.context, {
      number: '2/خاص',
      visibility: 'SpecificEmployees',
      subject: 'كتاب خاص بمنتسبين',
    });
    const adminTx = await newTransaction(suite.context, {
      number: '3/إداري',
      visibility: 'Administrative',
      subject: 'كتاب إداري',
    });
    const dirTx = await newTransaction(suite.context, {
      number: '4/مدير',
      visibility: 'DirectorOnly',
      subject: 'كتاب للمدير فقط',
    });

    useTestSession(director.token);
    const dirList = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.equal(dirList.status, 200);
    const dirIds = dirList.body.map((t) => t.id);
    assert.ok(dirIds.includes(pubTx.id));
    assert.ok(dirIds.includes(specTx.id));
    assert.ok(dirIds.includes(adminTx.id));
    assert.ok(dirIds.includes(dirTx.id));

    const getDir = await getJson<TransactionBody>(baseUrl, `/api/transactions/${dirTx.id}`);
    assert.equal(getDir.status, 200);
    assert.equal(getDir.body.visibility, 'DirectorOnly');
  });

  it('المنتسب: يرى PublicToEmployees فقط، والكتب الإدارية أو الخاصة بالمدير تعيد 404 حجب وجود (§12 و§29)', async () => {
    const admin = await actor('admin', '2001');
    const employee = await actor('employee', '2002');

    useTestSession(admin.token);
    const pubTx = await newTransaction(suite.context, {
      number: '10/عام',
      visibility: 'PublicToEmployees',
      subject: 'كتاب عام',
    });
    const adminTx = await newTransaction(suite.context, {
      number: '11/إداري',
      visibility: 'Administrative',
      subject: 'كتاب إداري محجوب',
    });
    const dirTx = await newTransaction(suite.context, {
      number: '12/مدير',
      visibility: 'DirectorOnly',
      subject: 'كتاب للمدير محجوب',
    });

    useTestSession(employee.token);
    const empList = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.equal(empList.status, 200);
    const empIds = empList.body.map((t) => t.id);
    assert.ok(empIds.includes(pubTx.id));
    assert.ok(!empIds.includes(adminTx.id), 'الكتاب الإداري لا يظهر للمنتسب');
    assert.ok(!empIds.includes(dirTx.id), 'كتاب المدير لا يظهر للمنتسب');

    const pubRead = await getJson<TransactionBody>(baseUrl, `/api/transactions/${pubTx.id}`);
    assert.equal(pubRead.status, 200);

    const adminRead = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${adminTx.id}`);
    assert.equal(adminRead.status, 404, 'الكتاب الإداري يعيد 404 للمنتسب حفظاً للسرية');

    const dirRead = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${dirTx.id}`);
    assert.equal(dirRead.status, 404, 'كتاب المدير يعيد 404 للمنتسب');
  });

  it('إتاحة الكتاب (Book Availability): منح، ظهور للمنتسب، ثم سحب واختفاء (§9.3 و§9.4)', async () => {
    const admin = await actor('admin', '3001');
    const empA = await actor('employee', '3002');
    const empB = await actor('employee', '3003');

    useTestSession(admin.token);
    const specTx = await newTransaction(suite.context, {
      number: '20/خاص',
      visibility: 'SpecificEmployees',
      subject: 'كتاب خاص يتاح لاحقاً',
    });

    useTestSession(empA.token);
    let readA = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${specTx.id}`);
    assert.equal(readA.status, 404);

    useTestSession(admin.token);
    const grantRes = await postJson<TransactionAvailabilityDto[]>(
      baseUrl,
      `/api/transactions/${specTx.id}/availability`,
      { employeeIds: [empA.employee.id] },
    );
    assert.equal(grantRes.status, 201);
    assert.equal(grantRes.body.length, 1);
    assert.equal(grantRes.body[0].employeeId, empA.employee.id);

    useTestSession(empA.token);
    readA = await getJson<TransactionBody>(baseUrl, `/api/transactions/${specTx.id}`);
    assert.equal(readA.status, 200);
    assert.equal(readA.body.id, specTx.id);

    useTestSession(empB.token);
    const readB = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${specTx.id}`);
    assert.equal(readB.status, 404);

    useTestSession(admin.token);
    const inspectRes = await getJson<TransactionAvailabilityDto[]>(
      baseUrl,
      `/api/transactions/${specTx.id}/availability`,
    );
    assert.equal(inspectRes.status, 200);
    assert.equal(inspectRes.body.length, 1);
    assert.equal(inspectRes.body[0].employeeId, empA.employee.id);
    assert.equal(inspectRes.body[0].revokedAt, undefined);

    const revokeRes = await deleteJson(
      baseUrl,
      `/api/transactions/${specTx.id}/availability/${empA.employee.id}`,
    );
    assert.equal(revokeRes.status, 204);

    // فحص مرة أخرى: الآن revokedAt حاضر
    const inspectAfter = await getJson<TransactionAvailabilityDto[]>(
      baseUrl,
      `/api/transactions/${specTx.id}/availability`,
    );
    assert.equal(inspectAfter.status, 200);
    assert.equal(inspectAfter.body.length, 1);
    assert.ok(inspectAfter.body[0].revokedAt !== undefined, 'تاريخ السحب مسجّل في السجل التاريخي');

    useTestSession(empA.token);
    readA = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${specTx.id}`);
    assert.equal(readA.status, 404, 'بعد سحب الإتاحة يرجع الكتاب محجوباً');
  });

  it('إتاحة للمرتبطين بالجملة bulk (§9.4): تتيح الكتاب لكل المرتبطين في جدول transaction_employees', async () => {
    const admin = await actor('admin', '4001');
    const emp1 = await actor('employee', '4002');
    const emp2 = await actor('employee', '4003');

    useTestSession(admin.token);
    const tx = await newTransaction(suite.context, {
      number: '30/مرتبطين',
      visibility: 'SpecificEmployees',
      subject: 'كتاب ذو روابط',
      employeeLinks: [
        { employeeId: emp1.employee.id, relationshipType: 'subject' },
        { employeeId: emp2.employee.id, relationshipType: 'recipient' },
      ],
    });

    const bulkRes = await postJson<TransactionAvailabilityDto[]>(
      baseUrl,
      `/api/transactions/${tx.id}/availability/bulk`,
    );
    assert.equal(bulkRes.status, 201);
    assert.equal(bulkRes.body.length, 2);

    useTestSession(emp1.token);
    const read1 = await getJson<TransactionBody>(baseUrl, `/api/transactions/${tx.id}`);
    assert.equal(read1.status, 200);

    useTestSession(emp2.token);
    const read2 = await getJson<TransactionBody>(baseUrl, `/api/transactions/${tx.id}`);
    assert.equal(read2.status, 200);
  });

  it('صلاحية manage_availability: المدير والمنتسب مرفوضان بـ403 على مسارات الإتاحة (§9.5)', async () => {
    const admin = await actor('admin', '5001');
    const director = await actor('director', '5002');
    const employee = await actor('employee', '5003');

    useTestSession(admin.token);
    const tx = await newTransaction(suite.context, {
      number: '40/حماية',
      visibility: 'SpecificEmployees',
      subject: 'حماية الصلاحية',
    });

    useTestSession(director.token);
    const dirGet = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${tx.id}/availability`);
    assert.equal(dirGet.status, 403, 'المدير لا يدير الإتاحة §9.5');

    const dirPost = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${tx.id}/availability`,
      { employeeIds: [employee.employee.id] },
    );
    assert.equal(dirPost.status, 403);

    useTestSession(employee.token);
    const empGet = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${tx.id}/availability`);
    assert.equal(empGet.status, 403);

    const empDelete = await deleteJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${tx.id}/availability/${employee.employee.id}`,
    );
    assert.equal(empDelete.status, 403);
  });

  it('الخط الزمني وروابط الكتاب: تقييد النطاق يمنع تسرّب الكتب المحجوبة (§12 و§29)', async () => {
    const admin = await actor('admin', '6001');
    const employee = await actor('employee', '6002');

    useTestSession(admin.token);
    const pubTx = await newTransaction(suite.context, {
      number: '50/عام',
      visibility: 'PublicToEmployees',
      subject: 'كتاب تكليف عام',
      employeeLinks: [{ employeeId: employee.employee.id }],
    });
    const adminTx = await newTransaction(suite.context, {
      number: '51/إداري',
      visibility: 'Administrative',
      subject: 'كتاب عقوبة إدارية سري',
      employeeLinks: [{ employeeId: employee.employee.id }],
    });

    useTestSession(employee.token);
    const linksRes = await getJson<{ id: string; transactionId: string }[]>(
      baseUrl,
      `/api/transaction-employees?employeeId=${employee.employee.id}`,
    );
    assert.equal(linksRes.status, 200);
    const linkTxIds = linksRes.body.map((l) => l.transactionId);
    assert.ok(linkTxIds.includes(pubTx.id), 'الكتاب العام يظهر في روابطه');
    assert.ok(!linkTxIds.includes(adminTx.id), 'الكتاب الإداري لا يظهر في روابط المنتسب');

    const timelineRes = await getJson<{
      entries: { title: string; description?: string; metadata?: { transactionId?: string } }[];
    }>(baseUrl, `/api/timeline?employeeId=${employee.employee.id}`);
    assert.equal(timelineRes.status, 200);
    const eventDescs = timelineRes.body.entries.map((e) => e.description);
    assert.ok(eventDescs.includes(pubTx.subject), 'الخط الزمني يحوي الكتاب العام');
    assert.ok(!eventDescs.includes(adminTx.subject), 'الخط الزمني لا يسرب عنوان الكتاب الإداري المحجوب');
  });
});
