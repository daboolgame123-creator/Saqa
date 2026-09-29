/**
 * Phase 16 — Soft Delete + Data Integrity عبر الـHTTP الحقيقي.
 *
 * المرجع: `ALSQAYA_PLAN.md` §32. الاختبارات تمرّ بالمسار الكامل:
 * Express ← الجلسات ← RBAC ← Access Scope ← controller ← خدمة ← مستودع
 * ← PostgreSQL، وتتحقق من **حالة القاعدة** لا من رمز HTTP وحده.
 *
 * البنود المغطّاة:
 * 1. الأرشفة لا تحذف الصف، وتُخفيه عن القوائم النشطة، وتُبقي مرفقاته
 *    وروابطه وسجل اطلاعه.
 * 2. الوصول الإداري للمؤرشف (قائمة أرشيف) متاح لمسؤول السقاية فقط.
 * 3. الاستعادة تعيد الكتاب نفسه بهويته وبياناته.
 * 4. archive → restore → archive يبقى بلا فقد.
 * 5. مصفوفة الصلاحيات: admin نعم · director وemployee لا (403).
 * 6. أحداث التدقيق (Phase 15) تُسجَّل للأرشفة والاستعادة بفاعلها.
 * 7. الموظف لا يُحذف أبداً (§13): لا مسار حذف، والحالة `former` تبقي
 *    السجلات.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  deleteJson,
  getAttachmentContent,
  getJson,
  postAttachment,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
} from './apiTestHelpers';
import {
  newEmployee,
  newRegisteredAccount,
  newTransaction,
  setAccountRole,
  type TransactionBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import { FileStorage } from '../../src/storage';
import type { AcknowledgementDto, AuditLogDto } from '../../src/api/dto';

const SECRET = 'S3cret-Start';

function fakePdf(marker: string): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(marker, 'latin1')]);
}

interface AttachmentBody {
  id: string;
}

describe('Phase 16 — Soft Delete + Data Integrity (HTTP)', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl = '';
  let storageRoot = '';

  before(async () => {
    storageRoot = await mkdtemp(join(os.tmpdir(), 'alsqaya-soft-'));
    suite = await startApiSuite(new FileStorage({ rootDir: storageRoot }));
    baseUrl = suite.baseUrl;
    pool = suite.pool;
  });

  after(async () => {
    if (suite !== undefined) {
      await stopApiSuite(suite);
    }
    if (storageRoot !== '') {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
    await rm(storageRoot, { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });
  });

  /** حساب بدور وجلسة حقيقية (تسجيل + رفع دور + دخول). */
  async function actor(role: 'admin' | 'director' | 'employee', suffix: string) {
    const { employee, account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `SD-${suffix}`,
      phone: `0784${suffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `SD-${suffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200, `فشل دخول ${role}`);
    return { employee, account, token: login.body.sessionToken };
  }

  /** عدّ صفوف جدول بمعرّف كتاب (الفحص على القاعدة لا على استجابة HTTP). */
  async function countRows(table: string, transactionId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table} WHERE transaction_id = $1`,
      [transactionId],
    );
    return Number(result.rows[0].count);
  }

  /** كتاب مع طوابع الأرشفة كما يعيدها الـAPI. */
  type ArchivedTransactionBody = TransactionBody & {
    deletedAt?: string;
    deletedBy?: string;
    deleteReason?: string;
  };

  it('الأرشفة: 200 بطرفا حالة، الصف باقٍ ومستبعَد من القائمة النشطة', async () => {
    const admin = await actor('admin', '16011');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, { number: '١/٦' });

    const archived = await deleteJson<ArchivedTransactionBody>(
      baseUrl,
      `/api/transactions/${transaction.id}?reason=${encodeURIComponent('كتاب مكرر')}`,
    );
    assert.equal(archived.status, 200, `رد الأرشفة: ${JSON.stringify(archived.body)}`);
    const body = archived.body as ArchivedTransactionBody;
    assert.equal(body.id, transaction.id, 'المعرّف لم يتغيّر — لا سجل جديد');
    assert.ok(body.deletedAt !== undefined, 'طابع الأرشفة في الرد');
    assert.equal(body.deleteReason, 'كتاب مكرر', 'السبب الاختياري محفوظ');

    // الصف ما زال في القاعدة بنفس المعرّف.
    const row = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions WHERE id = $1`,
      [transaction.id],
    );
    assert.equal(row.rows[0].count, '1', 'الصف لم يُحذف من القاعدة');

    // مستبعد من القائمة النشطة ومن القراءة المفردة.
    const list = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.equal(list.status, 200);
    assert.ok(!list.body.some((entry) => entry.id === transaction.id), 'ليس في القائمة النشطة');
    const single = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${transaction.id}`);
    assert.equal(single.status, 404, 'القراءة النشطة لا تكشف وجوده (404 لا 403)');
    assert.equal(single.body.error?.code, 'RESOURCE_NOT_FOUND');
  });

  it('الأرشفة تحفظ المرفقات والروابط وسجل الاطلاع في القاعدة', async () => {
    const admin = await actor('admin', '16021');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, {
      number: '٢/٦',
      employeeLinks: [{ employeeId: admin.employee.id, relationshipType: 'subject' }],
    });
    const attachment = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'مرفق-الأرشفة.pdf',
      content: fakePdf('archive-history'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(attachment.status, 201);
    const acknowledged = await postJson<AcknowledgementDto>(
      baseUrl,
      `/api/transactions/${transaction.id}/acknowledge`,
    );
    assert.equal(acknowledged.status, 200, 'اطلاع قبل الأرشفة');

    assert.equal((await deleteJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 200);

    assert.equal(await countRows('attachments', transaction.id), 1, 'المرفق باقٍ');
    assert.equal(await countRows('view_logs', transaction.id), 1, 'سجل الاطلاع باقٍ');
    const links = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transaction_employees WHERE transaction_id = $1`,
      [transaction.id],
    );
    assert.equal(links.rows[0].count, '1', 'الرابط التاريخي باقٍ');
    const attachmentRow = await pool.query<{
      storageKey: string | null;
      contentHash: string | null;
    }>(
      `SELECT storage_key AS "storageKey", content_hash AS "contentHash"
         FROM attachments WHERE transaction_id = $1`,
      [transaction.id],
    );
    assert.ok(attachmentRow.rows[0].storageKey !== null, 'مفتاح التخزين المركزي محفوظ');
    assert.ok(attachmentRow.rows[0].contentHash !== null, 'بصمة المحتوى محفوظة');
  });

  it('الاستعلام التاريخي: قائمة الأرشيف لمسؤول السقاية فقط', async () => {
    const admin = await actor('admin', '16031');
    const director = await actor('director', '16032');
    const employee = await actor('employee', '16033');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, { number: '٣/٦' });
    assert.equal((await deleteJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 200);

    useTestSession(admin.token);
    const archivedList = await getJson<TransactionBody[]>(baseUrl, '/api/transactions/archived');
    assert.equal(archivedList.status, 200, 'المسؤول يقرأ أرشيفه');
    assert.ok(archivedList.body.some((entry) => entry.id === transaction.id));

    useTestSession(director.token);
    const directorList = await getJson<ApiErrorBody>(baseUrl, '/api/transactions/archived');
    assert.equal(directorList.status, 403, 'المدير لا يملك delete_archive (§10.2)');
    assert.equal(directorList.body.error?.code, 'PERMISSION_DENIED');

    useTestSession(employee.token);
    const employeeList = await getJson<ApiErrorBody>(baseUrl, '/api/transactions/archived');
    assert.equal(employeeList.status, 403, 'المنتسب لا يملك delete_archive (§10.3)');
  });

  it('الاستعادة: الكتاب نفسه يعود بهويته ومرفقاته وبياناته', async () => {
    const admin = await actor('admin', '16041');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, {
      number: '٤/٦',
      employeeLinks: [{ employeeId: admin.employee.id, relationshipType: 'recipient' }],
    });
    const attachment = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'يبقى-بعد-الاستعادة.pdf',
      content: fakePdf('restore-history'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal((await deleteJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 200);

    const restored = await postJson<TransactionBody>(
      baseUrl,
      `/api/transactions/${transaction.id}/restore`,
    );
    assert.equal(restored.status, 200, `رد الاستعادة: ${JSON.stringify(restored.body)}`);
    assert.equal(restored.body.id, transaction.id, 'نفس المعرّف — لا سجل جديد');
    assert.equal(restored.body.number, transaction.number, 'البيانات كما هي');
    assert.equal(restored.body.status, transaction.status, 'الحالة كما هي');
    assert.deepEqual(restored.body.employeeIds, [admin.employee.id], 'الروابط لم تتكرر ولم تُفقد');
    assert.equal(restored.body.attachments.length, 1, 'المرفق ما زال مرتبطاً');
    assert.equal(restored.body.attachments[0].id, attachment.body.id);

    // ظاهر في القائمة النشطة، والتنزيل يعمل لأن الاستعادة أرجعت المفتاح.
    const list = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.ok(list.body.some((entry) => entry.id === transaction.id), 'عاد للقائمة النشطة');
    const download = await getAttachmentContent(baseUrl, transaction.id, attachment.body.id);
    assert.equal(download.status, 200, 'الملف المادي لم يُمسّ عبر الأرشفة');
    const archivedList = await getJson<TransactionBody[]>(baseUrl, '/api/transactions/archived');
    assert.ok(!archivedList.body.some((entry) => entry.id === transaction.id), 'ليس في الأرشيف');
  });

  it('أرشفة مؤرشف أو استعادة نشط: 404 بلا تغيّر ولا حدث مضاعف', async () => {
    const admin = await actor('admin', '16051');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, { number: '٥/٦' });

    // استعادة كتاب نشط أصلاً ⇒ 404، والصف لم يُمسّ.
    const restoreActive = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${transaction.id}/restore`,
    );
    assert.equal(restoreActive.status, 404, 'لا استعادة لكتاب نشط');
    const stillActive = await getJson<TransactionBody>(baseUrl, `/api/transactions/${transaction.id}`);
    assert.equal(stillActive.status, 200, 'الكتاب ما زال نشطاً كما هو');

    assert.equal((await deleteJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 200);
    // أرشفة كتاب مؤرشف ⇒ 404، ولا تتغير طوابع الأرشفة الأولى.
    const archiveAgain = await deleteJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${transaction.id}`,
    );
    assert.equal(archiveAgain.status, 404, 'أرشفة كتاب مؤرشف لا تُعيد الكتابة');
    const stamps = await pool.query<{ deletedAt: string }>(
      `SELECT deleted_at AS "deletedAt" FROM transactions WHERE id = $1`,
      [transaction.id],
    );
    assert.ok(stamps.rows[0].deletedAt !== '', 'الطابع الأصلي لم يُستبدل');
  });

  it('archive → restore → archive: الهوية والعلاقات والتاريخ سليمة', async () => {
    const admin = await actor('admin', '16061');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, {
      number: '٦/٦',
      employeeLinks: [{ employeeId: admin.employee.id, relationshipType: 'assigned' }],
    });
    const created = await pool.query<{ createdAt: string }>(
      `SELECT created_at AS "createdAt" FROM transactions WHERE id = $1`,
      [transaction.id],
    );

    assert.equal((await deleteJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 200);
    assert.equal(
      (await postJson(baseUrl, `/api/transactions/${transaction.id}/restore`)).status,
      200,
    );
    const second = await deleteJson<ArchivedTransactionBody>(
      baseUrl,
      `/api/transactions/${transaction.id}`,
    );
    assert.equal(second.status, 200, 'أرشفة ثانية بعد الاستعادة');

    const finalRow = await pool.query<{
      count: string;
      createdAt: string;
      number: string;
      deletedBy: string | null;
    }>(
      `SELECT count(*)::text AS count, max(created_at) AS "createdAt",
              max(number) AS number, max(deleted_by::text) AS "deletedBy"
         FROM transactions WHERE id = $1`,
      [transaction.id],
    );
    assert.equal(finalRow.rows[0].count, '1', 'صف واحد لا صفّان');
    assert.equal(
      finalRow.rows[0].createdAt,
      created.rows[0].createdAt,
      'تاريخ الإنشاء الأصلي لم يتغيّر عبر الدورات',
    );
    assert.equal(finalRow.rows[0].number, transaction.number, 'بيانات الكتاب سليمة');
    assert.equal(finalRow.rows[0].deletedBy, admin.account.id, 'الفاعل هو حساب المسؤول');
    assert.equal(await countRows('transaction_employees', transaction.id), 1, 'علاقة واحدة لا تكرار');
  });

  it('مصفوفة الصلاحيات: admin نعم · director وemployee لا على الأرشفة والاستعادة', async () => {
    const admin = await actor('admin', '16071');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, { number: '٧/٦' });
    const director = await actor('director', '16072');
    const employee = await actor('employee', '16073');

    for (const [role, other] of [
      ['director', director],
      ['employee', employee],
    ] as const) {
      useTestSession(other.token);
      const archiveAttempt = await deleteJson<ApiErrorBody>(
        baseUrl,
        `/api/transactions/${transaction.id}`,
      );
      assert.equal(archiveAttempt.status, 403, `${role} لا يؤرشف`);
      assert.equal(archiveAttempt.body?.error?.code, 'PERMISSION_DENIED');
    }
    // الكتاب ما زال نشطاً بعد محاولات الرفض (القراءة بصلاحية المسؤول).
    useTestSession(admin.token);
    const active = await getJson<TransactionBody>(baseUrl, `/api/transactions/${transaction.id}`);
    assert.equal(active.status, 200, 'الرفض لم يغيّر شيئاً');

    // المسؤول يؤرشف، ثم المرفوضان لا يستعيدان.
    useTestSession(admin.token);
    assert.equal((await deleteJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 200);
    for (const [role, other] of [
      ['director', director],
      ['employee', employee],
    ] as const) {
      useTestSession(other.token);
      const restoreAttempt = await postJson<ApiErrorBody>(
        baseUrl,
        `/api/transactions/${transaction.id}/restore`,
      );
      assert.equal(restoreAttempt.status, 403, `${role} لا يستعيد`);
    }
    useTestSession(admin.token);
    const archived = await getJson<TransactionBody[]>(baseUrl, '/api/transactions/archived');
    assert.ok(
      archived.body.some((entry) => entry.id === transaction.id),
      'الكتاب ما زال مؤرشفاً — محاولات الرفض لم تستعده',
    );
  });

  it('بلا جلسة ⇒ 401 على الأرشفة والاستعادة قبل أي فحص صلاحية', async () => {
    useTestSession(null);
    const archive = await requestWithToken<ApiErrorBody>(
      baseUrl,
      '/api/transactions/00000000-0000-0000-0000-000000000001',
      { method: 'DELETE', token: null },
    );
    assert.equal(archive.status, 401);
    assert.equal(archive.body?.error?.code, 'AUTHENTICATION_REQUIRED');
    const restore = await requestWithToken<ApiErrorBody>(
      baseUrl,
      '/api/transactions/00000000-0000-0000-0000-000000000001/restore',
      { method: 'POST', token: null },
    );
    assert.equal(restore.status, 401);
  });

  it('التدقيق: حدث archive للأرشفة وحدث update(action=restore) للاستعادة', async () => {
    const admin = await actor('admin', '16081');
    useTestSession(admin.token);
    const transaction = await newTransaction(suite.context, { number: '٨/٦' });
    assert.equal(
      (
        await deleteJson(
          baseUrl,
          `/api/transactions/${transaction.id}?reason=${encodeURIComponent('أرشفة اختبار')}`,
        )
      ).status,
      200,
    );
    assert.equal(
      (await postJson(baseUrl, `/api/transactions/${transaction.id}/restore`)).status,
      200,
    );

    const events = await pool.query<{
      event_kind: string;
      actor_user_id: string | null;
      entity_id: string | null;
      new_values: Record<string, unknown> | null;
      old_values: Record<string, unknown> | null;
    }>(
      `SELECT event_kind, actor_user_id, entity_id, new_values, old_values
         FROM audit_logs WHERE entity_kind = 'transaction' AND entity_id = $1
        ORDER BY occurred_at ASC, id ASC`,
      [transaction.id],
    );
    assert.equal(events.rows.length, 2, 'حدث واحد لكل عملية');
    const [archiveEvent, restoreEvent] = events.rows;
    assert.equal(archiveEvent.event_kind, 'archive', 'الأرشفة نوع archive المعتمد في §31');
    assert.equal((archiveEvent.new_values as Record<string, unknown>).action, 'archive');
    assert.equal(
      (archiveEvent.new_values as Record<string, unknown>).deleteReason,
      'أرشفة اختبار',
      'السبب في القيم الجديدة',
    );
    assert.equal(archiveEvent.actor_user_id, admin.account.id, 'الفاعل من الجلسة');
    assert.equal(restoreEvent.event_kind, 'update', 'الاستعادة لا тип جديد بلا نصّ في الخطة');
    assert.equal((restoreEvent.new_values as Record<string, unknown>).action, 'restore');
    assert.ok(
      (restoreEvent.old_values as Record<string, unknown>).deletedAt !== null,
      'القيمة قبل الاستعادة في old_values',
    );
    assert.equal((restoreEvent.new_values as Record<string, unknown>).deletedAt, null);
    assert.equal(restoreEvent.actor_user_id, admin.account.id);

    // المسار الإداري للقراءة: `view_audit_logs` يعرض الحدثين.
    const read = await getJson<AuditLogDto[]>(baseUrl, '/api/audit-logs');
    assert.equal(read.status, 200);
    assert.ok(
      read.body.some((entry) => entry.eventKind === 'archive' && entry.entityId === transaction.id),
      'الحدث يظهر في سجل التدقيق المقروء',
    );
  });

  it('الموظف لا يُحذف (§13): لا مسار حذف، والحالة former تُبقي سجلاته', async () => {
    const admin = await actor('admin', '16091');
    useTestSession(admin.token);
    const employee = await newEmployee(suite.context, { name: 'منتسب Archival' });

    // لا مسار حذف: 404 لا تنفيذ (والحارس الخلفي family delete_archive).
    const removal = await deleteJson<ApiErrorBody>(baseUrl, `/api/employees/${employee.id}`);
    assert.equal(removal.status, 404, 'لا مسار حذف للموظف — ينتقل إلى former فقط');
    const afterAttempt = await getJson<{ status: string }>(
      baseUrl,
      `/api/employees/${employee.id}`,
    );
    assert.equal(afterAttempt.status, 200, 'الموظف لم يُفقد');

    const former = await postJson<{ status: string }>(
      baseUrl,
      `/api/employees/${employee.id}/status`,
      { status: 'former', serviceEndReason: 'تقاعد' },
    );
    assert.equal(former.status, 200, 'النقل إلى former هو الإجراء المعتمد');
    const history = await getJson<{ id: string }[]>(
      baseUrl,
      `/api/employees/${employee.id}/status-history`,
    );
    assert.equal(history.status, 200);
    assert.ok(history.body.length >= 1, 'سجل الحالة التاريخي باقٍ');
    const rows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM employees WHERE id = $1`,
      [employee.id],
    );
    assert.equal(rows.rows[0].count, '1', 'صف الموظف باقٍ في القاعدة');
  });
});
