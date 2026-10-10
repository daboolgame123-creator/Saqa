/**
 * Phase 20 — اختبارات الـHTTP الحقيقية لنطاق الكتب:
 * الكتب المرتبطة · Duplicate Detection · انتقال الحالة · الإعمام
 * · الصلاحيات · Access Scope · القفل التفاؤلي.
 *
 * المرجع: `ALSQAYA_PLAN.md` §36 · §8.1 · §9.1 · §10.1/§10.2/§10.3
 * · §12 · §19 · §28 · §31 · §32 · §33 · §37.
 *
 * الاختبارات تخاطب خادماً حقيقياً على منفذ عشوائي — لا mock ولا React:
 * `middleware → validation → controller → service → repository → PostgreSQL`.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  deleteJson,
  getJson,
  patchJson,
  postJson,
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
import type {
  DuplicateWarningDto,
  TransactionRelationsDto,
} from '../../src/api/dto';

const SECRET = 'S3cret-Start';

/** استجابة إنشاء كتاب مع حقل التحذير (§36). */
type CreatedBook = TransactionBody & { duplicateWarning: DuplicateWarningDto };

/** ارتباط كما يعيده الـAPI. */
interface RelationBody {
  id: string;
  transactionId: string;
  relatedTransactionId: string;
  createdBy?: string;
}

describe('Phase 20 — Archive Domain Server (HTTP)', () => {
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
    useTestSession(null);
  });

  /** حساب بدور وجلسة حقيقية (تسجيل + رفع دور + دخول). */
  async function actor(role: 'admin' | 'director' | 'employee', suffix: string) {
    const { employee, account } = await newRegisteredAccount(suite.context, {
      badgeNumber: `P20-${suffix}`,
      phone: `0799${suffix}`,
      secret: SECRET,
    });
    if (role !== 'employee') {
      await setAccountRole(suite.context, account.id, role);
    }
    const login = await postJson<{ sessionToken: string }>(baseUrl, '/api/auth/login', {
      identifier: `P20-${suffix}`,
      secret: SECRET,
    });
    assert.equal(login.status, 200);
    return { employee, account, token: login.body.sessionToken };
  }

  it('الاتجاهات الثلاثة تعمل على الخادم والتحقق على الخادم (§8.1)', async () => {
    const admin = await actor('admin', '0101');
    useTestSession(admin.token);

    for (const direction of ['وارد', 'صادر', 'داخلي'] as const) {
      const created = await postJson<TransactionBody>(baseUrl, '/api/transactions', {
        number: `1-${direction}`,
        sequence: '1',
        date: '2026-04-01',
        direction,
        category: 'إدارية',
        subType: 'تعميم',
        entity: 'إدارة المركز',
        subject: `كتاب ${direction}`,
        status: 'قيد المراجعة',
      });
      assert.equal(created.status, 201, `الاتجاه ${direction} يعمل`);
      assert.equal(created.body.direction, direction);
    }

    // قيمة خارج الكتالوج تُرفض 400 على الخادم — لا في React.
    const invalid = await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
      number: '9',
      sequence: '9',
      date: '2026-04-01',
      direction: 'خارجي',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'إدارة المركز',
      subject: 'مرفوض',
      status: 'قيد المراجعة',
    });
    assert.equal(invalid.status, 400, 'لا اتجاه رابع — القرار على الخادم');
  });

  it('الكتب المرتبطة: إنشاء A→B ثم قراءة الاتجاهين من الـAPI (§36)', async () => {
    const admin = await actor('admin', '0201');
    useTestSession(admin.token);

    const a = await newTransaction(suite.context, { number: 'A/100', subject: 'كتاب المصدر' });
    const b = await newTransaction(suite.context, { number: 'B/200', subject: 'كتاب مشار إليه' });

    const created = await postJson<RelationBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: b.id },
    );
    assert.equal(created.status, 201, 'ارتباط جديد 201');
    assert.equal(created.body.transactionId, a.id);
    assert.equal(created.body.relatedTransactionId, b.id);
    assert.ok(created.body.id, 'معرّف ارتباط حقيقي من القاعدة');

    const fromA = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
    );
    assert.equal(fromA.status, 200);
    assert.equal(fromA.body.outgoing.length, 1, 'A يشير إلى B');
    assert.equal(fromA.body.incoming.length, 0);

    const fromB = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${b.id}/relations`,
    );
    assert.equal(fromB.body.incoming.length, 1, 'B مُشار إليه');
    assert.equal(fromB.body.outgoing.length, 0, 'الاتجاه محفوظ — ليس ثنائي الاتجاه');
  });

  it('مرجع غير موجود وإحالة إلى النفس وتكرار الاتجاه (§36 · §32)', async () => {
    const admin = await actor('admin', '0301');
    useTestSession(admin.token);
    const a = await newTransaction(suite.context, { number: 'A/300' });
    const b = await newTransaction(suite.context, { number: 'B/400' });

    // طرف مجهول ⇒ 404 (لا 500 من انتهاك FK).
    const unknown = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: '00000000-0000-0000-0000-0000000000ff' },
    );
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error?.code, 'RESOURCE_NOT_FOUND');

    // إحالة إلى النفس ⇒ 400.
    const selfRef = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: a.id },
    );
    assert.equal(selfRef.status, 400);
    assert.equal(selfRef.body.error?.code, 'SELF_RELATION_NOT_ALLOWED');

    // نفس الاتجاه مرتين ⇒ 409 بلا صف ثانٍ.
    await postJson(baseUrl, `/api/transactions/${a.id}/relations`, {
      relatedTransactionId: b.id,
    });
    const duplicate = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: b.id },
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error?.code, 'RELATION_ALREADY_EXISTS');

    const rows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transaction_relations`,
    );
    assert.equal(rows.rows[0].count, '1', 'سطر واحد — لا تكرار صامت');

    // الاتجاه المعاكس صف مستقل (ليس DAG) — قرار موثّق في التقرير.
    const back = await postJson<RelationBody>(
      baseUrl,
      `/api/transactions/${b.id}/relations`,
      { relatedTransactionId: a.id },
    );
    assert.equal(back.status, 201, 'إحالة متبادلة مسموحة — علاقة أرشيفية لا شجرة');
  });

  it('الحقول الزائدة تُرفض: لا relationshipType ولا نوع ارتباط مخترع (§36)', async () => {
    const admin = await actor('admin', '0401');
    useTestSession(admin.token);
    const a = await newTransaction(suite.context, { number: 'A/500' });
    const b = await newTransaction(suite.context, { number: 'B/600' });

    const rejected = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: b.id, relationshipType: 'رد على' },
    );
    assert.equal(rejected.status, 400, 'نوع العلاقة غير مقرّر في الخطة — لا يُخترع');

    const missingBody = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      {},
    );
    assert.equal(missingBody.status, 400, 'الطرف الثاني مطلوب');
  });

  it('إزالة سطر الارتباط لا تحذف كتاباً ولا مرفقاً (§32)', async () => {
    const admin = await actor('admin', '0501');
    useTestSession(admin.token);
    const a = await newTransaction(suite.context, { number: 'A/700' });
    const b = await newTransaction(suite.context, {
      number: 'B/800',
      attachments: [
        { name: 'صورة.png', type: 'صورة وثيقة', fileSize: '1 KB', uploadDate: '2026-04-01' },
      ],
    });
    const created = await postJson<RelationBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: b.id },
    );

    const removed = await deleteJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations/${created.body.id}`,
    );
    assert.equal(removed.status, 204);

    const afterRelations = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
    );
    assert.equal(afterRelations.body.outgoing.length, 0);

    const bookB = await getJson<TransactionBody>(baseUrl, `/api/transactions/${b.id}`);
    assert.equal(bookB.status, 200, 'الكتاب لم يُحذف');
    assert.equal(bookB.body.attachments.length, 1, 'المرفق باقٍ — التكامل مع Phase 14');
  });

  it('الأرشفة تُبقي سطر الارتباط ولا تحذف الكتاب (§32 مع Phase 16)', async () => {
    const admin = await actor('admin', '0601');
    useTestSession(admin.token);
    const a = await newTransaction(suite.context, { number: 'A/900' });
    const b = await newTransaction(suite.context, { number: 'B/1000' });
    await postJson(baseUrl, `/api/transactions/${a.id}/relations`, {
      relatedTransactionId: b.id,
    });

    const archived = await deleteJson<TransactionBody>(
      baseUrl,
      `/api/transactions/${b.id}?expectedVersion=${b.version}`,
    );
    assert.equal(archived.status, 200, 'الأرشفة عملية لا حذف');

    const rows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transaction_relations`,
    );
    assert.equal(rows.rows[0].count, '1', 'سطر الارتباط محفوظ — التاريخ لا يُمحى');

    const active = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.ok(
      !active.body.some((t) => t.id === b.id),
      'المؤرشف يختفي من القوائم النشطة (سلوك Phase 16)',
    );
  });

  it('Access Scope: كتاب مرئي مرتبط بمحجوب ⇒ لا تسرّب لبيانات المحجوب (§12)', async () => {
    const admin = await actor('admin', '0701');
    const employee = await actor('employee', '0702');
    useTestSession(admin.token);

    // A عام · B إداري سرّي.
    const publicBook = await newTransaction(suite.context, {
      number: 'عام/1',
      subject: 'كتاب عام مرئي',
      visibility: 'PublicToEmployees',
    });
    const secretBook = await newTransaction(suite.context, {
      number: 'سري/1',
      subject: 'كتاب إداري سرّي',
      visibility: 'Administrative',
    });
    await postJson(baseUrl, `/api/transactions/${publicBook.id}/relations`, {
      relatedTransactionId: secretBook.id,
    });

    useTestSession(employee.token);
    const visible = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations`,
    );
    assert.equal(visible.status, 200, 'A مرئي فيُقرأ');
    assert.equal(
      visible.body.outgoing.length,
      0,
      'الارتباط إلى B المحجوب لا يُعاد — لا معرّف ولا تسريب',
    );
    assert.equal(visible.body.incoming.length, 0);

    // ولا عبر الطرف المحجوب: B نفسه 404 (حجب وجود — لا 403).
    const hidden = await getJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${secretBook.id}/relations`,
    );
    assert.equal(hidden.status, 404, 'الكتاب المحجوب 404 — لا يكشف وجوده');
    assert.equal(hidden.body.error?.code, 'RESOURCE_NOT_FOUND');

    // ولا في قائمة الكتب (لا تسرّب عبر العنوان).
    const list = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.ok(list.body.some((t) => t.id === publicBook.id));
    assert.ok(
      !list.body.some((t) => t.id === secretBook.id),
      'العنوان السرّي لا يظهر للمنتسب',
    );

    // المسؤول يرى الارتباط كاملاً (بلا قيد نطاق).
    useTestSession(admin.token);
    const adminView = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations`,
    );
    assert.equal(adminView.body.outgoing.length, 1, 'المسؤول يرى الطرفين');
  });

  it('الصلاحيات: المدير يقرأ ولا يكتب، والمنتسب لا يكتب (§10.2 · §10.3 · §28)', async () => {
    const admin = await actor('admin', '0801');
    const director = await actor('director', '0802');
    const employee = await actor('employee', '0803');

    useTestSession(admin.token);
    const publicBook = await newTransaction(suite.context, {
      number: 'عام/2',
      visibility: 'PublicToEmployees',
    });
    const otherBook = await newTransaction(suite.context, {
      number: 'عام/3',
      visibility: 'PublicToEmployees',
    });
    await postJson(baseUrl, `/api/transactions/${publicBook.id}/relations`, {
      relatedTransactionId: otherBook.id,
    });

    // المدير: قراءة نعم (§10.2 إشرافي واطلاعي) · كتابة لا (403 على الخادم).
    useTestSession(director.token);
    const dirRead = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations`,
    );
    assert.equal(dirRead.status, 200, 'المدير يقرأ الكتب للإشراف');
    const dirWrite = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations`,
      { relatedTransactionId: otherBook.id },
    );
    assert.equal(dirWrite.status, 403, 'المدير لا يُعدّل بيانات أرشيفية');
    assert.equal(dirWrite.body.error?.code, 'PERMISSION_DENIED');

    // المنتسب: قراءة ما يراه (كتاب عام) · كتابة لا · حذف لا.
    useTestSession(employee.token);
    const empRead = await getJson<TransactionRelationsDto>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations`,
    );
    assert.equal(empRead.status, 200);
    const empWrite = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations`,
      { relatedTransactionId: otherBook.id },
    );
    assert.equal(empWrite.status, 403, 'المنتسب view فقط (§10.3)');
    const empDelete = await deleteJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${publicBook.id}/relations/00000000-0000-0000-0000-0000000000aa`,
    );
    assert.equal(empDelete.status, 403, 'ولا يحذف ارتباطاً');
  });

  it('Duplicate Detection: تحذير بأسبابه ولا يمنع الإدخال (§36)', async () => {
    const admin = await actor('admin', '0901');
    useTestSession(admin.token);

    const first = await newTransaction(suite.context, {
      number: '100/و',
      date: '2026-06-01',
      entity: 'مديرية الشباب',
      subject: 'برنامج صيفي',
    });

    // إدخال مطابق تماماً: 201 + تحذير، **لا 400 ولا 409**.
    const second = await postJson<CreatedBook>(baseUrl, '/api/transactions', {
      number: '100/و',
      sequence: '2',
      date: '2026-06-01',
      direction: 'وارد',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'مديرية الشباب',
      subject: 'برنامج صيفي',
      status: 'قيد المراجعة',
    });
    assert.equal(second.status, 201, 'الإدخال لم يُمنع — §36 «لا يمنع الإدخال تلقائياً»');
    assert.ok(second.body.id, 'الكتاب المنشأ موجود فعلاً');
    assert.equal(second.body.duplicateWarning.suspected, true);
    assert.deepEqual(second.body.duplicateWarning.reasons, [
      'officialNumber',
      'date',
      'source',
      'topic',
    ]);
    assert.equal(second.body.duplicateWarning.candidates.length, 1);
    assert.equal(second.body.duplicateWarning.candidates[0].id, first.id);

    // الكتاب القائم لم يُحذف ولا يُعدَّل.
    const untouched = await getJson<TransactionBody>(
      baseUrl,
      `/api/transactions/${first.id}`,
    );
    assert.equal(untouched.body.number, '100/و');
    assert.equal(untouched.body.version, first.version, 'لا تعديل على السجل القائم');
  });

  it('Duplicate Detection: سبب واحد كافٍ، وبلا تشابه لا تحذير', async () => {
    const admin = await actor('admin', '1001');
    useTestSession(admin.token);
    await newTransaction(suite.context, {
      number: '200/و',
      date: '2026-02-02',
      entity: 'جهة أ',
      subject: 'موضوع أ',
    });

    // نفس العدد الرسمي وحده ⇒ اشتباه بسبب واحد.
    const byNumber = await postJson<CreatedBook>(baseUrl, '/api/transactions', {
      number: '200/و',
      sequence: '9',
      date: '2027-11-11',
      direction: 'صادر',
      category: 'مالية',
      subType: 'Finance',
      entity: 'جهة ب',
      subject: 'موضوع ب',
      status: 'قيد المراجعة',
    });
    assert.equal(byNumber.status, 201);
    assert.deepEqual(byNumber.body.duplicateWarning.reasons, ['officialNumber']);

    // لا تطابق في أي حقل ⇒ لا تحذير.
    const clean = await postJson<CreatedBook>(baseUrl, '/api/transactions', {
      number: '300/ص',
      sequence: '3',
      date: '2026-09-09',
      direction: 'داخلي',
      category: 'أخرى',
      subType: 'داخلي',
      entity: 'جهة ج',
      subject: 'موضوع ج',
      status: 'مكتمل',
    });
    assert.equal(clean.status, 201);
    assert.equal(clean.body.duplicateWarning.suspected, false);
    assert.deepEqual(clean.body.duplicateWarning.candidates, []);
  });

  it('Duplicate Detection لا يُسقط ولا يُعدّل سجلاً ولا يختار «صحيحاً» (§36)', async () => {
    const admin = await actor('admin', '1101');
    useTestSession(admin.token);
    const existing = await newTransaction(suite.context, {
      number: '400/و',
      subject: 'موضوع محفوظ',
    });

    await postJson(baseUrl, '/api/transactions', {
      number: '400/و',
      sequence: '4',
      date: '2026-08-08',
      direction: 'وارد',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'جهة',
      subject: 'موضوع محفوظ',
      status: 'قيد المراجعة',
    });

    const rows = await pool.query<{ count: string; versions: string }>(
      `SELECT count(*)::text AS count, min(version)::text AS versions FROM transactions`,
    );
    assert.equal(rows.rows[0].count, '2', 'كتابان: لا حذف ولا استبدال');
    assert.equal(
      rows.rows[0].versions,
      '1',
      'نسخة القائم لم تتغيّر — لا تعديل تلقائي على أي مرشّح',
    );
    const kept = await getJson<TransactionBody>(baseUrl, `/api/transactions/${existing.id}`);
    assert.equal(kept.body.subject, 'موضوع محفوظ');
  });

  it('انتقال الحالة: الحالتان المعتمدتان فقط والقفل إلزامي (§8.1 · §33)', async () => {
    const admin = await actor('admin', '1201');
    useTestSession(admin.token);
    const book = await newTransaction(suite.context, {
      number: '500/و',
      direction: 'صادر',
      status: 'قيد المراجعة',
    });
    assert.equal(book.status, 'قيد المراجعة');

    // الانتقال يعمل ويتزداد بـ1.
    const transitioned = await postJson<TransactionBody>(
      baseUrl,
      `/api/transactions/${book.id}/status`,
      { status: 'مكتمل', expectedVersion: book.version },
    );
    assert.equal(transitioned.status, 200);
    assert.equal(transitioned.body.status, 'مكتمل');
    assert.equal(transitioned.body.version, book.version + 1);

    // نسخة قديمة ⇒ 409 بلا كتابة (لا آخر-كاتب-يفوز).
    const stale = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${book.id}/status`,
      { status: 'قيد المراجعة', expectedVersion: book.version },
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error?.code, 'VERSION_CONFLICT');
    const unchanged = await getJson<TransactionBody>(baseUrl, `/api/transactions/${book.id}`);
    assert.equal(unchanged.body.status, 'مكتمل', 'لم يُكتب فوق النسخة الأحدث');
    assert.equal(unchanged.body.version, book.version + 1);

    // نسخة مفقودة ⇒ 400 (القفل إلزامي بلا استثناء).
    const noVersion = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${book.id}/status`,
      { status: 'قيد المراجعة' },
    );
    assert.equal(noVersion.status, 400, 'expectedVersion إلزامية');

    // حالة خارج القائمتين ⇒ 400 (لا حالة مخترعة).
    const invented = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${book.id}/status`,
      { status: 'مؤرشف', expectedVersion: book.version + 1 },
    );
    assert.equal(invented.status, 400, 'حالة جديدة بلا سند من §8.1 مرفوضة');
  });

  it('انتقال الحالة مستقل عن اتجاه الكتاب (§8.1) ويُرفض خارج النطاق', async () => {
    const admin = await actor('admin', '1301');
    const employee = await actor('employee', '1302');
    useTestSession(admin.token);

    // وارد وصادر وداخلي: كلها تنتقل بلا شرط على الاتجاه.
    for (const direction of ['وارد', 'صادر', 'داخلي'] as const) {
      const book = await newTransaction(suite.context, {
        number: `600-${direction}`,
        direction,
        status: 'قيد المراجعة',
      });
      const moved = await postJson<TransactionBody>(
        baseUrl,
        `/api/transactions/${book.id}/status`,
        { status: 'مكتمل', expectedVersion: book.version },
      );
      assert.equal(moved.status, 200, `الحالة مستقلة عن اتجاه ${direction}`);
      assert.equal(moved.body.status, 'مكتمل');
    }

    // كتاب إداري: المنتسب لا ينقل حالته (403 — القبول كان نقص صلاحية لا وجود).
    const secret = await newTransaction(suite.context, {
      number: '700/إداري',
      visibility: 'Administrative',
    });
    useTestSession(employee.token);
    const denied = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${secret.id}/status`,
      { status: 'مكتمل', expectedVersion: secret.version },
    );
    assert.equal(denied.status, 403, 'المنتسب لا يملك create');
    assert.equal(denied.body.error?.code, 'PERMISSION_DENIED');
  });

  it('انتقال الحالة على كتاب مؤرشف ⇒ 404 ولا كتابة (§32)', async () => {
    const admin = await actor('admin', '1401');
    useTestSession(admin.token);
    const book = await newTransaction(suite.context, { number: '800/و' });
    const archived = await deleteJson<TransactionBody>(
      baseUrl,
      `/api/transactions/${book.id}?expectedVersion=${book.version}`,
    );
    assert.equal(archived.status, 200);

    const attempt = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${book.id}/status`,
      { status: 'مكتمل', expectedVersion: book.version + 1 },
    );
    assert.equal(attempt.status, 404, 'لا كتابة على كتاب مؤرشف');
  });

  it('الإعمام: كتاب وارد + PublicToEmployees يراه المنتسب (§9.1 — بلا كيان جديد)', async () => {
    const admin = await actor('admin', '1501');
    const employee = await actor('employee', '1502');
    useTestSession(admin.token);

    // الإعمام العام = وارد + نطاق عام (نصّ §9.1 حرفياً، بلا كيان Circular).
    const circular = await newTransaction(suite.context, {
      number: '900/إعمام',
      direction: 'وارد',
      visibility: 'PublicToEmployees',
      subject: 'إعمام عن البرنامج الصيفي',
    });
    assert.equal(circular.direction, 'وارد');
    assert.equal(circular.visibility, 'PublicToEmployees');

    useTestSession(employee.token);
    const list = await getJson<TransactionBody[]>(baseUrl, '/api/transactions');
    assert.ok(
      list.body.some((t) => t.id === circular.id),
      'الإعمام يراه كل المنتسبين تلقائياً (§9.1)',
    );
    const single = await getJson<TransactionBody>(baseUrl, `/api/transactions/${circular.id}`);
    assert.equal(single.status, 200);

    // ولا صلاحية إضافية: الإعمام لا يمنح إدارة (§10.3).
    const attempt = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${circular.id}/status`,
      { status: 'مكتمل', expectedVersion: circular.version },
    );
    assert.equal(attempt.status, 403, 'الرؤية ليست إدارة');
  });

  it('الأولوية: محفوظة في القاعدة ومقروءة وقيمتها من الكتالوج (§8.1)', async () => {
    const admin = await actor('admin', '1601');
    useTestSession(admin.token);
    const book = await newTransaction(suite.context, {
      number: '1000/و',
      priority: 'عاجل',
    });
    const row = await pool.query<{ priority: string | null; status: string }>(
      `SELECT priority, status FROM transactions WHERE id = $1`,
      [book.id],
    );
    assert.equal(row.rows[0].priority, 'عاجل', 'محفوظ في PostgreSQL');
    assert.equal(row.rows[0].status, 'قيد المراجعة');

    const invalid = await postJson<ApiErrorBody>(baseUrl, '/api/transactions', {
      number: '1001/و',
      sequence: '1',
      date: '2026-04-01',
      direction: 'وارد',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'جهة',
      subject: 'أولوية مخترعة',
      status: 'قيد المراجعة',
      priority: 'حرجة جداً',
    });
    assert.equal(invalid.status, 400, 'الأولوية من الكتالوج المعتمد فقط');
  });

  it('علم الاستيراد التاريخي يُحفظ ولا يولّد سجل اطلاع تلقائياً (§37 · §31)', async () => {
    const admin = await actor('admin', '1701');
    useTestSession(admin.token);
    const historical = await newTransaction(suite.context, {
      number: '1100/تاريخي',
      direction: 'وارد',
      importedAt: '2026-01-05T09:00:00.000Z',
    });

    const row = await pool.query<{ imported_at: string | null }>(
      `SELECT imported_at FROM transactions WHERE id = $1`,
      [historical.id],
    );
    assert.equal(
      row.rows[0].imported_at,
      '2026-01-05T09:00:00.000Z',
      'علم الاستيراد التاريخي محفوظ — المكافئ المعتمد لـhistoricalImport',
    );

    const views = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM view_logs WHERE transaction_id = $1`,
      [historical.id],
    );
    assert.equal(views.rows[0].count, '0', 'الاستيراد لا يولّد «اطلعت» تلقائياً');
  });

  it('التدقيق: إنشاء وتعديل وانتقال حالة وارتباط (§31 — بلا نوع جديد)', async () => {
    const admin = await actor('admin', '1801');
    useTestSession(admin.token);

    const book = await newTransaction(suite.context, { number: '1200/و' });
    const other = await newTransaction(suite.context, { number: '1201/و' });
    const patch = await patchJson<TransactionBody>(baseUrl, `/api/transactions/${book.id}`, {
      subject: 'عنوان معدَّل',
      expectedVersion: book.version,
    });
    assert.equal(patch.status, 200);
    await postJson(baseUrl, `/api/transactions/${book.id}/status`, {
      status: 'مكتمل',
      expectedVersion: patch.body.version,
    });
    const relation = await postJson<RelationBody>(
      baseUrl,
      `/api/transactions/${book.id}/relations`,
      { relatedTransactionId: other.id },
    );
    await deleteJson(baseUrl, `/api/transactions/${book.id}/relations/${relation.body.id}`);

    const events = await pool.query<{ event_kind: string; count: string }>(
      `SELECT event_kind, count(*)::text AS count FROM audit_logs
        WHERE entity_kind = 'transaction' GROUP BY event_kind ORDER BY event_kind`,
    );
    const kinds = new Map(events.rows.map((row) => [row.event_kind, Number(row.count)]));
    assert.ok((kinds.get('create') ?? 0) >= 3, 'حدث create: كتابان + ارتباط');
    assert.ok((kinds.get('update') ?? 0) >= 2, 'حدث update: تعديل الكتاب + إزالة الارتباط');
    assert.equal(kinds.get('status_change'), 1, 'حدث status_change للانتقال');

    const statusEvent = await pool.query<{ old_values: unknown; new_values: unknown }>(
      `SELECT old_values, new_values FROM audit_logs
        WHERE entity_kind = 'transaction' AND event_kind = 'status_change'`,
    );
    assert.equal((statusEvent.rows[0].old_values as { status?: string }).status, 'قيد المراجعة');
    assert.equal((statusEvent.rows[0].new_values as { status?: string }).status, 'مكتمل');
  });

  it('الفاعل من الجلسة لا من جسم الطلب (§31 — القاعدة 7)', async () => {
    const admin = await actor('admin', '1901');
    useTestSession(admin.token);
    const a = await newTransaction(suite.context, { number: '1300/و' });
    const b = await newTransaction(suite.context, { number: '1301/و' });

    const attempt = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: b.id, createdBy: '00000000-0000-0000-0000-0000000000bb' },
    );
    assert.equal(attempt.status, 400, 'createdBy من العميل مرفوض');

    const created = await postJson<RelationBody>(
      baseUrl,
      `/api/transactions/${a.id}/relations`,
      { relatedTransactionId: b.id },
    );
    assert.equal(created.body.createdBy, admin.account.id, 'الفاعل من هوية الجلسة');
  });
});