/**
 * Phase 17 — التزامن التفاؤلي (Optimistic Concurrency) عبر الـHTTP الحقيقي.
 *
 * المرجع: `ALSQAYA_PLAN.md` §33. الاختبارات تمرّ بالمسار الكامل:
 * Express ← الجلسات ← RBAC ← التحقق ← controller ← خدمة ← مستودع ← PostgreSQL،
 * وتتحقق من **حالة القاعدة** لا من رمز HTTP وحده.
 *
 * البنود المغطّاة:
 * 1. `expectedVersion` إلزامية: غيابها 400 — لا كتابة بلا شرط نسخة.
 * 2. نسخة قديمة ⇒ 409 `VERSION_CONFLICT` بلا أي كتابة (تعديل/أرشفة/استعادة).
 * 3. تعديلان متزامنان بنفس النسخة: واحد 200 والآخر 409 — لا آخر-يكتب-يفوز.
 * 4. الكتابة الناجحة ترفع النسخة 1 وتُعاد في الرد.
 * 5. الطلب المرفوض لا يكتب حدث تدقيق (§31).
 * 6. تسجيل تراجعي لما بنته Phase 16: الأرشفة ناعمة والاستعادة تعيد الكتاب نفسه.
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
  newAuthenticatedAccount,
  newTransaction,
  type TransactionBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

/** كتاب كما يعيده الـAPI مع حقول الأرشفة والحقول التي تفحصها الاختبارات. */
type BookBody = TransactionBody & {
  subject?: string;
  deletedAt?: string | null;
  deleteReason?: string | null;
};

/**
 * جسم خطأ تعارض النسخة (409).
 *
 * `details` هنا كائن `{ expectedVersion, currentVersion }` لا قائمة مشاكل
 * تحقق: عميل الواجهة يحتاج النسخة الحالية ليعيد التحميل لا حقل مرفوض.
 */
interface ConflictBody {
  error?: {
    code?: string;
    message?: string;
    details?: { expectedVersion?: number; currentVersion?: number };
  };
}

describe('Phase 17 — التزامن التفاؤلي (HTTP)', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl = '';

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
    // حساب مسؤول حقيقي بجلسة محقونة — كل مسارات الكتابة تحتاج صلاحية.
    await newAuthenticatedAccount(suite.context);
  });

  /** النسخة الحالية في القاعدة (شرط القفل في كل كتابة). */
  async function currentVersion(transactionId: string): Promise<number> {
    const result = await pool.query<{ version: number }>(
      `SELECT version FROM transactions WHERE id = $1`,
      [transactionId],
    );
    return result.rows[0].version;
  }

  /** عدد أحداث التدقيق لكتاب — لإثبات أن الطلب المرفوض لا يُسجَّل. */
  async function auditCount(transactionId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE entity_id = $1`,
      [transactionId],
    );
    return Number(result.rows[0].count);
  }


  it('PATCH بلا expectedVersion ⇒ 400 ولا كتابة', async () => {
    const created = await newTransaction(suite.context, { number: '١/١٧' });

    const response = await patchJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${created.id}`,
      { status: 'مكتمل' },
    );
    assert.equal(response.status, 400, 'لا تعديل بلا شرط نسخة');
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    assert.ok(
      response.body.error?.details?.some((detail) => detail.field.includes('expectedVersion')),
      'الرسالة تحدّد الحقل الناقص',
    );

    assert.equal(await currentVersion(created.id), 1, 'النسخة لم تتغيّر');
    const stored = await pool.query<{ status: string }>(
      `SELECT status FROM transactions WHERE id = $1`,
      [created.id],
    );
    assert.equal(stored.rows[0].status, created.status, 'الحالة المخزَّنة كما هي — لم يُكتب شيء');
  });

  it('PATCH بنسخة قديمة ⇒ 409 VERSION_CONFLICT بلا كتابة، وبالنسخة الحالية ⇒ 200', async () => {
    const created = await newTransaction(suite.context, { number: '٢/١٧' });

    const first = await patchJson<BookBody>(
      baseUrl,
      `/api/transactions/${created.id}`,
      { subject: 'الأول', expectedVersion: created.version },
    );
    assert.equal(first.status, 200, `رد التعديل الأول: ${JSON.stringify(first.body)}`);
    assert.equal(first.body.version, created.version + 1, 'النسخة ترفع 1 في الرد');

    const stale = await patchJson<ConflictBody>(
      baseUrl,
      `/api/transactions/${created.id}`,
      { subject: 'القديم', expectedVersion: created.version },
    );
    assert.equal(stale.status, 409, 'نسخة قديمة ⇒ تعارض');
    assert.equal(stale.body.error?.code, 'VERSION_CONFLICT');
    assert.equal(stale.body.error?.details?.expectedVersion, created.version);
    assert.equal(
      stale.body.error?.details?.currentVersion,
      created.version + 1,
      'النسخة الحالية تُعاد للعميل ليُعيد التحميل',
    );

    // لا كتابة: النسخة والموضوع المخزَّنان كما تركتهما الكتابة الأولى.
    assert.equal(await currentVersion(created.id), created.version + 1);
    const stored = await pool.query<{ subject: string }>(
      `SELECT subject FROM transactions WHERE id = $1`,
      [created.id],
    );
    assert.equal(stored.rows[0].subject, 'الأول', 'النسخة القديمة لم تُكتب');
  });

  it('تعديلان متزامنان بنفس النسخة: واحد 200 والآخر 409', async () => {
    const created = await newTransaction(suite.context, { number: '٣/١٧' });

    const [first, second] = await Promise.all([
      patchJson<BookBody>(baseUrl, `/api/transactions/${created.id}`, {
        subject: 'متزامن أ',
        expectedVersion: created.version,
      }),
      patchJson<BookBody>(baseUrl, `/api/transactions/${created.id}`, {
        subject: 'متزامن ب',
        expectedVersion: created.version,
      }),
    ]);

    assert.deepEqual(
      [first.status, second.status].sort(),
      [200, 409],
      'كتابة واحدة مرّت والأخرى رُفضت 409',
    );
    assert.equal(await currentVersion(created.id), created.version + 1, 'كتابة واحدة فقط نُفّذت');
  });

  it('DELETE (أرشفة) بلا نسخة ⇒ 400 · نسخة قديمة ⇒ 409 · بالحالية ⇒ 200 وترفع النسخة', async () => {
    const created = await newTransaction(suite.context, { number: '٤/١٧' });

    const noVersion = await deleteJson<ApiErrorBody>(baseUrl, `/api/transactions/${created.id}`);
    assert.equal(noVersion.status, 400, 'الأرشفة تحمل النسخة في الاستعلام');

    const stale = await deleteJson<ConflictBody>(
      baseUrl,
      `/api/transactions/${created.id}?expectedVersion=${created.version + 4}`,
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error?.code, 'VERSION_CONFLICT');
    const stillActive = await pool.query<{ deletedAt: string | null }>(
      `SELECT deleted_at AS "deletedAt" FROM transactions WHERE id = $1`,
      [created.id],
    );
    assert.equal(stillActive.rows[0].deletedAt, null, 'الرفض لم يؤرشف شيئاً');

    const archived = await deleteJson<BookBody>(
      baseUrl,
      `/api/transactions/${created.id}?expectedVersion=${created.version}` +
        `&reason=${encodeURIComponent('أرشفة بقفل')}`,
    );
    assert.equal(archived.status, 200, `رد الأرشفة: ${JSON.stringify(archived.body)}`);
    assert.equal(archived.body.version, created.version + 1, 'الأرشفة كتابة كاملة ترفع النسخة');
    assert.equal(archived.body.deleteReason, 'أرشفة بقفل');
  });

  it('restore بلا نسخة ⇒ 400 · نسخة قديمة ⇒ 409 · بالحالية ⇒ 200', async () => {
    const created = await newTransaction(suite.context, { number: '٥/١٧' });
    assert.equal(
      (
        await deleteJson(
          baseUrl,
          `/api/transactions/${created.id}?expectedVersion=${created.version}`,
        )
      ).status,
      200,
    );

    const noVersion = await postJson<ApiErrorBody>(
      baseUrl,
      `/api/transactions/${created.id}/restore`,
    );
    assert.equal(noVersion.status, 400, 'الاستعادة تحمل النسخة في الاستعلام');

    const stale = await postJson<ConflictBody>(
      baseUrl,
      `/api/transactions/${created.id}/restore?expectedVersion=${created.version}`,
    );
    assert.equal(stale.status, 409, 'نسخة ما قبل الأرشفة صارت قديمة');
    assert.equal(stale.body.error?.details?.currentVersion, created.version + 1);

    const restored = await postJson<BookBody>(
      baseUrl,
      `/api/transactions/${created.id}/restore?expectedVersion=${created.version + 1}`,
    );
    assert.equal(restored.status, 200, `رد الاستعادة: ${JSON.stringify(restored.body)}`);
    assert.equal(restored.body.id, created.id, 'نفس المعرّف — لا سجل جديد');
    assert.equal(restored.body.version, created.version + 2, 'الاستعادة ترفع النسخة كذلك');
  });

  it('الطلب المرفوض (409) لا يكتب حدث تدقيق ولا يترك أثراً (§31)', async () => {
    const created = await newTransaction(suite.context, { number: '٦/١٧' });
    assert.equal(
      (
        await patchJson(baseUrl, `/api/transactions/${created.id}`, {
          subject: 'الأول',
          expectedVersion: created.version,
        })
      ).status,
      200,
    );
    const before = await auditCount(created.id);

    const stale = await patchJson<ConflictBody>(
      baseUrl,
      `/api/transactions/${created.id}`,
      { subject: 'القديم', expectedVersion: created.version },
    );
    assert.equal(stale.status, 409);
    assert.equal(await auditCount(created.id), before, 'لا حدث تدقيق لطلب مرفوض');
    assert.equal(await currentVersion(created.id), created.version + 1, 'ولا كتابة على الصف');
  });

  it('دورة أرشفة ← استعادة بقفل: الكتاب نفسه ونسخته ترتفع في كل خطوة', async () => {
    const created = await newTransaction(suite.context, { number: '٧/١٧' });
    const before = await pool.query<{ createdAt: string }>(
      `SELECT created_at AS "createdAt" FROM transactions WHERE id = $1`,
      [created.id],
    );

    assert.equal(
      (
        await deleteJson(
          baseUrl,
          `/api/transactions/${created.id}?expectedVersion=${created.version}`,
        )
      ).status,
      200,
    );
    const archived = await getJson<BookBody[]>(baseUrl, '/api/transactions/archived');
    assert.ok(archived.body.some((entry) => entry.id === created.id), 'دخل الأرشيف');
    const hidden = await getJson<ApiErrorBody>(baseUrl, `/api/transactions/${created.id}`);
    assert.equal(hidden.status, 404, 'مستبعد من القراءة النشطة');

    assert.equal(
      (
        await postJson(
          baseUrl,
          `/api/transactions/${created.id}/restore?expectedVersion=${created.version + 1}`,
        )
      ).status,
      200,
    );
    const active = await getJson<BookBody>(baseUrl, `/api/transactions/${created.id}`);
    assert.equal(active.status, 200, 'عاد نشطاً');
    assert.equal(active.body.version, created.version + 2);
    assert.equal(active.body.number, created.number, 'بيانات الكتاب سليمة');

    // صف واحد فقط، وتاريخ الإنشاء الأصلي لم يتغيّر.
    const rows = await pool.query<{ count: string; createdAt: string }>(
      `SELECT count(*)::text AS count, max(created_at) AS "createdAt"
         FROM transactions WHERE id = $1`,
      [created.id],
    );
    assert.equal(rows.rows[0].count, '1', 'لا صف جديد عبر الدورة');
    assert.equal(rows.rows[0].createdAt, before.rows[0].createdAt);
  });
});
