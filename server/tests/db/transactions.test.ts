/**
 * اختبارات Phase 9 — معاملات PostgreSQL: COMMIT/ROLLBACK فعلي.
 * withTransaction لا يعرف قواعد أعمال: نجاح ⇒ التزام، خطأ ⇒ رجوع كامل.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { withTransaction } from '../../src/database/pool';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

/** خطأ اصطناعي يُرمى داخل معاملة لاختبار الرجوع. */
const SENTINEL = new Error(' Sentinel: فشل متعمد داخل المعاملة ');

/** يزرع موظفاً اصطناعياً ويعيد معرفه (خارج أي معاملة). */
async function insertEmployee(pool: Pool, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO employees (name, title, department) VALUES ($1, 'منصب', 'قسم') RETURNING id`,
    [name],
  );
  return result.rows[0].id;
}

describe('Phase 9 — معاملات PostgreSQL (commit/rollback)', () => {
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

  it('COMMIT: عمليتان داخل معاملة تبقيان بعد اكتمالها', async () => {
    const name = 'معاملة ناجحة';
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO employees (name, title, department) VALUES ($1, 'منصب', 'قسم')`,
        [name],
      );
      await client.query(
        `INSERT INTO leave_balances (employee_id, year)
         SELECT id, '2026' FROM employees WHERE name = $1`,
        [name],
      );
    });
    const employees = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM employees WHERE name = $1`,
      [name],
    );
    const balances = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM leave_balances`,
    );
    assert.equal(employees.rows[0].count, '1');
    assert.equal(balances.rows[0].count, '1');
  });

  it('ROLLBACK: فشل داخل المعاملة يلغي كل ما قبلها', async () => {
    const name = 'معاملة ملغاة';
    await assert.rejects(
      () => withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO employees (name, title, department) VALUES ($1, 'منصب', 'قسم')`,
          [name],
        );
        // تحقق أن الصف داخل المعاملة مرئي لصاحبها قبل الفشل.
        const inside = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM employees WHERE name = $1`,
          [name],
        );
        assert.equal(inside.rows[0].count, '1');
        throw SENTINEL;
      }),
      (error: unknown) => error === SENTINEL,
    );
    // بعد الرجوع: لا أثر للصف إطلاقاً.
    const after_ = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM employees WHERE name = $1`,
      [name],
    );
    assert.equal(after_.rows[0].count, '0');
  });

  it('ROLLBACK عند خرق قيد داخل المعاملة يمنع التزام الجزئي', async () => {
    // الموظف يُنشأ ثم يُخزَّن رصيد مكرر ⇒ خرق UNIQUE ⇒ رجوع كامل للاثنين.
    await assert.rejects(
      () => withTransaction(pool, async (client) => {
        const employee = await client.query<{ id: string }>(
          `INSERT INTO employees (name, title, department)
           VALUES ('موظف الحد', 'منصب', 'قسم') RETURNING id`,
        );
        const employeeId = employee.rows[0].id;
        await client.query(
          `INSERT INTO leave_balances (employee_id, year) VALUES ($1, '2027')`,
          [employeeId],
        );
        // تكرار نفس (موظف، سنة) ⇒ 23505 من القاعدة.
        await client.query(
          `INSERT INTO leave_balances (employee_id, year) VALUES ($1, '2027')`,
          [employeeId],
        );
      }),
      (error: unknown) =>
        error !== null && typeof error === 'object' && (error as { code?: string }).code === '23505',
    );
    const employees = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM employees`,
    );
    const balances = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM leave_balances`,
    );
    assert.equal(employees.rows[0].count, '0');
    assert.equal(balances.rows[0].count, '0');
  });

  it('الـpool يصلح للعمل بعد رجوع معاملة فاشلة', async () => {
    await assert.rejects(
      () => withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO employees (name, title, department) VALUES ('تالف', 'منصب', 'قسم')`,
        );
        throw SENTINEL;
      }),
      (error: unknown) => error === SENTINEL,
    );
    const employeeId = await insertEmployee(pool, 'موظف بعد الرجوع');
    assert.match(employeeId, /^[0-9a-f-]{36}$/);
    // معاملة جديدة بعد الفشل تعمل وتُلتزم.
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO leave_balances (employee_id, year) VALUES ($1, '2028')`,
        [employeeId],
      );
    });
    const balances = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM leave_balances WHERE employee_id = $1`,
      [employeeId],
    );
    assert.equal(balances.rows[0].count, '1');
  });
});
