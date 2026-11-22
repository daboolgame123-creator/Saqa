/**
 * Phase 14 — المرفقات والتخزين المركزي (HTTP على خادم حقيقي).
 *
 * الاختبارات تمرّ بالمسار الكامل: Express → الجلسات → RBAC → Access Scope
 * → controller → خدمة → { مستودع · قرص } → استجابة. لا mock في أي طبقة، ولا
 * اختصار بقراءة القرص مباشرة لإثبات النجاح.
 *
 * البذور كلها اصطناعية: كل بايت مولَّد داخل الملف، وكل مجلد تخزين مؤقت
 * في `os.tmpdir()` يُنظَّف بعد EACH — لأن اختبار «الملف مفقود» يحتاج غياباً
 * نظيفاً لا صدفةَ بقايا من اختبار سابق.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
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
  newRegisteredAccount,
  setAccountRole,
  newTransaction,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import { FileStorage, buildStorageKey, computeContentHash } from '../../src/storage';

const SECRET = 'S3cret-Start';

/** مرفق PDF اصطناعي بتوقيع صحيح. */
function fakePdf(marker: string): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(marker, 'latin1')]);
}

/** مرفق PNG اصطناعي بتوقيع صحيح. */
function fakePng(marker: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(marker, 'latin1'),
  ]);
}

/** شكل مرفق كما يعيده الـAPI. */
interface AttachmentBody {
  id: string;
  transactionId: string;
  name: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  integrityState: string | null;
  ocrState: string | null;
}

describe('Phase 14 — المرفقات والتخزين المركزي (HTTP)', () => {
  let suite: ApiTestSuite;
  let baseUrl = '';
  let pool: Pool;
  let storageRoot = '';
  let storage: FileStorage;

  before(async () => {
    storageRoot = await mkdtemp(join(os.tmpdir(), 'alsqaya-attach-'));
    storage = new FileStorage({ rootDir: storageRoot });
    // طبقة التخزين تُحقن صريحاً بدل قراءة `ATTACHMENT_STORAGE_DIR`، فلا
    // تلمس الاختبارات قرصاً إنتاجياً ولا تعتمد على ترتيب استيراد الوحدات.
    suite = await startApiSuite(storage);
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
  });

  afterEach(async () => {
    // تفريغ **محتوى** الجذر لا استبداله: الخدمات تمسك الطبقة نفسها منذ
    // الإقلاع، فاستبدال الكائن كان سيجعل الاختبار يكتب خارج ما تقرأه
    // الخدمة. الجذر يبقى ثابتاً طوال الملف ويُعاد تصفييره بين الاختبارات.
    await rm(storageRoot, { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });
  });

  /** حساب برفعة جاهزة ودور محدّد (تسجيل حقيقي، بلا محاكاة). */
  async function actor(role: 'admin' | 'director' | 'employee', badgeSuffix: string) {
    const { account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `BG-${badgeSuffix}`,
      phone: `0770${badgeSuffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `BG-${badgeSuffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200, 'فشل تسجيل الدخول في بيانات الاختبار');
    return login.body.sessionToken;
  }

  it('رفع مرفق: 201، metadata كاملة، والبايتات على القرص خارج PostgreSQL', async () => {
    useTestSession(await actor('admin', '3101'));
    const transaction = await newTransaction(suite.context, { subject: 'كتاب بمرفق' });

    const content = fakePdf('first');
    const created = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'كتاب رسمي.pdf',
      content,
      declaredMimeType: 'application/pdf',
      type: 'كتاب رئيسي',
    });

    assert.equal(created.status, 201, JSON.stringify(created.body));
    // الاسم الأصلي محفوظ كما ورد، والـstable ID من القاعدة لا من الاسم.
    assert.equal(created.body.originalFilename, 'كتاب رسمي.pdf');
    assert.match(created.body.id, /^[0-9a-f-]{36}$/i, 'المعرّف uuid من القاعدة');
    assert.equal(created.body.transactionId, transaction.id);
    // MIME من المحتوى، والحجم الحقيقي، والبصمة، والحالة بعد قراءة فعلية.
    assert.equal(created.body.mimeType, 'application/pdf');
    assert.equal(created.body.sizeBytes, content.length);
    assert.equal(created.body.contentHash, computeContentHash(content));
    assert.equal(created.body.integrityState, 'verified', 'قُرئ الملف وقوبلت بصمته');
    // OCR يبقى بلا قيمة: قيمها في Phase 17.
    assert.equal(created.body.ocrState, null);

    // **الفصل المطلوب في §30**: البايتات على القرص، والـmetadata في القاعدة.
    const storedPath = storage.absolutePathFor(buildStorageKey(created.body.id));
    assert.deepEqual(await readFile(storedPath), content, 'البايتات في التخزين المركزي');
    assert.ok(
      !storedPath.includes('كتاب'),
      'مسار القرص لا يحتوي اسم الملف الأصلي — المعرّف هو الهوية',
    );
  });

  it('قائمة مرفقات الكتاب: مرفق واحد أو عدة، وكلٌّ بهوية مستقلة', async () => {
    useTestSession(await actor('admin', '3102'));
    const transaction = await newTransaction(suite.context);

    const first = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'الكتاب الأول.pdf',
      content: fakePdf('one'),
      declaredMimeType: 'application/pdf',
    });
    const second = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'الكتاب الثاني.png',
      content: fakePng('two'),
      declaredMimeType: 'image/png',
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const list = await getJson<AttachmentBody[]>(
      baseUrl,
      `/api/transactions/${transaction.id}/attachments`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2, 'كتاب واحد يحمل مرفقين');
    // هوية مستقلة (metadata مستقل) لكل مرفق — لا تكرار ولا دمج.
    assert.notEqual(list.body[0].id, list.body[1].id);
    const names = list.body.map((a) => a.originalFilename).sort();
    assert.deepEqual(names, ['الكتاب الأول.pdf', 'الكتاب الثاني.png']);
    // العلاقة قائمة: كل مرفق يعود لكتابه.
    for (const attachment of list.body) {
      assert.equal(attachment.transactionId, transaction.id);
    }
  });

  it('تحميل مصرَّح به: البايتات نفسها وترويسة content-disposition بلا تخزين مؤقت', async () => {
    useTestSession(await actor('admin', '3103'));
    const transaction = await newTransaction(suite.context);
    const content = fakePdf('download-me');
    const created = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'قابل للتنزيل.pdf',
      content,
      declaredMimeType: 'application/pdf',
    });
    assert.equal(created.status, 201);

    const response = await getAttachmentContent(baseUrl, transaction.id, created.body.id);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(
      response.headers.get('content-disposition') ?? '',
      /attachment/,
      'الملف يُقدَّم كمرفق لا كمحتوى مضمَّن في الصفحة',
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
  });

  it('تحميل مرفق كتاب خارج النطاق ممنوع: 404 لا 403 ولا بايتات (§30 · access check)', async () => {
    useTestSession(await actor('admin', '3104'));
    // كتاب إداري: مرئي للمسؤول والمدير، محجوب عن المنتسب.
    const adminTx = await newTransaction(suite.context, {
      visibility: 'Administrative',
      subject: 'كتاب إداري',
    });
    const created = await postAttachment<AttachmentBody>(baseUrl, adminTx.id, {
      filename: 'سري.pdf',
      content: fakePdf('secret'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(created.status, 201);

    // **طلب مباشر بلا أي واجهة** — لا نقرة زر ولا إظهار عنصر.
    const employeeToken = await actor('employee', '3105');
    const content = await requestWithToken<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${adminTx.id}/attachments/${created.body.id}/content`,
      { token: employeeToken },
    );
    // 404 لا 403: الخادم لا يميّز «غير موجود» عن «غير مرئي» (§29/§30).
    assert.equal(content.status, 404);
    assert.equal(content.body?.error?.code, 'RESOURCE_NOT_FOUND');

    // والقائمة نفسها محجوبة — لا يسرّب وجود المرفق أصلاً.
    const list = await requestWithToken<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${adminTx.id}/attachments`,
      { token: employeeToken },
    );
    assert.equal(list.status, 404);
  });

  it('Phase13-B: SpecificEmployees file bytes are granted and revoked on the same Bearer', async () => {
    // No production disk or database: temp FileStorage + isolated pg only.
    const adminToken = await actor('admin', '3911');
    const employeeToken = await actor('employee', '3912');
    const employee = await pool.query<{ id: string }>(
      'SELECT id FROM employees WHERE badge_number = $1', ['BG-3912'],
    );
    const employeeId = employee.rows[0]?.id;
    assert.ok(employeeId, 'synthetic employee id must exist');

    useTestSession(adminToken);
    const transaction = await newTransaction(suite.context, {
      number: '13-B-file-access',
      visibility: 'SpecificEmployees',
      subject: 'Synthetic scoped attachment',
    });
    const bytes = fakePdf('phase13-grant-revoke');
    const created = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'scope-revoke.pdf',
      content: bytes,
      declaredMimeType: 'application/pdf',
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    const filePath = `/api/transactions/${transaction.id}/attachments/${id}`;

    // Merely knowing transaction/attachment IDs never grants access.
    useTestSession(employeeToken);
    assert.equal((await getAttachmentContent(baseUrl, transaction.id, id)).status, 404);
    assert.equal((await getJson(baseUrl, filePath + '/integrity')).status, 404);
    assert.equal((await getJson(baseUrl, `/api/transactions/${transaction.id}/attachments`)).status, 404);

    useTestSession(adminToken);
    const grant = await postJson(baseUrl, `/api/transactions/${transaction.id}/availability`, {
      employeeIds: [employeeId],
    });
    assert.equal(grant.status, 201);

    // Existing session gains only this one book and its bytes after grant.
    useTestSession(employeeToken);
    const permitted = await getAttachmentContent(baseUrl, transaction.id, id);
    assert.equal(permitted.status, 200);
    assert.equal(permitted.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await permitted.arrayBuffer()), bytes);
    const visible = await getJson<AttachmentBody[]>(
      baseUrl, `/api/transactions/${transaction.id}/attachments`,
    );
    assert.equal(visible.status, 200);
    assert.equal(visible.body.length, 1);
    assert.equal(visible.body[0].id, id);
    assert.equal((await getJson(baseUrl, filePath + '/integrity')).status, 200);

    useTestSession(adminToken);
    const revoked = await deleteJson(
      baseUrl, `/api/transactions/${transaction.id}/availability/${employeeId}`,
    );
    assert.equal(revoked.status, 204);

    // Same Bearer no longer reads any byte, metadata or derived file status.
    useTestSession(employeeToken);
    const hidden = await getAttachmentContent(baseUrl, transaction.id, id);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.headers.get('cache-control'), 'no-store');
    assert.equal((await getJson(baseUrl, filePath + '/integrity')).status, 404);
    assert.equal((await getJson(baseUrl, `/api/transactions/${transaction.id}/attachments`)).status, 404);
    assert.equal((await getJson(baseUrl, `/api/transactions/${transaction.id}`)).status, 404);

    // Revocation is not deletion: an authorized administrator can still read
    // the original exact bytes after the employee is denied.
    useTestSession(adminToken);
    const adminRead = await getAttachmentContent(baseUrl, transaction.id, id);
    assert.equal(adminRead.status, 200);
    assert.deepEqual(Buffer.from(await adminRead.arrayBuffer()), bytes);
    const records = await pool.query<{ revokedAt: string | null }>(
      `SELECT revoked_at AS "revokedAt" FROM transaction_availability
       WHERE transaction_id=$1 AND employee_id=$2`,
      [transaction.id, employeeId],
    );
    assert.equal(records.rows.length, 1);
    assert.ok(records.rows[0].revokedAt, 'revoked grant stays in history');
  });

  it('المنتسب مرفوض من الرفع بـ403 (RBAC Phase 12) قبل أي فحص للملف', async () => {
    useTestSession(await actor('admin', '3106'));
    const transaction = await newTransaction(suite.context, { visibility: 'PublicToEmployees' });
    const employeeToken = await actor('employee', '3107');

    const denied = await requestWithToken<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${transaction.id}/attachments`,
      { method: 'POST', token: employeeToken },
    );
    // `create` هي عائلة POST: المنتسب لا يملكها ⇒ 403 PERMISSION_DENIED.
    assert.equal(denied.status, 403);
    assert.equal(denied.body?.error?.code, 'PERMISSION_DENIED');
  });

  it('MIME validation: امتداد .pdf ومحتوى نصي ⇒ رفض (لا ثقة بالامتداد)', async () => {
    useTestSession(await actor('admin', '3108'));
    const transaction = await newTransaction(suite.context);

    const rejected = await postAttachment<ApiErrorBody>(baseUrl, transaction.id, {
      filename: 'ليس-Really.pdf',
      content: Buffer.from('نص عادي وليس PDF', 'utf8'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body?.error?.code, 'ATTACHMENT_UNSUPPORTED_MEDIA_TYPE');
  });

  it('اختلاف النوع المعلن عن المحتوى ⇒ رفض MimeMismatch', async () => {
    useTestSession(await actor('admin', '3109'));
    const transaction = await newTransaction(suite.context);

    const rejected = await postAttachment<ApiErrorBody>(baseUrl, transaction.id, {
      filename: 'كتاب.png',
      content: fakePdf('actually-pdf'),
      declaredMimeType: 'image/png',
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body?.error?.code, 'ATTACHMENT_MIME_MISMATCH');
  });

  it('كشف الملف التالف: تعديل البايتات على القرص ⇒ integrity_state = corrupted', async () => {
    useTestSession(await actor('admin', '3110'));
    const transaction = await newTransaction(suite.context);
    const created = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'سيتلف.pdf',
      content: fakePdf('original'),
      declaredMimeType: 'application/pdf',
    });
    assert.equal(created.body.integrityState, 'verified');

    // تلف/استبدال خارج النظام: الملف على القرص لا يطابق البصمة المحفوظة.
    const storedPath = storage.absolutePathFor(buildStorageKey(created.body.id));
    await writeFile(storedPath, fakePdf('tampered'));

    const checked = await getJson<AttachmentBody>(
      baseUrl,
      `/api/transactions/${transaction.id}/attachments/${created.body.id}/integrity`,
    );
    assert.equal(checked.status, 200);
    assert.equal(checked.body.integrityState, 'corrupted');
  });

  it('الملف المفقود من القرص ⇒ integrity_state = missing (ليس corrupted)', async () => {
    useTestSession(await actor('admin', '3111'));
    const transaction = await newTransaction(suite.context);
    const created = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'سيختفي.pdf',
      content: fakePdf('will-vanish'),
      declaredMimeType: 'application/pdf',
    });

    // حذف الملف من القرص مباشرة (محاكاة فقدان خارجي، لا مسار حذف في الـAPI).
    const storedPath = storage.absolutePathFor(buildStorageKey(created.body.id));
    await rm(storedPath, { force: true });

    const checked = await getJson<AttachmentBody>(
      baseUrl,
      `/api/transactions/${transaction.id}/attachments/${created.body.id}/integrity`,
    );
    assert.equal(checked.body.integrityState, 'missing');

    // والتحميل بعده يفشل بخطأ «ملف غير موجود» لا استجابة فارغة صامتة.
    const download = await getAttachmentContent(baseUrl, transaction.id, created.body.id);
    assert.equal(download.status, 404);
  });

  it('التحقق من البصمة: الملف المنزَّل يعطي البصمة المحفوظة نفسها', async () => {
    useTestSession(await actor('admin', '3112'));
    const transaction = await newTransaction(suite.context);
    const content = fakePdf('round-trip');
    const created = await postAttachment<AttachmentBody>(baseUrl, transaction.id, {
      filename: 'ذهاب وإياب.pdf',
      content,
      declaredMimeType: 'application/pdf',
    });

    const download = await getAttachmentContent(baseUrl, transaction.id, created.body.id);
    const downloaded = Buffer.from(await download.arrayBuffer());
    assert.equal(computeContentHash(downloaded), created.body.contentHash, 'البصمة متطابقة');
  });

  it('مرفق بـtransactionId مختلف ⇒ 404 (الوصول عبر كتابه لا بالمعرّف وحده)', async () => {
    useTestSession(await actor('admin', '3113'));
    const first = await newTransaction(suite.context, { number: '١/ص' });
    const second = await newTransaction(suite.context, { number: '٢/ص' });
    const created = await postAttachment<AttachmentBody>(baseUrl, first.id, {
      filename: 'مرتبط بالأول.pdf',
      content: fakePdf('first-book'),
      declaredMimeType: 'application/pdf',
    });

    // معرّف مرفق صحيح لكن كتاب آخر: يجب ألا يُخدم.
    const crossed = await getJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${second.id}/attachments/${created.body.id}/integrity`,
    );
    assert.equal(crossed.status, 404);
  });

  it('بلا جلسة ⇒ 401 على مسار المرفقات (الهوية قبل كل شيء)', async () => {
    useTestSession(null);
    const response = await requestWithToken<ApiErrorBody>(baseUrl, '/api/transactions/x/attachments', {
      token: null,
    });
    assert.equal(response.status, 401);
  });
});