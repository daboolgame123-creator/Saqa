/**
 * اختبارات Phase 9 — التكامل المرجقي والقيود:
 * FKs، قيود NOT NULL/UNIQUE/CHECK، قواعد الحذف، واستراتيجية التواريخ.
 * بيانات الاختبار اصطناعية بالكامل داخل القاعدة المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

/** رموز أخطاء PostgreSQL لكل نوع انتهاك. */
const FK_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

/** يتحقق أن العملية فشلت بالضبط برمز خطأ PostgreSQL المتوقع. */
async function expectCode(operation: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error !== null && typeof error === 'object' && 'code' in error);
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

/** يزرع موظفاً اصطناعياً ويعيد معرفه. */
async function insertEmployee(pool: Pool, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO employees (name, title, department) VALUES ($1, 'منصب تجريبي', 'قسم تجريبي') RETURNING id`,
    [name],
  );
  return result.rows[0].id;
}

describe('Phase 9 — التكامل المرجقي وقيود القاعدة', () => {
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

  it('FK: رابط كتاب إلى موظف/كتاب مجهول يُرفض (23503)', async () => {
    const employeeId = await insertEmployee(pool, 'موظف تجريبي للـFK');
    // كتاب مجهول.
    await expectCode(
      () => pool.query(
        `INSERT INTO transaction_employees (transaction_id, employee_id) VALUES ($1, $2)`,
        ['00000000-0000-0000-0000-000000000001', employeeId],
      ),
      FK_VIOLATION,
    );
    // موظف مجهول مع كتاب حقيقي.
    const transactionId = (await pool.query<{ id: string }>(
      `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status)
       VALUES ('2026/1', '1', '2026-01-01', '2026-01', 'صادر', 'إدارية', 'نوع', 'جهة', 'موضوع', 'قيد المراجعة')
       RETURNING id`,
    )).rows[0].id;
    await expectCode(
      () => pool.query(
        `INSERT INTO transaction_employees (transaction_id, employee_id) VALUES ($1, $2)`,
        [transactionId, '00000000-0000-0000-0000-000000000002'],
      ),
      FK_VIOLATION,
    );
  });

  it('NOT NULL: اسم المستخدم والعنوان والكتاب مطلوبة (23502)', async () => {
    await expectCode(
      () => pool.query(
        `INSERT INTO users (username, display_name, role) VALUES (NULL, 'عرض', 'employee')`,
      ),
      NOT_NULL_VIOLATION,
    );
    await expectCode(
      () => pool.query(
        `INSERT INTO employees (name, title, department) VALUES ('بلا', NULL, 'قسم')`,
      ),
      NOT_NULL_VIOLATION,
    );
    await expectCode(
      () => pool.query(
        `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status)
         VALUES ('1', '1', '2026-01-01', '2026-01', 'صادر', 'إدارية', 'ن', 'ج', NULL, 'قيد المراجعة')`,
      ),
      NOT_NULL_VIOLATION,
    );
  });

  it('UNIQUE: اسم مستخدم وشارة ورصيد سنة مكررة تُرفض (23505)', async () => {
    const employeeId = await insertEmployee(pool, 'موظف تجريبي للتوحيد');
    await pool.query(
      `INSERT INTO users (username, display_name, role) VALUES ('kawader', 'حساب', 'employee')`,
    );
    await expectCode(
      () => pool.query(
        `INSERT INTO users (username, display_name, role) VALUES ('kawader', 'حساب آخر', 'employee')`,
      ),
      UNIQUE_VIOLATION,
    );
    await pool.query(`UPDATE employees SET badge_number = 'B-77' WHERE id = $1`, [employeeId]);
    const otherId = await insertEmployee(pool, 'موظف تجريبي آخر');
    await expectCode(
      () => pool.query(`UPDATE employees SET badge_number = 'B-77' WHERE id = $1`, [otherId]),
      UNIQUE_VIOLATION,
    );
    await pool.query(
      `INSERT INTO leave_balances (employee_id, year) VALUES ($1, '2026')`,
      [employeeId],
    );
    await expectCode(
      () => pool.query(
        `INSERT INTO leave_balances (employee_id, year) VALUES ($1, '2026')`,
        [employeeId],
      ),
      UNIQUE_VIOLATION,
    );
  });

  it('CHECK: قيم المجال غير المعتمدة تُرفض (23514)', async () => {
    // دور خارج القيم المعتمدة.
    await expectCode(
      () => pool.query(
        `INSERT INTO users (username, display_name, role) VALUES ('x1', 'عرض', 'root')`,
      ),
      CHECK_VIOLATION,
    );
    // اتجاه كتاب غير معتمد.
    await expectCode(
      () => pool.query(
        `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status)
         VALUES ('1', '1', '2026-01-01', '2026-01', 'وصول', 'إدارية', 'ن', 'ج', 'موضوع', 'قيد المراجعة')`,
      ),
      CHECK_VIOLATION,
    );
    // شهر بصيغة غير YYYY-MM.
    await expectCode(
      () => pool.query(
        `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status)
         VALUES ('2', '1', '2026-01-01', '2026-1', 'صادر', 'إدارية', 'ن', 'ج', 'موضوع', 'قيد المراجعة')`,
      ),
      CHECK_VIOLATION,
    );
    // نقل موظف إلى «سابق» بلا سبب انتهاء خدمة معتمد.
    const employeeId = await insertEmployee(pool, 'موظف تجريبي للحالة');
    await expectCode(
      () => pool.query(
        `INSERT INTO employee_status_history (employee_id, status) VALUES ($1, 'former')`,
        [employeeId],
      ),
      CHECK_VIOLATION,
    );
    // حركة رصيد خارج قائمة §15.
    await expectCode(
      () => pool.query(
        `INSERT INTO leave_ledger (employee_id, movement_type, amount, balance_after, occurred_on)
         VALUES ($1, 'guessing', 1, 1, '2026-01-01')`,
        [employeeId],
      ),
      CHECK_VIOLATION,
    );
    // رابطان في الموقف اليومي في آن واحد.
    const transactionId = (await pool.query<{ id: string }>(
      `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status)
       VALUES ('3', '1', '2026-01-01', '2026-01', 'صادر', 'إدارية', 'ن', 'ج', 'موضوع', 'قيد المراجعة') RETURNING id`,
    )).rows[0].id;
    const leaveId = (await pool.query<{ id: string }>(
      `INSERT INTO leaves (employee_id, type, start_date, end_date, status)
       VALUES ($1, 'annual', '2026-02-01', '2026-02-05', 'registered') RETURNING id`,
      [employeeId],
    )).rows[0].id;
    await expectCode(
      () => pool.query(
        `INSERT INTO daily_situations (employee_id, date, category, related_transaction_id, related_leave_id)
         VALUES ($1, '2026-02-01', 'permanent_leaves', $2, $3)`,
        [employeeId, transactionId, leaveId],
      ),
      CHECK_VIOLATION,
    );
  });

  it('CHECK: تاريخ نهاية قبل بداية يُرفض في الإجازات (23514)', async () => {
    const employeeId = await insertEmployee(pool, 'موظف تجريبي للتواريخ');
    await expectCode(
      () => pool.query(
        `INSERT INTO leaves (employee_id, type, start_date, end_date, status)
         VALUES ($1, 'annual', '2026-03-10', '2026-03-01', 'registered')`,
        [employeeId],
      ),
      CHECK_VIOLATION,
    );
  });

  it('قواعد الحذف: الموظف والكتاب المرتبطان لا يُحذفان (23503)', async () => {
    const employeeId = await insertEmployee(pool, 'موظف محمي من الحذف');
    await pool.query(
      `INSERT INTO leaves (employee_id, type, start_date, end_date, status)
       VALUES ($1, 'annual', '2026-04-01', '2026-04-02', 'registered')`,
      [employeeId],
    );
    await expectCode(
      () => pool.query(`DELETE FROM employees WHERE id = $1`, [employeeId]),
      FK_VIOLATION,
    );

    const transactionId = (await pool.query<{ id: string }>(
      `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status)
       VALUES ('9', '9', '2026-01-09', '2026-01', 'صادر', 'إدارية', 'ن', 'ج', 'موضوع', 'قيد المراجعة') RETURNING id`,
    )).rows[0].id;
    await pool.query(
      `INSERT INTO view_logs (transaction_id, user_id, employee_id) VALUES ($1, NULL, $2)`,
      [transactionId, employeeId],
    );
    await expectCode(
      () => pool.query(`DELETE FROM transactions WHERE id = $1`, [transactionId]),
      FK_VIOLATION,
    );
  });

  it('Cascade: حذف المستخدم يزيل إشعاراته ويُبطل فاعل التدقيق لا سجله', async () => {
    const userId = (await pool.query<{ id: string }>(
      `INSERT INTO users (username, display_name, role) VALUES ('cascade_user', 'عرض', 'employee') RETURNING id`,
    )).rows[0].id;
    await pool.query(
      `INSERT INTO notifications (user_id, kind) VALUES ($1, 'new_request')`,
      [userId],
    );
    await pool.query(
      `INSERT INTO audit_logs (event_kind, actor_user_id, entity_kind) VALUES ('login', $1, 'user')`,
      [userId],
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    const notifications = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications WHERE user_id = $1`,
      [userId],
    );
    assert.equal(notifications.rows[0].count, '0');
    // السجل يبقى مع SET NULL للفاعل — بقاء التدقيق مضمون.
    // min/max غير معرَّفان لـuuid في PostgreSQL — القراءة بـ::text.
    const audits = await pool.query<{ count: string; actor: string | null }>(
      `SELECT count(*)::text AS count, min(actor_user_id::text) AS actor
       FROM audit_logs WHERE event_kind = 'login'`,
    );
    assert.equal(audits.rows[0].count, '1');
    assert.equal(audits.rows[0].actor, null);
  });

  it('استراتيجية التواريخ: تاريخ الكتاب ≠ وقت الإنشاء ≠ تاريخ الاستيراد', async () => {
    const inserted = await pool.query<{
      documentDate: string;
      createdAt: string;
      importedAt: string;
    }>(
      `INSERT INTO transactions (number, sequence, document_date, month, direction, category, sub_type, entity, subject, status, imported_at)
       VALUES ('10', '10', '2026-01-15', '2026-01', 'صادر', 'إدارية', 'ن', 'ج', 'موضوع', 'قيد المراجعة', '2026-02-01T10:00:00.000Z')
       RETURNING document_date AS "documentDate", created_at AS "createdAt", imported_at AS "importedAt"`,
    );
    const row = inserted.rows[0];
    // تاريخ مستند: نص YYYY-MM-DD صرف بلا منطقة زمنية.
    assert.equal(row.documentDate, '2026-01-15');
    // وقت الإنشاء: ISO 8601 بـUTC مختلف عن تاريخ المستند.
    assert.match(row.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.notEqual(row.createdAt.slice(0, 10), row.documentDate);
    // تاريخ الاستيراد يبقى كما أُدخل لا يختلط بغيره.
    assert.equal(row.importedAt, '2026-02-01T10:00:00.000Z');
  });

  it('وقت الزمنية يُخزن كتوقيت قاعدة (14:30:00) للتطبيع لاحقاً', async () => {
    const employeeId = await insertEmployee(pool, 'موظف تجريبي زمنية');
    const inserted = await pool.query<{ timeOut: string }>(
      `INSERT INTO time_permissions (employee_id, date, time_out, status)
       VALUES ($1, '2026-05-01', '14:30', 'registered') RETURNING time_out AS "timeOut"`,
      [employeeId],
    );
    assert.equal(inserted.rows[0].timeOut, '14:30:00');
  });
});
