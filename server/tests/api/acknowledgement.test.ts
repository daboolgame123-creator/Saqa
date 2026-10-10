/**
 * Phase 15 — سجل الاطلاع الرسمي (Acknowledgement) عبر HTTP الحقيقي.
 *
 * المرجع: `ALSQAYA_PLAN.md` §9.1/§9.2 و§31 (View Log + Historical Data
 * and Acknowledgement + اختبارات).
 *
 * الفصل الذي يُفحص هنا حرفياً:
 * - **فتح الصفحة** (GET) ليس اطلاعياً — لا صف في `view_logs`.
 * - **تنزيل المرفق** حدث وصول حساس في `audit_logs` — لا اطلاع.
 * - **«اطلعت»** وحده: POST صريح ينشئ الختم الرسمي، idempotent،
 *   والفاعل من الجلسة حتى مع تزوير الجسم.
 *
 * الاستيراد التاريخي غير منفَّذ أصلاً (لا Phase مستقبلية هنا)، فلا
 * اختبار لولده — والتصميم يمنعه مبدئياً: لا شيء يكتب `view_logs`
 * سوى مسار «اطلعت» الصريح.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  getAttachmentContent,
  getJson,
  postAttachment,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
} from './apiTestHelpers';
import {
  newRegisteredAccount,
  newTransaction,
  setAccountRole,
  type TransactionBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import { FileStorage } from '../../src/storage';
import type { AcknowledgementDto } from '../../src/api/dto';

const SECRET = 'S3cret-Start';

/** مرفق PDF اصطناعي بتوقيع صحيح. */
function fakePdf(marker: string): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(marker, 'latin1')]);
}

interface AttachmentBody {
  id: string;
}

describe('Phase 15 — سجل الاطلاع الرسمي «اطلعت» (HTTP)', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl = '';
  let storageRoot = '';

  before(async () => {
    storageRoot = await mkdtemp(join(os.tmpdir(), 'alsqaya-ack-'));
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

  /** حساب بدور وجلسة حقيقية. */
  async function actor(role: 'admin' | 'director' | 'employee', suffix: string) {
    const { employee, account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `AC-${suffix}`,
      phone: `0783${suffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `AC-${suffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200, `فشل دخول ${role}`);
    return { employee, account, token: login.body.sessionToken };
  }

  /** عدّ سجلات الاطلاع لكتاب. */
  async function viewLogCount(transactionId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM view_logs WHERE transaction_id = $1`,
      [transactionId],
    );
    return Number(result.rows[0].count);
  }

  it('«اطلعت» صريح: ينشئ سجل اطلاع ثابتاً بفاعل من الجلسة (§9.1 و§9.2)', async () => {
    const admin = await actor('admin', '42011');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context);

    const ack = await postJson<AcknowledgementDto>(
      baseUrl,
      `/api/transactions/${tx.id}/acknowledge`,
    );
    assert.equal(ack.status, 200, `رد الاعتراف: ${JSON.stringify(ack.body)}`);
    assert.equal(ack.body.transactionId, tx.id);
    assert.equal(ack.body.userId, admin.account.id, 'الفاعل من الجلسة لا من العميل');
    assert.ok(ack.body.viewedAt !== '' && ack.body.acknowledgedAt !== null, 'الختم موجود');

    const rows = await pool.query<{
      user_id: string | null;
      employee_id: string | null;
      acknowledged_at: string | null;
      session_ref: string | null;
    }>(
      `SELECT user_id, employee_id, acknowledged_at, session_ref
         FROM view_logs WHERE transaction_id = $1`,
      [tx.id],
    );
    assert.equal(rows.rows.length, 1, 'صف واحد لكل حالة منطقية');
    assert.equal(rows.rows[0].user_id, admin.account.id);
    assert.equal(rows.rows[0].employee_id, admin.account.employeeId, 'المنتسب مرتبط من الجلسة');
    assert.ok(rows.rows[0].acknowledged_at !== null, 'الختم الرسمي محفوظ');
    assert.ok(rows.rows[0].session_ref !== null, 'بيان الجلسة للتدقيق (§9.2)');
  });

  it('تكرار «اطلعت» idempotent: لا صف ثانٍ ولا ختم جديد — والقيد يمنع الازدواج في القاعدة', async () => {
    const admin = await actor('admin', '42021');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context);

    const first = await postJson<AcknowledgementDto>(
      baseUrl,
      `/api/transactions/${tx.id}/acknowledge`,
    );
    assert.equal(first.status, 200);
    const second = await postJson<AcknowledgementDto>(
      baseUrl,
      `/api/transactions/${tx.id}/acknowledge`,
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id, 'الصف نفسه لا صف جديد');
    assert.equal(
      second.body.acknowledgedAt,
      first.body.acknowledgedAt,
      'الختم الأول يبقى — لا حالة رسمية جديدة زائفة',
    );
    assert.equal(await viewLogCount(tx.id), 1, 'صف واحد بعد التكرار');

    // القيد الفريد (ترحيل 0008) يمنع الازدواج حتى من خارج المسار.
    await assert.rejects(
      () =>
        pool.query(`INSERT INTO view_logs (transaction_id, user_id) VALUES ($1, $2)`, [
          tx.id,
          admin.account.id,
        ]),
      /duplicate key|unique constraint/i,
      'القاعدة نفسها ترفض الصف المكرر',
    );
    assert.equal(await viewLogCount(tx.id), 1, 'المحاولة المرفوضة لم تغيّر شيئاً');
  });

  it('فتح الكتاب ليس اطلاعياً: القراءة لا تنشئ سجل اطلاع', async () => {
    const admin = await actor('admin', '42031');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context);

    const single = await getJson<TransactionBody>(baseUrl, `/api/transactions/${tx.id}`);
    assert.equal(single.status, 200, 'الصفحة فُتحت فعلاً');
    const list = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.equal(list.status, 200);
    assert.ok(list.body.some((entry) => entry.id === tx.id));

    assert.equal(
      await viewLogCount(tx.id),
      0,
      'GET لا يكتب view_logs — الاطلاع ليس فتح الصفحة',
    );
  });

  it('تنزيل المرفق ليس اطلاعاً — بل حدث وصول حساس في سجل التدقيق', async () => {
    const admin = await actor('admin', '42041');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context);
    const uploaded = await postAttachment<AttachmentBody>(baseUrl, tx.id, {
      filename: 'اطلاع.pdf',
      content: fakePdf('ack-vs-download'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(uploaded.status, 201);

    const download = await getAttachmentContent(baseUrl, tx.id, uploaded.body.id);
    assert.equal(download.status, 200);

    assert.equal(
      await viewLogCount(tx.id),
      0,
      'التنزيل لا يختم «اطلعت» ولا ينشئ سجل اطلاع',
    );
    const accesses = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE event_kind = 'sensitive_file_access'`,
    );
    assert.equal(Number(accesses.rows[0].count), 1, 'التنزيل مسجَّل كوصول حساس في Audit');
  });

  it('المنتسب يقرّ ما يراه فقط: كتاب عام 200، وكتاب خارج نطاقه 404 بلا سجل', async () => {
    const admin = await actor('admin', '42051');
    const employee = await actor('employee', '42052');
    useTestSession(admin.token);
    const publicTx = await newTransaction(suite.context, {
      number: '١/عام',
      visibility: 'PublicToEmployees',
      subject: 'كتاب عام',
    });
    const hiddenTx = await newTransaction(suite.context, {
      number: '٢/إداري',
      visibility: 'Administrative',
      subject: 'كتاب إداري',
    });

    useTestSession(employee.token);
    const allowed = await postJson<AcknowledgementDto>(
      baseUrl,
      `/api/transactions/${publicTx.id}/acknowledge`,
    );
    assert.equal(allowed.status, 200, `المنتسب يقرّ كتاباً عاماً: ${JSON.stringify(allowed.body)}`);
    assert.equal(allowed.body.userId, employee.account.id);

    const blocked = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${hiddenTx.id}/acknowledge`,
    );
    assert.equal(blocked.status, 404, 'خارج النطاق: حجب الوجود لا اعتراف (§12)');
    assert.equal(blocked.body.error?.code, 'RESOURCE_NOT_FOUND');

    assert.equal(await viewLogCount(publicTx.id), 1, 'الاطلاع المسموح محفوظ');
    assert.equal(await viewLogCount(hiddenTx.id), 0, 'لا سجل لمحاولة محجوبة');
  });

  it('جسم مزوَّر لا يغيّر الفاعل: userId/employeeId من العميل متجاهَل', async () => {
    const admin = await actor('admin', '42061');
    const employee = await actor('employee', '42062');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context, {
      visibility: 'PublicToEmployees',
      subject: 'كتاب مزوَّر',
    });

    // المنتسب يحاول «الاطلاع نيابةً عن» المسؤول عبر جسم الطلب.
    useTestSession(employee.token);
    const spoofed = await postJson<AcknowledgementDto>(
      baseUrl,
      `/api/transactions/${tx.id}/acknowledge`,
      { userId: admin.account.id, employeeId: admin.account.employeeId },
    );
    assert.equal(spoofed.status, 200);
    assert.equal(spoofed.body.userId, employee.account.id, 'الفاعل هو صاحب الجلسة');
    assert.equal(spoofed.body.employeeId, employee.account.employeeId, 'وليس منسوب الجسم');

    const rows = await pool.query<{ user_id: string | null }>(
      `SELECT user_id FROM view_logs WHERE transaction_id = $1`,
      [tx.id],
    );
    assert.equal(rows.rows[0].user_id, employee.account.id, 'القاعدة تحفظ الفاعل الحقيقي');
  });

  it('حارس المسار: بلا جلسة 401، ودور خارج المصفوفة (archivist) 403', async () => {
    const admin = await actor('admin', '42071');
    useTestSession(admin.token);
    const tx = await newTransaction(suite.context);

    useTestSession(null);
    const anonymous = await requestWithToken<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${tx.id}/acknowledge`,
      { method: 'POST', token: null },
    );
    assert.equal(anonymous.status, 401, 'الهوية قبل كل شيء');
    assert.equal(anonymous.body?.error?.code, 'AUTHENTICATION_REQUIRED');

    // archivist: قيمة موروثة خارج مصفوفة §28 — fail-closed (لا `view`).
    const { account } = await newRegisteredAccount(suite.context, {
      badgeNumber: 'AC-42072',
      phone: '078342072',
      secret: SECRET,
    });
    await setAccountRole(suite.context, account.id, 'archivist');
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: 'AC-42072',
      secret: SECRET,
    });
    assert.equal(login.status, 200);
    const archivistAck = await requestWithToken<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${tx.id}/acknowledge`,
      { method: 'POST', token: login.body.sessionToken },
    );
    assert.equal(archivistAck.status, 403, 'استثناء المسار يفرض عائلة view لا يلغي الفرض');
    assert.equal(archivistAck.body?.error?.code, 'PERMISSION_DENIED');

    assert.equal(await viewLogCount(tx.id), 0, 'لا اطلاع لأي محاولة مرفوضة');
  });
});
