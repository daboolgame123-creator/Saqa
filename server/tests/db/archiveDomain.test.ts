/**
 * Phase 20 — مستودعات نطاق الكتب على قاعدة معزولة:
 * ارتباط الكتب (Related Books) وكشف التشابه (Duplicate Detection).
 *
 * المرجع: `ALSQAYA_PLAN.md` §36 (عمليات Phase 20 · Related Books ·
 * Duplicate Detection) · §8.1 (الحقول والاتجاهات) · §12 (Access Scope)
 * · §32 (لا حذف فعلي) · §33 (Concurrency).
 *
 * ما يُفحص هنا على مستوى المستودع (ما لا يمكن إثباته إلا به):
 * 1. العلاقة **حقيقية**: مفتاحان أجنبيان على `transactions` لا نص ولا JSON.
 * 2. الاتجاه محفوظ: A → B لا يعني B → A.
 * 3. قيود التكامل: لا إحالة إلى النفس، ولا تكرار في نفس الاتجاه.
 * 4. **النطاق على الطرفين**: كتاب مرئي + كتاب محجوب ⇒ لا صفّ ارتباط.
 * 5. الحلقات (A→B وB→A): مسموحة — العلاقة إحالة لا شجرة (تفسير موثّق).
 * 6. الأرشفة (Phase 16): ارتباط كتاب مؤرشف يختفي، والصف يبقى.
 * 7. كشف التشابه: تحذير بأسبابه، و**لا يمنع** الإدخال ولا يختار «صحيحاً».
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';
import { PgTransactionRelationRepository } from '../../src/repositories/transactionRelationRepository';
import { scanDuplicateTransactions } from '../../src/services/duplicateDetection';
import { transactionScopeFilterFor } from '../../src/authorization/accessScope';

/** معرّف UUID مجهول صالح الشكل (FK ستقبله كنص). */
const UNKNOWN_ID = '00000000-0000-0000-0000-0000000000ff';

/** يزرع كتاباً اصطناعياً ويعيد معرّفه. */
async function insertTransaction(
  pool: Pool,
  overrides: Record<string, string> = {},
): Promise<string> {
  const date = overrides.date ?? '2026-01-01';
  const result = await pool.query<{ id: string }>(
    `INSERT INTO transactions (number, sequence, document_date, month, direction, category,
                               sub_type, entity, subject, status)
     VALUES ($1, $2, $3, $4, $5, 'إدارية', 'نوع', $6, $7, 'قيد المراجعة')
     RETURNING id`,
    [
      overrides.number ?? '1',
      overrides.sequence ?? '1',
      date,
      date.slice(0, 7),
      overrides.direction ?? 'وارد',
      overrides.entity ?? 'جهة',
      overrides.subject ?? 'موضوع',
    ],
  );
  return result.rows[0].id;
}
describe('Phase 20 — مستودع ارتباط الكتب + كشف التشابه', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase());
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
  });

  it('العلاقة محفوظة بمفتاحين أجنبيين حقيقيين — لا نص ولا JSON (§36)', async () => {
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });
    await pool.query(
      `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
       VALUES ($1, $2)`,
      [a, b],
    );
    const row = await pool.query<{ transaction_id: string; related_transaction_id: string }>(
      `SELECT r.transaction_id, r.related_transaction_id
         FROM transaction_relations r
         JOIN transactions src ON src.id = r.transaction_id
         JOIN transactions dst ON dst.id = r.related_transaction_id
        WHERE src.number = 'A' AND dst.number = 'B'`,
    );
    assert.equal(row.rows.length, 1, 'الارتباط يُقرأ بالمفتاحين لا بالنص');
  });

  it('FK: طرف مجهول يُرفض (23503) — لا ارتباط يتيم', async () => {
    const a = await insertTransaction(pool, { number: 'A' });
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
           VALUES ($1, $2)`,
          [a, UNKNOWN_ID],
        ),
      /foreign key/i,
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
           VALUES ($1, $2)`,
          [UNKNOWN_ID, a],
        ),
      /foreign key/i,
    );
  });

  it('الكتاب لا يشير إلى نفسه (CHECK) والتكرار في نفس الاتجاه يُرفض (UNIQUE)', async () => {
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
           VALUES ($1, $1)`,
          [a],
        ),
      /transaction_relations_no_self_reference|check constraint/i,
    );

    await pool.query(
      `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
       VALUES ($1, $2)`,
      [a, b],
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO transaction_relations (transaction_id, related_transaction_id)
           VALUES ($1, $2)`,
          [a, b],
        ),
      /unique|duplicate key/i,
    );

    const repository = new PgTransactionRelationRepository(pool);
    assert.equal(
      (await repository.add({ transactionId: a, relatedTransactionId: b })).outcome,
      'duplicate',
    );
    assert.equal(
      (await repository.add({ transactionId: a, relatedTransactionId: a })).outcome,
      'selfReference',
    );

    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transaction_relations`,
    );
    assert.equal(count.rows[0].count, '1', 'سطر واحد فقط — لا تكرار صامت');
  });

  it('الاتجاه محفوظ: A → B لا يعني B → A', async () => {
    const repo = new PgTransactionRelationRepository(pool);
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });
    await repo.add({ transactionId: a, relatedTransactionId: b });

    const outgoingFromA = await repo.listOutgoing(a);
    assert.equal(outgoingFromA.length, 1);
    assert.equal(outgoingFromA[0].relatedTransactionId, b);
    assert.equal(
      (await repo.listIncoming(a)).length,
      0,
      'A لا يشير إليه شيء بعد',
    );
    assert.equal((await repo.listIncoming(b)).length, 1, 'B هو المُشار إليه');
  });

  it('نطاق الرؤية مطبَّق على الطرفين: كتاب مرئي + كتاب محجوب ⇒ لا صفّ (§12)', async () => {
    const repo = new PgTransactionRelationRepository(pool);
    // A عام (يراه المنتسب) · B إداري (لا يراه المنتسب).
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });
    await pool.query(`UPDATE transactions SET visibility = '"PublicToEmployees"' WHERE id = $1`, [a]);
    await pool.query(`UPDATE transactions SET visibility = '"Administrative"' WHERE id = $1`, [b]);
    await repo.add({ transactionId: a, relatedTransactionId: b });

    const employeeScope = transactionScopeFilterFor({ role: 'employee', employeeId: null });
    assert.ok(employeeScope !== null);

    // الطرف A مرئي ⇒ outgoing يجب أن يخفي B بالكامل (لا اسم ولا معرّف).
    assert.equal(
      (await repo.listOutgoing(a, employeeScope ?? undefined)).length,
      0,
      'الارتباط لا يُعيد صفاً إذا كان الطرف الآخر خارج النطاق — لا تسرّب',
    );
    assert.equal(
      (await repo.listIncoming(b, employeeScope ?? undefined)).length,
      0,
      'الطرف المحجوب لا يكشف الارتباط من الجهتين',
    );

    // المسؤول والمدير بلا قيد (§10.1/§10.2).
    assert.equal(transactionScopeFilterFor({ role: 'admin', employeeId: null }), null);
    assert.equal(transactionScopeFilterFor({ role: 'director', employeeId: null }), null);
    assert.equal(
      (await repo.listOutgoing(a)).length,
      1,
      'المسؤول يرى ارتباطه كاملاً',
    );
  });

  it('الحلقة A→B وB→A مسموحة: العلاقة إحالة أرشيفية لا شجرة تصنيف', async () => {
    const repo = new PgTransactionRelationRepository(pool);
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });

    await repo.add({ transactionId: a, relatedTransactionId: b });
    const back = await repo.add({ transactionId: b, relatedTransactionId: a });
    assert.equal(
      back.outcome,
      'created',
      'كل اتجاه صف مستقل — القيد على الزوج المرتّب لا على الطرفين',
    );
    assert.equal((await repo.listOutgoing(a)).length, 1);
    assert.equal((await repo.listOutgoing(b)).length, 1);
  });

  it('الأرشفة (Phase 16): ارتباط كتاب مؤرشف يختفي من القوائم والصف يبقى (§32)', async () => {
    const repo = new PgTransactionRelationRepository(pool);
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });
    await repo.add({ transactionId: a, relatedTransactionId: b });

    // أرشفة ناعمة (UPDATE لا DELETE).
    await pool.query(`UPDATE transactions SET deleted_at = now() WHERE id = $1`, [b]);

    assert.equal(
      (await repo.listOutgoing(a)).length,
      0,
      'طرف مؤرشف ⇒ لا صفّ ارتباط في القوائم النشطة',
    );
    const rows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transaction_relations`,
    );
    assert.equal(rows.rows[0].count, '1', 'الصف لم يُحذف — أرشفة ≠ حذف');
    const books = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions`,
    );
    assert.equal(books.rows[0].count, '2', 'الكتابان باقيان بتاريخهما');
  });

  it('إزالة سطر الارتباط لا تمسّ الكتابين (§32 — لا حذف فعلي)', async () => {
    const repo = new PgTransactionRelationRepository(pool);
    const a = await insertTransaction(pool, { number: 'A' });
    const b = await insertTransaction(pool, { number: 'B' });
    const created = await repo.add({ transactionId: a, relatedTransactionId: b });
    assert.equal(created.outcome, 'created');
    const relationId = created.outcome === 'created' ? created.record.id : '';

    assert.equal(await repo.remove(relationId), true);
    assert.equal(
      await repo.remove(relationId),
      false,
      'إزالة ثانية تُبلَّغ لا تُصمت',
    );

    const books = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions`,
    );
    assert.equal(books.rows[0].count, '2', 'الكتابان باقيان — لا حذف للكتاب');
  });
});

describe('Phase 20 — كشف تشابه الكتب (تحذير لا منع، §36)', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase());
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
  });

  it('أسباب الاشتباه تُذكر حسب حقول §36 الخمسة', async () => {
    await insertTransaction(pool, {
      number: '100/و',
      date: '2026-03-05',
      entity: 'مديرية الشباب',
      subject: 'برنامج صيفي',
    });
    const full = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '100/و',
      date: '2026-03-05',
      entity: 'مديرية الشباب',
      subject: 'برنامج صيفي',
    });
    assert.equal(full.suspected, true);
    assert.equal(full.candidates.length, 1);
    // الترتيب ثابت (ترتيب بنود §36) لا عشوائي.
    assert.deepEqual(full.reasons, ['officialNumber', 'date', 'source', 'topic']);
    assert.deepEqual(full.candidates[0].reasons, [
      'officialNumber',
      'date',
      'source',
      'topic',
    ]);

    // سبب واحد فقط: العدد الرسمي وحده.
    const onlyNumber = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '100/و',
      date: '2026-12-31',
      entity: 'جهة أخرى',
      subject: 'موضوع آخر',
    });
    assert.equal(onlyNumber.suspected, true);
    assert.deepEqual(onlyNumber.reasons, ['officialNumber']);
  });

  it('الفحص لا يمنع الإدخال ولا يحذف ولا يعدّل ولا يختار «صحيحاً» (§36)', async () => {
    const existing = await insertTransaction(pool, { number: '55/و', subject: 'موضوع مكرر' });
    const before = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions`,
    );

    const scan = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '55/و',
      date: '2026-05-05',
      entity: 'ج',
      subject: 'موضوع مكرر',
    });
    assert.equal(scan.suspected, true, 'تحذير موجود…');

    const after = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM transactions`,
    );
    assert.equal(
      after.rows[0].count,
      before.rows[0].count,
      '…ولم يُحذف ولا أُنشئ شيء — قراءة وصفية فقط',
    );
    const untouched = await pool.query<{ subject: string }>(
      `SELECT subject FROM transactions WHERE id = $1`,
      [existing],
    );
    assert.equal(
      untouched.rows[0].subject,
      'موضوع مكرر',
      'السجل القائم لم يُعدَّل ولا كُرِّر ولا حُذف',
    );
  });

  it('بصمة الملف سبب إضافي عند توفّرها فقط (file hash when available)', async () => {
    const withFile = await insertTransaction(pool, {
      number: '70/و',
      date: '2026-07-07',
      entity: 'ج',
      subject: 'س',
    });
    await pool.query(
      `INSERT INTO attachments (transaction_id, name, type, original_filename, file_size,
                                upload_date, content_hash)
       VALUES ($1, 'صورة.png', 'صورة وثيقة', 'صورة.png', '1 KB', '2026-07-07', 'sha256:aaa')`,
      [withFile],
    );

    const noHash = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '70/و',
      date: '2026-07-07',
      entity: 'ج',
      subject: 'س',
    });
    assert.ok(
      !noHash.reasons.includes('fileHash'),
      'لا بصمة في الفحص ⇒ لا سبب بصمة (when available)',
    );

    // بصمة مطابقة وبقية الحقول مختلفة ⇒ البصمة وحدها سبب الاشتباه.
    const byHash = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '99/ص',
      date: '2030-01-01',
      entity: 'جهة أخرى',
      subject: 'موضوع آخر',
      fileHashes: ['sha256:aaa'],
    });
    assert.equal(byHash.suspected, true);
    assert.deepEqual(byHash.reasons, ['fileHash']);

    // بصمة غير موجودة ⇒ لا اشتباه.
    const noMatch = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '99/ص',
      date: '2030-01-01',
      entity: 'جهة أخرى',
      subject: 'موضوع آخر',
      fileHashes: ['sha256:bbb'],
    });
    assert.equal(noMatch.suspected, false);
    assert.deepEqual(noMatch.candidates, []);
  });

  it('الكتاب لا يشتبه بنفسه، والمؤرشف خارج الفحص', async () => {
    const id = await insertTransaction(pool, { number: '80/و' });
    const selfScan = await scanDuplicateTransactions(pool, {
      transactionId: id,
      number: '80/و',
      date: '2026-01-01',
      entity: 'جهة',
      subject: 'موضوع',
    });
    assert.equal(selfScan.suspected, false, 'لا مرشّح من الكتاب نفسه');

    await pool.query(`UPDATE transactions SET deleted_at = now() WHERE id = $1`, [id]);
    const archivedScan = await scanDuplicateTransactions(pool, {
      transactionId: UNKNOWN_ID,
      number: '80/و',
      date: '2026-01-01',
      entity: 'جهة',
      subject: 'موضوع',
    });
    assert.equal(
      archivedScan.suspected,
      false,
      'الكتاب المؤرشف محجوب عن القوائم فلا يُقترح كمُشتبه',
    );
  });

  it('نطاق الرؤية يقيّد فحص التشابه (§12 — لا كشف كتب محجوبة)', async () => {
    await insertTransaction(pool, { number: '90/إداري' });
    await pool.query(`UPDATE transactions SET visibility = '"Administrative"'`);
    const employeeScope = transactionScopeFilterFor({ role: 'employee', employeeId: null });
    const probe = {
      transactionId: UNKNOWN_ID,
      number: '90/إداري',
      date: '2026-01-01',
      entity: 'جهة',
      subject: 'موضوع',
    };
    assert.equal(
      (await scanDuplicateTransactions(pool, probe, employeeScope ?? undefined)).suspected,
      false,
      'لا يُكشف كتاب إداري لمنتسب عبر التشابه',
    );
    assert.equal(
      (await scanDuplicateTransactions(pool, probe)).suspected,
      true,
      'المسؤول (بلا قيد) يرى المرشّح',
    );
  });
});