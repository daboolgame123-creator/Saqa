/**
 * اختبارات Phase 9 — الـMigrations: تطبيق، تراجع، تكرار، سلامة checksum.
 * كلها على قاعدة alsqaya_test المعزولة (بلا بيانات حقيقية).
 */
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  defaultMigrationsDir,
  getMigrationStatus,
  loadMigrations,
  rollbackMigrations,
  runMigrations,
} from '../../src/database/migrations';
import { listDomainTables, startTestDatabase, stopTestDatabase, tableExists } from './testDb';

/**
 * كل جداول المجال الـ22 المتوقعة (مرتبة أبجدياً كما تعيده القاعدة).
 * Phase 11 أضافت auth_sessions وauth_otp_codes وauth_otp_rate_limits.
 * Phase 13 أضافت transaction_availability.
 */
const EXPECTED_TABLES: readonly string[] = [
  'assignments',
  'attachments',
  'audit_logs',
  'auth_otp_codes',
  'auth_otp_rate_limits',
  'auth_sessions',
  'courses',
  'daily_situations',
  'employee_status_history',
  'employees',
  'leave_balances',
  'leave_ledger',
  'leaves',
  'notifications',
  'reminders',
  'requests',
  'time_permissions',
  'transaction_availability',
  'transaction_employees',
  'transactions',
  'users',
  'view_logs',
];

/** عدد ملفات الـmigrations بعد Phase 16. */
const MIGRATION_COUNT = 9;

/** الجداول التي ينشئها ملف 0006 وحده. */
const PHASE_13_TABLES: readonly string[] = [
  'transaction_availability',
];

describe('Phase 9 — الـMigrations: التطبیق والتراجع', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase({ migrate: false }));
  });

  after(async () => {
    await stopTestDatabase();
  });

  it(`runMigrations يطبّق الـ${MIGRATION_COUNT} إصدارات ويوجد الـ22 جدولاً حصراً`, async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, [...EXPECTED_TABLES]);
    assert.equal(tables.length, 22);
  });

  it('runMigrations ثانيةً لا يطبّق شيئاً (لا تكرار بناء)', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, []);
  });

  it(`getMigrationStatus يعرض ${MIGRATION_COUNT} إصدارات مُطبَّقة بأختامها`, async () => {
    const status = await getMigrationStatus(pool);
    assert.equal(status.length, MIGRATION_COUNT);
    assert.ok(status.every((entry) => entry.applied && entry.appliedAt !== null));
    assert.deepEqual(status.map((entry) => entry.version), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('تراجع 0009 ثم 0008 ثم 0007: إضافات تخطيطية بلا أثر على الجداول', async () => {
    // 0009 أعمدة أرشفة + قيود FK: تراجعها يمسح الأعمدة ويعيد CASCADE،
    // ولا يُنشئ ولا يحذف أي جدول.
    const firstStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(firstStep.rolledBackVersions, [9]);
    assert.deepEqual(await listDomainTables(pool), [...EXPECTED_TABLES]);
    const columns = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'deleted_at'`,
    );
    assert.equal(columns.rows[0].count, '0', 'عمود deleted_at أُزيل بالتراجع');

    // 0008 قيد UNIQUE على view_logs: إضافة تخطيطية فقط.
    const secondStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(secondStep.rolledBackVersions, [8]);
    assert.deepEqual(await listDomainTables(pool), [...EXPECTED_TABLES]);

    // ثم 0007 (أعمدة المرفقات).
    const thirdStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(thirdStep.rolledBackVersions, [7]);
    assert.deepEqual(await listDomainTables(pool), [...EXPECTED_TABLES]);
  });

  it('تراجع 0006 يزيل جدول الإتاحة فقط، وما قبله يبقى', async () => {
    // يتابع سلسلة التراجع السابقة (0009 ← 0008 ← 0007), فيسقط 0006 الآن.
    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [6]);
    for (const table of PHASE_13_TABLES) {
      assert.equal(await tableExists(pool, table), false, `${table} أُزيل`);
    }
    // ما قبله يبقى كما هو.
    assert.equal(await tableExists(pool, 'auth_sessions'), true);
    assert.equal(await tableExists(pool, 'transactions'), true);
    assert.equal(await tableExists(pool, 'transaction_employees'), true);
    const status = await getMigrationStatus(pool);
    assert.equal(status.filter((entry) => entry.applied).length, MIGRATION_COUNT - 4);
  });

  it('تراجع كل الخطوات يفرغ كل جداول المجال', async () => {
    // الاختبار السابق تراجع به 0006، فيُعاد التطبيق أولاً ليكون التراجع
    // الكامل هنا مستقلاً عن ترتيب الاختبارات.
    await runMigrations(pool);
    const result = await rollbackMigrations(pool, MIGRATION_COUNT);
    assert.deepEqual(result.rolledBackVersions, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, []);
  });

  it('رفض خطوات تراجع غير صالحة', async () => {
    await assert.rejects(() => rollbackMigrations(pool, 0), /غير صالح/);
    await assert.rejects(() => rollbackMigrations(pool, 1.5), /غير صالح/);
  });

  it('إعادة التطبيق بعد التراجع الكامل تعمل من جديد', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(await tableExists(pool, 'transactions'), true);
    for (const table of PHASE_13_TABLES) {
      assert.equal(await tableExists(pool, table), true, `${table} عاد بعد إعادة التطبيق`);
    }
  });

  it('تعديل ملف migration مُطبَّق يُرفض بخطأ واضح (checksum)', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'alsqaya-migrations-'));
    try {
      const sourceDir = defaultMigrationsDir();
      const fileNames = (await readdir(sourceDir)).filter((name) => name.endsWith('.sql'));
      for (const fileName of fileNames) {
        await copyFile(path.join(sourceDir, fileName), path.join(tempDir, fileName));
      }
      // تعديل ملف مُطبَّق: نضيف تعليقاً واحداً فقط.
      const target = path.join(tempDir, '0001_core_identity.sql');
      const { readFile } = await import('node:fs/promises');
      const original = await readFile(target, 'utf8');
      await writeFile(target, `${original}\n-- تعديل بعد التطبيق\n`, 'utf8');

      await assert.rejects(
        () => runMigrations(pool, { dir: tempDir }),
        /عُدِّل بعد تطبيقه/,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it(`loadMigrations يقرأ ${MIGRATION_COUNT} ملفات بمقاطعها وأختامها`, async () => {
    const migrations = await loadMigrations();
    assert.equal(migrations.length, MIGRATION_COUNT);
    assert.deepEqual(
      migrations.map((m) => m.version),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    for (const migration of migrations) {
      assert.match(migration.upSql, /CREATE TABLE|ALTER TABLE/);
      assert.match(migration.downSql, /DROP TABLE|DROP COLUMN|DROP CONSTRAINT|ADD CONSTRAINT/);
      assert.equal(migration.checksum.length, 64);
    }
  });
});
