/**
 * اختبارات Phase 16 — Soft Delete + Data Integrity على PostgreSQL مباشرة.
 *
 * المرجع: `ALSQAYA_PLAN.md` §32 (Soft Delete + Data Integrity).
 * ما يُفحص على مستوى القاعدة (لا عبر HTTP):
 * 1. أعمدة الأرشفة الثلاثة موجودة، و`delete_reason` لا تُقبل لكتاب نشط.
 * 2. الأرشفة/الاستعادة `UPDATE` لا `DELETE`: الصف باقٍ بمعرّفه وتاريخه.
 * 3. تقييد الحذف الفعلي: `DELETE FROM transactions` يُرفض (FK 23503) ما دام
 *    للكتاب رابط أو مرفق أو إتاحة أو سجل اطلاع — فلا يمحو خطأ واحد التاريخ.
 * 4. القيود الفريدة القائمة تبقى قائمة (لا تغيير في نموذج البيانات).
 *
 * البيانات كلها اصطناعية داخل القاعدة المعزولة `alsqaya_test`.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

const FK_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

async function expectCode(operation: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error !== null && typeof error === 'object' && 'code' in error);
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

async function insertEmployee(pool: Pool, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO employees (name, title, department) VALUES ($1, 'منصب تجريبي', 'قسم تجريبي') RETURNING id`,
    [name],
  );
  return result.rows[0].id;
}

async function insertTransaction(
  pool: Pool,
  overrides: { number?: string; subject?: string } = {},
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO transactions (number, sequence, document_date, month, direction, category,
                               sub_type, entity, subject, status)
     VALUES ($1, '1', '2026-05-01', '2026-05', 'صادر', 'إدارية', 'نوع', 'جهة', $2, 'قيد المراجعة')
     RETURNING id`,
    [overrides.number ?? '١/٦', overrides.subject ?? 'كتاب Phase 16'],
  );
  return result.rows[0].id;
}

describe('Phase 16 — Soft Delete + Data Integrity (قاعدة)', () => {
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

  it('أعمدة الأرشفة الثلاثة موجودة على transactions وقيمها NULL في كتاب جديد', async () => {
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'transactions'
          AND column_name IN ('deleted_at', 'deleted_by', 'delete_reason')`,
    );
    assert.deepEqual(
      columns.rows.map((row) => row.column_name).sort(),
      ['delete_reason', 'deleted_at', 'deleted_by'],
      'الترحيل 0009 أضاف الأعمدة الثلاثة',
    );

    const transactionId = await insertTransaction(pool);
    const row = await pool.query<{
      deletedAt: string | null;
      deletedBy: string | null;
      deleteReason: string | null;
    }>(
      `SELECT deleted_at AS "deletedAt", deleted_by AS "deletedBy",
              delete_reason AS "deleteReason" FROM transactions WHERE id = $1`,
      [transactionId],
    );
    assert.equal(row.rows[0].deletedAt, null, 'كتاب جديد نشط');
    assert.equal(row.rows[0].deletedBy, null);
    assert.equal(row.rows[0].deleteReason, null);
  });

  it('CHECK: سبب حذف على كتاب نشط يُرفض (23514)', async () => {
    const transactionId = await insertTransaction(pool);
    await expectCode(
      () =>
        pool.query(`UPDATE transactions SET delete_reason = 'سبب' WHERE id = $1`, [
          transactionId,
        ]),
      CHECK_VIOLATION,
    );
  });

  it('الأرشفة والاستعادة UPDATE لا حذف: الصف باقٍ ومعرّفه وتاريخه ثابتان', async () => {
    const transactionId = await insertTransaction(pool);
    const before = await pool.query<{ createdAt: string }>(
      `SELECT created_at AS "createdAt" FROM transactions WHERE id = $1`,
      [transactionId],
    );

    const archived = await pool.query<{ deletedAt: string | null }>(
      `UPDATE transactions SET deleted_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING deleted_at AS "deletedAt"`,
      [transactionId],
    );
    assert.equal(archived.rows.length, 1);
    assert.ok(archived.rows[0].deletedAt !== null, 'طابع الأرشفة كُتب');

    // الأرشفة مرّة ثانية لا تكتب شيئاً (الشرط في الجملة نفسها).
    const second = await pool.query(
      `UPDATE transactions SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [transactionId],
    );
    assert.equal(second.rowCount, 0, 'أرشفة كتاب مؤرشف لا تصعيد تاريخي');

    const stillThere = await pool.query<{ count: string; createdAt: string }>(
      `SELECT count(*)::text AS count, max(created_at) AS "createdAt"
         FROM transactions WHERE id = $1`,
      [transactionId],
    );
    assert.equal(stillThere.rows[0].count, '1', 'الصف لم يُحذف');
    assert.equal(
      stillThere.rows[0].createdAt,
      before.rows[0].createdAt,
      'تاريخ الإنشاء الأصلي محفوظ',
    );

    await pool.query(
      `UPDATE transactions SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL`,
      [transactionId],
    );
    const restored = await pool.query<{ deletedAt: string | null }>(
      `SELECT deleted_at AS "deletedAt" FROM transactions WHERE id = $1`,
      [transactionId],
    );
    assert.equal(restored.rows[0].deletedAt, null, 'الاستعادة تُصفّر الطوابع');
  });

  it('تقييد الحذف الفعلي: رابط أو مرفق أو إتاحة أو سجل اطلاع يمنع الحذف (23503)', async () => {
    const employeeId = await insertEmployee(pool, 'منتسب قيد العلاقات');

    const withLink = await insertTransaction(pool, { number: '٢/٦' });
    await pool.query(
      `INSERT INTO transaction_employees (transaction_id, employee_id) VALUES ($1, $2)`,
      [withLink, employeeId],
    );
    await expectCode(
      () => pool.query(`DELETE FROM transactions WHERE id = $1`, [withLink]),
      FK_VIOLATION,
    );

    const withAttachment = await insertTransaction(pool, { number: '٣/٦' });
    await pool.query(
      `INSERT INTO attachments (transaction_id, name, type, original_filename, file_size, upload_date, storage_key)
       VALUES ($1, 'مرفق', 'كتاب رئيسي', 'ملف.pdf', '10', '2026-05-01', 'key-1')`,
      [withAttachment],
    );
    await expectCode(
      () => pool.query(`DELETE FROM transactions WHERE id = $1`, [withAttachment]),
      FK_VIOLATION,
    );

    const withAvailability = await insertTransaction(pool, { number: '٤/٦' });
    await pool.query(
      `INSERT INTO transaction_availability (transaction_id, employee_id) VALUES ($1, $2)`,
      [withAvailability, employeeId],
    );
    await expectCode(
      () => pool.query(`DELETE FROM transactions WHERE id = $1`, [withAvailability]),
      FK_VIOLATION,
    );

    const withViewLog = await insertTransaction(pool, { number: '٥/٦' });
    await pool.query(
      `INSERT INTO view_logs (transaction_id, user_id, employee_id) VALUES ($1, NULL, $2)`,
      [withViewLog, employeeId],
    );
    await expectCode(
      () => pool.query(`DELETE FROM transactions WHERE id = $1`, [withViewLog]),
      FK_VIOLATION,
    );
  });

  it('القيود الفريدة القائمة سليمة: إتاحة سارية واحدة، وروابط بلا تكرار', async () => {
    const employeeId = await insertEmployee(pool, 'منتسب القيود الفريدة');
    const transactionId = await insertTransaction(pool, { number: '٦/٦' });
    await pool.query(
      `INSERT INTO transaction_availability (transaction_id, employee_id) VALUES ($1, $2)`,
      [transactionId, employeeId],
    );
    await expectCode(
      () =>
        pool.query(
          `INSERT INTO transaction_availability (transaction_id, employee_id) VALUES ($1, $2)`,
          [transactionId, employeeId],
        ),
      UNIQUE_VIOLATION,
    );
    // بعد السحب يُصحّ المنح بسجل جديد (الفهرس جزئي على غير المسحوب).
    await pool.query(
      `UPDATE transaction_availability SET revoked_at = now()
        WHERE transaction_id = $1 AND employee_id = $2`,
      [transactionId, employeeId],
    );
    await pool.query(
      `INSERT INTO transaction_availability (transaction_id, employee_id) VALUES ($1, $2)`,
      [transactionId, employeeId],
    );

    await pool.query(
      `INSERT INTO transaction_employees (transaction_id, employee_id, relationship_type)
       VALUES ($1, $2, 'subject')`,
      [transactionId, employeeId],
    );
    await expectCode(
      () =>
        pool.query(
          `INSERT INTO transaction_employees (transaction_id, employee_id, relationship_type)
           VALUES ($1, $2, 'subject')`,
          [transactionId, employeeId],
        ),
      UNIQUE_VIOLATION,
    );
  });
});
