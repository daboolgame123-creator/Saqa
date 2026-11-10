/**
 * اختبارات Phase 17 — التزامن التفاؤلي (Optimistic Concurrency) على PostgreSQL.
 *
 * المرجع: `ALSQAYA_PLAN.md` §33 (Concurrency Control).
 * ما يُفحص على مستوى المستودع (لا عبر HTTP):
 * 1. كل كتابة على كتاب موجود (`update` · `archive` · `restore`) مشروطة
 *    بالنسخة التي قرأها العميل، والنسخة تزداد 1 عند كل كتابة ناجحة.
 * 2. نسخة قديمة ⇒ فشل مُصنَّف (`stale`) **بلا أي كتابة** في القاعدة.
 * 3. تعديلان متزامنان بنفس النسخة: واحد ينجح وحده — لا «آخر من يكتب يفوز».
 * 4. كتابة على حالة لا تقبلها العملية ⇒ `stateMismatch` (404 في الـAPI).
 * 5. الاستعادة تقرأ الحالة السابقة وتكتب داخل معاملة واحدة، وتُرجع الروابط
 *    والمرفقات كما كانت (فحص تراجعي لما بنته Phase 16).
 * 6. التراجع عند الفشل داخل معاملة: لا يبقى نصف كتابة.
 *
 * البيانات كلها اصطناعية داخل القاعدة المعزولة `alsqaya_test`.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import type { CreateTransactionInput } from '../../src/repositories/contracts';
import { PgEmployeeRepository } from '../../src/repositories/employeeRepository';
import { PgTransactionRepository } from '../../src/repositories/transactionRepository';
import { withTransaction } from '../../src/database/pool';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

const FK_VIOLATION = '23503';
const MISSING_ID = '00000000-0000-0000-0000-00000000000a';

/** يتحقق رمز خطأ PostgreSQL المتوقع. */
async function expectCode(operation: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error !== null && typeof error === 'object' && 'code' in error);
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

/** مدخل كتاب صالح — تُشتق منه الحالات. */
function bookInput(overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput {
  return {
    number: '١٧/ص',
    sequence: '١٧',
    date: '2026-09-10',
    direction: 'صادر',
    category: 'إدارية',
    subType: 'تعميم',
    entity: 'إدارة المركز',
    subject: 'كتاب التزامن',
    status: 'قيد المراجعة',
    ...overrides,
  };
}

/** الصف كما هو في القاعدة — الفحص على المخزَّن لا على ناتج الدالة. */
interface StoredRow {
  version: number;
  subject: string;
  status: string;
  updatedAt: string;
  deletedAt: string | null;
}


describe('Phase 17 — التزامن التفاؤلي (قاعدة)', () => {
  let pool: Pool;
  let transactions: PgTransactionRepository;
  let employees: PgEmployeeRepository;

  before(async () => {
    ({ pool } = await startTestDatabase());
    transactions = new PgTransactionRepository(pool);
    employees = new PgEmployeeRepository(pool);
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
  });

  /** يقرأ الصف المخزَّن (نسخة + حقول تُفحص عند الرفض). */
  async function readRow(id: string): Promise<StoredRow> {
    const result = await pool.query<StoredRow>(
      `SELECT version, subject, status, updated_at AS "updatedAt",
              deleted_at AS "deletedAt"
         FROM transactions WHERE id = $1`,
      [id],
    );
    return result.rows[0];
  }

  it('الإنشاء يبدأ بالنسخة 1، والقراءة بها تُعيدها', async () => {
    const created = await transactions.create(bookInput());
    assert.equal(created.version, 1, 'نسخة الإنشاء من DEFAULT 1 في القاعدة');

    const read = await transactions.findById(created.id);
    assert.equal(read?.version, 1, 'النسخة تُقرأ في كل قراءة');
    assert.equal((await readRow(created.id)).version, 1);
  });

  it('التعديل بالنسخة الحالية ينجح ويزيد النسخة 1، والنسخة القديمة تُرفض', async () => {
    const created = await transactions.create(bookInput());

    const first = await transactions.update(created.id, { subject: 'الأول' }, 1);
    assert.equal(first.outcome, 'updated');
    if (first.outcome !== 'updated') {
      return;
    }
    assert.equal(first.record.version, 2, 'النسخة ازدادت 1 داخل جملة الكتابة');
    assert.equal(first.record.subject, 'الأول');

    const before = await readRow(created.id);
    // نسخة قديمة (1) والصحيح صار 2 ⇒ رفض مُصنَّف بلا أي كتابة.
    const stale = await transactions.update(created.id, { subject: 'القديم' }, 1);
    assert.equal(stale.outcome, 'stale');
    if (stale.outcome !== 'stale') {
      return;
    }
    assert.equal(stale.currentVersion, 2, 'النسخة الحالية تُعاد في نتيجة الفشل');

    const after = await readRow(created.id);
    assert.equal(after.subject, 'الأول', 'الكتابة القديمة لم تُكتب');
    assert.equal(after.version, before.version, 'النسخة لم تتغيّر');
    assert.equal(after.updatedAt, before.updatedAt, 'updated_at لم يُمسّ — لا كتابة إطلاقاً');
  });

  it('تعديلان متزامنان بنفس النسخة: نجاح واحد فقط (لا آخر-يكتب-يفوز)', async () => {
    const created = await transactions.create(bookInput());

    const [first, second] = await Promise.all([
      transactions.update(created.id, { subject: 'متزامن أ' }, created.version),
      transactions.update(created.id, { subject: 'متزامن ب' }, created.version),
    ]);

    assert.deepEqual(
      [first.outcome, second.outcome].sort(),
      ['stale', 'updated'],
      'كتابة واحدة نجحت، والأخرى صُنّفت نسخة قديمة',
    );
    const row = await readRow(created.id);
    assert.equal(row.version, 2, 'النسخة ازدادت مرة واحدة فقط');
    assert.ok(
      ['متزامن أ', 'متزامن ب'].includes(row.subject),
      'القيمة المخزَّنة إحدى الكتابتين — بلا دمج ولا كتابة جزئية',
    );
  });

  it('تعديل أو أرشفة أو استعادة كتاب غير موجود ⇒ notFound', async () => {
    assert.equal((await transactions.update(MISSING_ID, { subject: 'أ' }, 1)).outcome, 'notFound');
    assert.equal((await transactions.restore(MISSING_ID, 1)).outcome, 'notFound');
    assert.equal(
      (await transactions.archive(MISSING_ID, { deletedByUserId: null, expectedVersion: 1 }))
        .outcome,
      'notFound',
    );
  });

  it('الأرشفة بقفل: نسخة صحيحة تنجح وترفع النسخة، ونسخة قديمة تُرفض بلا كتابة', async () => {
    const created = await transactions.create(bookInput());

    const stale = await transactions.archive(created.id, {
      deletedByUserId: null,
      reason: 'محاولة قديمة',
      expectedVersion: 7,
    });
    assert.equal(stale.outcome, 'stale');
    const untouched = await readRow(created.id);
    assert.equal(untouched.deletedAt, null, 'لم تُكتب الأرشفة القديمة');
    assert.equal(untouched.version, 1);

    const archived = await transactions.archive(created.id, {
      deletedByUserId: null,
      reason: 'أرشفة اختبار',
      expectedVersion: 1,
    });
    assert.equal(archived.outcome, 'updated');
    if (archived.outcome !== 'updated') {
      return;
    }
    assert.equal(archived.record.version, 2, 'الأرشفة كتابة كاملة ترفع النسخة');
    assert.ok(archived.record.deletedAt !== null, 'طوابع الأرشفة مكتوبة');
    assert.equal(archived.record.deleteReason, 'أرشفة اختبار');
    assert.notEqual((await readRow(created.id)).deletedAt, null);
  });

  it('كتابة على حالة لا تقبلها العملية ⇒ stateMismatch بلا زيادة للنسخة', async () => {
    const created = await transactions.create(bookInput());
    assert.equal(
      (
        await transactions.archive(created.id, {
          deletedByUserId: null,
          reason: 'أولى',
          expectedVersion: 1,
        })
      ).outcome,
      'updated',
    );

    // أرشفة ثانية بنسخة حاسمة (2): الحالة لا تقبل ⇒ stateMismatch.
    assert.equal(
      (
        await transactions.archive(created.id, {
          deletedByUserId: null,
          reason: 'ثانية',
          expectedVersion: 2,
        })
      ).outcome,
      'stateMismatch',
    );
    // تعديل كتاب مؤرشف بنسخته الحالية: التصنيف نفسه — لا كتابة على مؤرشف.
    assert.equal(
      (await transactions.update(created.id, { subject: 'على مؤرشف' }, 2)).outcome,
      'stateMismatch',
    );

    const row = await readRow(created.id);
    assert.equal(row.version, 2, 'المرفوض لم يزد النسخة');
    assert.equal(row.subject, 'كتاب التزامن');
  });

  it('الاستعادة: نسخة قديمة تُرفض ثم restored بالحالة السابقة، والروابط والمرفقات كما هي', async () => {
    const employee = await employees.create({
      name: 'منتسب Phase 17',
      title: 'منصب',
      department: 'قسم',
    });
    const created = await transactions.create(
      bookInput({
        employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
        attachments: [
          { name: 'مرفق.pdf', type: 'كتاب رئيسي', fileSize: '10', uploadDate: '2026-09-10' },
        ],
      }),
    );
    assert.equal(
      (
        await transactions.archive(created.id, {
          deletedByUserId: null,
          reason: 'أرشفة اختبار',
          expectedVersion: 1,
        })
      ).outcome,
      'updated',
    );

    // نسخة ما قبل الأرشفة (1) صارت قديمة (الحالية 2) ⇒ رفض بلا استعادة.
    const stale = await transactions.restore(created.id, 1);
    assert.equal(stale.outcome, 'stale');
    if (stale.outcome !== 'stale') {
      return;
    }
    assert.equal(stale.currentVersion, 2);
    assert.notEqual((await readRow(created.id)).deletedAt, null, 'الكتاب ما زال مؤرشفاً');

    const restored = await transactions.restore(created.id, 2);
    assert.equal(restored.outcome, 'restored');
    if (restored.outcome !== 'restored') {
      return;
    }
    assert.ok(restored.previous.deletedAt !== null, 'الحالة قبل الاستعادة من المعاملة نفسها');
    assert.equal(restored.previous.deleteReason, 'أرشفة اختبار');
    assert.equal(restored.record.version, 3, 'الاستعادة كتابة كاملة ترفع النسخة');
    assert.equal(restored.record.deletedAt, null, 'عاد نشطاً');
    assert.deepEqual(
      restored.record.employeeIds,
      [employee.id],
      'الروابط كما كانت — بلا تكرار ولا فقد',
    );
    assert.equal(restored.record.attachments.length, 1, 'المرفقات كما كانت');
    assert.equal(restored.record.attachments[0].name, 'مرفق.pdf');

    // كتاب نشط بنسخته الحالية: لا استعادة ⇒ stateMismatch.
    assert.equal((await transactions.restore(created.id, 3)).outcome, 'stateMismatch');
  });

  it('التراجع عند الفشل: لا يبقى نصف كتابة داخل معاملة', async () => {
    const created = await transactions.create(bookInput());
    await expectCode(
      () =>
        withTransaction(pool, async (client) => {
          await client.query(
            `UPDATE transactions SET subject = 'كتابة ستُلغى', version = version + 1 WHERE id = $1`,
            [created.id],
          );
          // مخالفة مفتاح أجنبي تُفشل المعاملة كلها — نفس مصير الاستعادة
          // لو فشلت كتابتها: لا يُترك أثر لنصف العملية.
          await client.query(
            `INSERT INTO transaction_employees (transaction_id, employee_id) VALUES ($1, $2)`,
            [created.id, '00000000-0000-0000-0000-000000000009'],
          );
        }),
      FK_VIOLATION,
    );

    const row = await readRow(created.id);
    assert.equal(row.subject, 'كتاب التزامن', 'الكتابة الأولى تراجعت');
    assert.equal(row.version, 1, 'النسخة لم تتغيّر');
  });
});
