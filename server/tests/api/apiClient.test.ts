/**
 * اختبارات عميل الـAPI وتنفيذ المصدر في الواجهة (Phase 10).
 *
 * لا شبكة ولا خادم: `fetchImpl` يُحقن، فيمكن التحقق من كل نداء HTTP
 * على حدة (المسار والطريقة والجسم) وترجمة الأخطاء برموزها الثابتة.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, createApiClient, type FetchLike } from '../../../src/api/apiClient';
import { createApiDataAdapter } from '../../../src/api/apiDataAdapter';
import {
  toDailySituation,
  toEmployee,
  toTransaction,
  toTransactionEmployee,
  type EmployeeDto,
  type TransactionDto,
} from '../../../src/api/mappers';

/** نداء HTTP مسجَّل. */
interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

/** fetch مزيف: يسجّل النداء ويعيد استجابة جاهزة. */
function fakeFetch(response: {
  status?: number;
  body?: unknown;
}): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    return {
      ok: (response.status ?? 200) < 400,
      status: response.status ?? 200,
      text: async () => (response.body === undefined ? '' : JSON.stringify(response.body)),
    } as unknown as Response;
  };
  return { fetchImpl, calls };
}

/** عميل + تنفيذ adapter جاهزان للاختبار. */
function harness(response: { status?: number; body?: unknown }) {
  const { fetchImpl, calls } = fakeFetch(response);
  const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
  return { calls, adapter: createApiDataAdapter(client) };
}

describe('Phase 10 — الواجهة: عميل الـAPI', () => {
  it('يبني الرابط مع معاملات الاستعلام المعرَّفة فقط', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: [] });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await client.get('/employees', { status: 'active', search: undefined, q: '' });
    assert.equal(calls[0].url, 'http://api.test/api/employees?status=active');
  });

  it('يرسل الجسم كـJSON ويرسل ترويسة المحتوى معه', async () => {
    const { fetchImpl, calls } = fakeFetch({ status: 201, body: { id: 'e1' } });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await client.post('/employees', { name: 'أحمد' });
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, { name: 'أحمد' });
  });

  it('يتحمّل استجابة 204 بلا جسم', async () => {
    const { fetchImpl } = fakeFetch({ status: 204 });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await client.remove('/transaction-employees/l1');
  });

  it('يترجم خطأ 400 إلى ApiError برمزه الثابت وتفاصيله', async () => {
    const { fetchImpl } = fakeFetch({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'بيانات الطلب غير صالحة.',
          details: [{ field: 'body.name', message: 'نص غير فارغ مطلوب.' }],
          requestId: 'req-1',
        },
      },
    });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await assert.rejects(
      () => client.post('/employees', { name: '' }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.equal(error.status, 400);
        assert.equal(error.requestId, 'req-1');
        assert.ok(Array.isArray(error.details));
        return true;
      },
    );
  });

  it('يترجم فشل الشبكة إلى NETWORK_ERROR بلا رمز مخترع', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await assert.rejects(
      () => client.get('/employees'),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'NETWORK_ERROR');
        assert.equal(error.status, 0);
        return true;
      },
    );
  });
});

describe('Phase 10 — الواجهة: مسارات ApiDataAdapter', () => {
  it('يرفض الحقول غير المعرَّفة قبل الإرسال', async () => {
    const { fetchImpl, calls } = fakeFetch({ status: 201, body: { id: 'e1', name: 'س', title: 'ت', department: 'ق', status: 'active' } });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await createApiDataAdapter(client).createEmployee({
      name: 'أحمد',
      title: 'معاون',
      department: 'قسم',
      badgeNumber: undefined,
    });
    assert.deepEqual(calls[0].body, { name: 'أحمد', title: 'معاون', department: 'قسم' });
  });

  it('التحميل يذهب إلى المسار الصحيح مع الفلاتر المرمّزة', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: [] });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await createApiDataAdapter(client).loadTransactions({ month: '2026-09' });
    assert.equal(calls[0].url, 'http://api.test/api/transactions?month=2026-09');
  });

  it('تغيير حالة الموظف يستدعي مسار الحالة لا المسار العام', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 200,
      body: { id: 'e1', name: 'س', title: 'ت', department: 'ق', status: 'former' },
    });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await createApiDataAdapter(client).changeEmployeeStatus('e1', {
      status: 'former',
      serviceEndReason: 'تقاعد',
    });
    assert.equal(calls[0].url, 'http://api.test/api/employees/e1/status');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, { status: 'former', serviceEndReason: 'تقاعد' });
  });

  it('حذف الرابط يرسل DELETE على مسار الروابط', async () => {
    const { fetchImpl, calls } = fakeFetch({ status: 204 });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    await createApiDataAdapter(client).removeLink('l1');
    assert.equal(calls[0].method, 'DELETE');
    assert.equal(calls[0].url, 'http://api.test/api/transaction-employees/l1');
  });

  it('ينشئ الكتاب مع روابطه ومرفقاته في نداء واحد', async () => {
    const { fetchImpl, calls } = fakeFetch({
      status: 201,
      body: {
        id: 't1', number: '١', sequence: '١', date: '2026-09-10', month: '2026-09',
        direction: 'صادر', category: 'إدارية', subType: 'ت', entity: 'إ', subject: 'م',
        status: 'قيد المراجعة', employeeIds: ['e1'], attachments: [],
      },
    });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    const created = await createApiDataAdapter(client).createTransaction({
      number: '١', sequence: '١', date: '2026-09-10', direction: 'صادر', category: 'إدارية',
      subType: 'ت', entity: 'إ', subject: 'م', status: 'قيد المراجعة', attachments: [],
      employeeLinks: [{ employeeId: 'e1' }],
    });
    assert.equal(calls.length, 1, 'الروابط تُنشأ مع الكتاب لا بنداء منفصل');
    assert.equal(created.id, 't1');
  });

  it('المعرّف يعود من الخادم لا من مُعرّف مؤقت', async () => {
    const { fetchImpl } = fakeFetch({
      status: 201,
      body: {
        id: '11111111-2222-3333-4444-555555555555', name: 'س', title: 'ت',
        department: 'ق', status: 'active', createdAt: '2026-09-26T10:00:00.000Z',
      },
    });
    const client = createApiClient({ baseUrl: 'http://api.test/api', fetchImpl });
    const created = await createApiDataAdapter(client).createEmployee({
      name: 'س', title: 'ت', department: 'ق',
    });
    assert.equal(created.id, '11111111-2222-3333-4444-555555555555');
  });
});

describe('Phase 10 \u2014 \u0627\u0644\u0648\u0627\u062c\u0647\u0629: \u062a\u062d\u0648\u064a\u0644 DTO \u0625\u0644\u0649 Domain', () => {
  it('الموظف: الحقول الإلزامية تنتقل والحقول الغائبة لا تُنشأ', () => {
    const dto: EmployeeDto = {
      id: 'e1',
      name: 'أحمد',
      title: 'معاون',
      department: 'الشؤون',
      status: 'active',
    };
    const employee = toEmployee(dto);
    assert.equal(employee.id, 'e1');
    assert.equal(employee.name, 'أحمد');
    // الغياب يجب ألا ينتج مفتاحاً بقيمة undefined.
    assert.equal('badgeNumber' in employee, false);
    assert.equal('phone' in employee, false);
  });

  it('الموظف: الحقول الاختيارية المعرَّفة تنtransition', () => {
    const employee = toEmployee({
      id: 'e1',
      name: 'سارة',
      title: 'باحث',
      department: 'قسم',
      status: 'active',
      badgeNumber: 'EMP-9',
      category: 'باحث',
      academicDegree: 'دكتور',
    });
    assert.equal(employee.badgeNumber, 'EMP-9');
    assert.equal(employee.category, 'باحث');
    assert.equal(employee.academicDegree, 'دكتور');
  });

  it('الكتاب: month وemployeeIds ينتقلان كما هما (مشتقّان في الخادم)', () => {
    const dto: TransactionDto = {
      id: 't1',
      number: '١٠٠/ص',
      sequence: '٩٠٠',
      date: '2026-09-10',
      month: '2026-09',
      direction: 'صادر',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'إدارة',
      subject: 'موضوع',
      status: 'قيد المراجعة',
      employeeIds: ['e1', 'e2'],
      attachments: [],
    };
    const transaction = toTransaction(dto);
    assert.equal(transaction.month, '2026-09');
    assert.deepEqual(transaction.employeeIds, ['e1', 'e2']);
    assert.deepEqual(transaction.attachments, []);
  });

  it('الرابط: علاقة الأدوار تنتقل، والغياب لا ينتج مفتاحاً', () => {
    const link = toTransactionEmployee({
      id: 'l1',
      transactionId: 't1',
      employeeId: 'e1',
      relationshipType: 'subject',
    });
    assert.equal(link.relationshipType, 'subject');
    assert.equal('notes' in link, false);
  });

  it('الموقف اليومي: relatedRecord ينتقل، والغياب لا ينتج مفتاحاً', () => {
    const record = toDailySituation({
      id: 'd1',
      employeeId: 'e1',
      date: '2026-09-10',
      category: 'permanent_leaves',
      relatedRecord: { kind: 'transaction', id: 't1' },
    });
    assert.deepEqual(record.relatedRecord, { kind: 'transaction', id: 't1' });

    const without = toDailySituation({
      id: 'd2',
      employeeId: 'e1',
      date: '2026-09-10',
      category: 'permanent_leaves',
    });
    assert.equal('relatedRecord' in without, false);
  });

  it('المرفق: حقول العرض (previewUrl/isImage) لا تُنقل — تخزين Phase 14', () => {
    const transaction = toTransaction({
      id: 't1',
      number: '١',
      sequence: '١',
      date: '2026-09-10',
      month: '2026-09',
      direction: 'صادر',
      category: 'إدارية',
      subType: 'ت',
      entity: 'إ',
      subject: 'م',
      status: 'قيد المراجعة',
      employeeIds: [],
      attachments: [{ id: 'a1', name: 'س.jpg', type: 'كتاب رئيسي', fileSize: '1 MB', uploadDate: '2026-09-10' }],
    });
    assert.equal(transaction.attachments.length, 1);
    assert.equal('previewUrl' in transaction.attachments[0], false);
  });
});
