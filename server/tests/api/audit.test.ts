/**
 * Phase 15 — Audit Log عبر HTTP الحقيقي (خادم فعلي + PostgreSQL معزولة).
 *
 * المرجع: `ALSQAYA_PLAN.md` §31 (Audit Log + Audit Integrity + اختبارات).
 * ما يُفحص هنا:
 * 1. الأحداث الحساسة الموجودة فعلاً تُسجَّل بعد نجاحها: وصول المرفقات
 *    (`sensitive_file_access`)، تغييرات الإتاحة (`create`/`update`)،
 *    نقل حالة الموظف (`status_change`) — والفاعل من الجلسة لا من العميل.
 * 2. القراءة محكومة بـ`view_audit_logs` حصراً (§10.1 وحدها تتابعه).
 * 3. لا مسار تعديل أو حذف — محاولة تغيير لا تغيّر سجلاً واحداً (§31).
 * 4. لا تُخزَّن كلمات المرور/OTP في السجل بعد الدخول الناجح والفاشل.
 * 5. محاولة وصول مرفوضة لا تُسجَّل كوصول ناجح — التدقيق لا يسبق
 *    التفويض ولا يحلّ محلّه.
 *
 * أحداث المصادقة/OTP/كشف السر مسجَّلة منذ Phase 11 وتظهر في نفس
 * الجدول — تُفحص قراءتها هنا، وكتابةها مغطاة في `tests/api/auth.test.ts`.
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
  patchJson,
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
  type EmployeeBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import { FileStorage } from '../../src/storage';
import type { AuditLogDto } from '../../src/api/dto';

const SECRET = 'S3cret-Start';

/** مرفق PDF اصطناعي بتوقيع صحيح (كما في اختبارات المرفقات). */
function fakePdf(marker: string): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(marker, 'latin1')]);
}

/** شكل مرفق بسيط كما يعيده الـAPI. */
interface AttachmentBody {
  id: string;
  transactionId: string;
}

describe('Phase 15 — Audit Log (HTTP)', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl = '';
  let storageRoot = '';

  before(async () => {
    storageRoot = await mkdtemp(join(os.tmpdir(), 'alsqaya-audit-'));
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
    // تفريغ محتوى الجذر بين الاختبارات (نفس عقد اختبارات المرفقات).
    await rm(storageRoot, { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });
  });

  /** حساب بدور وجلسة حقيقية (تسجيل + رفع دور + دخول). */
  async function actor(role: 'admin' | 'director' | 'employee', suffix: string) {
    const { employee, account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `AU-${suffix}`,
      phone: `0781${suffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `AU-${suffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200, `فشل دخول ${role}`);
    return { employee, account, token: login.body.sessionToken };
  }

  /** عدّ صفوف سجل التدقيق بقيد WHERE. */
  async function auditCount(where: string, params: unknown[] = []): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE ${where}`,
      params,
    );
    return Number(result.rows[0].count);
  }

  /** موظف موجود في القاعدة (بذر مباشر) لمسارات الإتاحة. */
  async function targetEmployee(suffix: string): Promise<{ id: string }> {
    const created = await newEmployee(suite.context, {
      name: `منتسب إتاحة ${suffix}`,
      badgeNumber: `AV-${suffix}`,
      phone: `0782${suffix}`,
    });
    return { id: created.id };
  }

  it('وصول مرفق حساس يُسجَّل بعد النجاح: فاعل + كيان + سياق جلسة + نتيجة', async () => {
    const admin = await actor('admin', '41011');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context);
    const uploaded = await postAttachment<AttachmentBody>(baseUrl, tx.id, {
      filename: 'وصول.pdf',
      content: fakePdf('audit-access'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(uploaded.status, 201);

    const download = await getAttachmentContent(baseUrl, tx.id, uploaded.body.id);
    assert.equal(download.status, 200, 'التحميل مصرَّح به بعد authorization والنطاق');

    const rows = await pool.query<{
      actor_user_id: string | null;
      entity_kind: string | null;
      entity_id: string | null;
      new_values: Record<string, unknown> | null;
    }>(
      `SELECT actor_user_id, entity_kind, entity_id, new_values
         FROM audit_logs WHERE event_kind = 'sensitive_file_access'`,
    );
    assert.equal(rows.rows.length, 1, 'حدث وصول واحد لكل تحميل ناجح');
    const row = rows.rows[0];
    assert.equal(row.actor_user_id, admin.account.id, 'الفاعل من الجلسة');
    assert.equal(row.entity_kind, 'attachment');
    assert.equal(row.entity_id, uploaded.body.id, 'المورد محدَّد بمعرّفه');
    const values = row.new_values as Record<string, unknown>;
    assert.equal(values.outcome, 'success');
    assert.equal(values.transactionId, tx.id);
    const context = values.context as { sessionId?: string } | undefined;
    assert.ok(context?.sessionId, 'سياق الجلسة محفوظ في new_values.context');
  });

  it('تحميل مرفوق كتاب خارج النطاق مرفوض ⇒ بلا حدث وصول ناجح (التدقيق لا يسبق النطاق)', async () => {
    const admin = await actor('admin', '41021');
    const employee = await actor('employee', '41022');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context, { visibility: 'Administrative' });
    const uploaded = await postAttachment<AttachmentBody>(baseUrl, tx.id, {
      filename: 'إداري.pdf',
      content: fakePdf('denied-access'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(uploaded.status, 201);

    useTestSession(employee.token);
    const denied = await getAttachmentContent(baseUrl, tx.id, uploaded.body.id);
    assert.equal(denied.status, 404, 'كتاب خارج النطاق يحجب وجوده (§12)');

    assert.equal(
      await auditCount(`event_kind = 'sensitive_file_access'`),
      0,
      'محاولة مرفوضة لا تُسجَّل وصولاً ناجحاً',
    );
  });

  it('تغييرات الإتاحة (منح ثم سحب) تُسجَّل كأحداث تدقيق بفاعلها وقيمتيها', async () => {
    const admin = await actor('admin', '41031');
    // الجلسة تُحقن **قبل** بذر الموظف: إنشاء الموظف نفسه مسار إداري
    // محميّ بجلسة (Phase 11/12) — لا كتابة بلا هوية.
    useTestSession(admin.token);
    const target = await targetEmployee('41032');
    const tx = await newTransaction(suite.context, { visibility: 'SpecificEmployees' });

    const granted = await postJson(baseUrl, `/api/transactions/${tx.id}/availability`, {
      employeeIds: [target.id],
    });
    assert.equal(granted.status, 201);
    const revoked = await deleteJson(
      baseUrl,
      `/api/transactions/${tx.id}/availability/${target.id}`,
    );
    assert.equal(revoked.status, 204);

    const grants = await pool.query<{
      actor_user_id: string;
      entity_id: string;
      new_values: Record<string, unknown>;
    }>(
      `SELECT actor_user_id, entity_id, new_values FROM audit_logs
        WHERE entity_kind = 'transaction_availability' AND event_kind = 'create'`,
    );
    assert.equal(grants.rows.length, 1, 'المنح يُسجَّل كحدث إنشاء');
    assert.equal(grants.rows[0].actor_user_id, admin.account.id);
    assert.equal(grants.rows[0].entity_id, tx.id);
    assert.deepEqual(grants.rows[0].new_values.employeeIds, [target.id]);

    const revokes = await pool.query<{
      actor_user_id: string;
      old_values: Record<string, unknown> | null;
      new_values: Record<string, unknown>;
    }>(
      `SELECT actor_user_id, old_values, new_values FROM audit_logs
        WHERE entity_kind = 'transaction_availability' AND event_kind = 'update'`,
    );
    assert.equal(revokes.rows.length, 1, 'السحب يُسجَّل كحدث تعديل');
    assert.equal(revokes.rows[0].actor_user_id, admin.account.id);
    assert.equal(
      (revokes.rows[0].old_values as Record<string, unknown>).revoked,
      false,
      'old_values تحمل الحالة قبل السحب',
    );
    assert.equal(revokes.rows[0].new_values.revoked, true);
  });

  it('نقل حالة الموظف يُسجَّل status_change بالقيمتين old/new وفاعله', async () => {
    const admin = await actor('admin', '41041');
    useTestSession(admin.token);
    const employee = await newEmployee(suite.context);
    const current = await getJson<EmployeeBody>(baseUrl, `/api/employees/${employee.id}`);
    assert.equal(current.status, 200);

    const changed = await postJson<{ status: string }>(
      baseUrl,
      `/api/employees/${employee.id}/status`,
      { status: 'former', serviceEndReason: 'تقاعد' },
    );
    assert.equal(changed.status, 200, `نقل الحالة: ${JSON.stringify(changed.body)}`);

    const rows = await pool.query<{
      actor_user_id: string;
      entity_id: string;
      old_values: Record<string, unknown> | null;
      new_values: Record<string, unknown> | null;
    }>(
      `SELECT actor_user_id, entity_id, old_values, new_values
         FROM audit_logs WHERE event_kind = 'status_change'`,
    );
    assert.equal(rows.rows.length, 1);
    const row = rows.rows[0];
    assert.equal(row.actor_user_id, admin.account.id, 'الفاعل من الجلسة');
    assert.equal(row.entity_id, employee.id);
    assert.equal((row.old_values as Record<string, unknown>).status, current.body.status);
    assert.equal((row.new_values as Record<string, unknown>).status, 'former');
    assert.equal((row.new_values as Record<string, unknown>).outcome, 'success');
  });

  it('view_audit_logs تحكم القراءة: مسؤول 200، مدير ومنتسب 403، بلا جلسة 401', async () => {
    const admin = await actor('admin', '41051');
    const director = await actor('director', '41052');
    const employee = await actor('employee', '41053');

    useTestSession(admin.token);
    const read = await getJson<AuditLogDto[]>(baseUrl, '/api/audit-logs');
    assert.equal(read.status, 200, `المسؤول يقرأ: ${JSON.stringify(read.body)}`);
    assert.ok(Array.isArray(read.body), 'الاستجابة قائمة');
    assert.ok(read.body.length > 0, 'أحداث الدخول مسجَّلة ومقرؤة');
    // أحداث المصادقة في نفس السجل (Phase 11) وفاعليتها من الجلسة.
    const loginEvent = read.body.find(
      (entry) => entry.eventKind === 'login' && entry.actorUserId === admin.account.id,
    );
    assert.ok(loginEvent !== undefined, 'حدث دخول المسؤول مرئي في القراءة');

    useTestSession(director.token);
    const directorRead = await getJson<ApiErrorBody>(baseUrl, '/api/audit-logs');
    assert.equal(directorRead.status, 403, 'المدير لا يملك view_audit_logs (§10.2)');
    assert.equal(directorRead.body.error?.code, 'PERMISSION_DENIED');

    useTestSession(employee.token);
    const employeeRead = await getJson<ApiErrorBody>(baseUrl, '/api/audit-logs');
    assert.equal(employeeRead.status, 403, 'المنتسب لا يملك view_audit_logs (§10.3)');
    assert.equal(employeeRead.body.error?.code, 'PERMISSION_DENIED');

    useTestSession(null);
    const anonymous = await requestWithToken<ApiErrorBody>(baseUrl, '/api/audit-logs', {
      method: 'GET',
      token: null,
    });
    assert.equal(anonymous.status, 401, 'بلا جلسة: مصادقة قبل كل شيء');
    assert.equal(anonymous.body?.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  it('لا مسار تعديل أو حذف للسجل — محاولة المسؤول لا تغيّر أي صف (§31)', async () => {
    const admin = await actor('admin', '41061');
    useTestSession(admin.token);
    const before = await pool.query<{ count: string; sample: string }>(
      `SELECT count(*)::text AS count, min(id::text) AS sample FROM audit_logs`,
    );
    assert.ok(Number(before.rows[0].count) > 0, 'السجل يحوي أحداثاً قبل المحاولة');

    // المسؤول يملك update/delete/create وview_audit_logs — ومع ذلك لا مسار.
    const patched = await patchJson<ApiErrorBody>(baseUrl, '/api/audit-logs', {
      eventKind: 'x',
    });
    assert.equal(patched.status, 404, 'لا PATCH على سجل التدقيق');
    const removed = await deleteJson<ApiErrorBody>(baseUrl, '/api/audit-logs');
    assert.equal(removed.status, 404, 'لا DELETE على سجل التدقيق');
    const posted = await postJson<ApiErrorBody>(baseUrl, '/api/audit-logs', {
      eventKind: 'x',
    });
    assert.equal(posted.status, 404, 'لا POST لصنع حدث من العميل');

    const afterAttempts = await pool.query<{ count: string; sample: string }>(
      `SELECT count(*)::text AS count, min(id::text) AS sample FROM audit_logs`,
    );
    assert.deepEqual(
      { count: afterAttempts.rows[0].count, sample: afterAttempts.rows[0].sample },
      { count: before.rows[0].count, sample: before.rows[0].sample },
      'لا زيادة ولا تغيّر بعد محاولات الكتابة',
    );

    // المستخدم العادي لا يصل أصلاً: عائلة method ترفضه قبل المسار.
    const employee = await actor('employee', '41062');
    useTestSession(employee.token);
    const employeePatch = await patchJson<ApiErrorBody>(baseUrl, '/api/audit-logs', {});
    assert.equal(employeePatch.status, 403, 'المنتسب مرفوض بعائلة update');
    assert.equal(employeePatch.body.error?.code, 'PERMISSION_DENIED');
  });

  it('لا تُخزَّن كلمات المرور ولا OTP: الدخول الناجح والفاشل بلا أثر للسرّ', async () => {
    const admin = await actor('admin', '41071');
    useTestSession(admin.token);
    const failed = await postJson(baseUrl, '/api/auth/login', {
      identifier: admin.account.username,
      secret: 'Wrong-Secret-9',
    });
    assert.equal(failed.status, 401, 'الدخول الفاشل مسجَّل كمحاولة لا كسرّ');

    const leaked = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
        WHERE COALESCE(new_values::text, '') ILIKE $1
           OR COALESCE(new_values::text, '') ILIKE $2
           OR COALESCE(old_values::text, '') ILIKE $1`,
      [`%${SECRET}%`, '%Wrong-Secret-9%'],
    );
    assert.equal(Number(leaked.rows[0].count), 0, 'لا قيمة سرّية داخل jsonb');

    const logins = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE event_kind = 'login'`,
    );
    assert.ok(Number(logins.rows[0].count) > 0, 'الأحداث نفسها مسجَّلة رغم حذف الأسرار');
  });
});
