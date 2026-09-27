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
 * كل جداول المجال الـ21 المتوقعة (مرتبة أبجدياً كما تعيده القاعدة).
 * Phase 11 أضافت auth_sessions وauth_otp_codes وauth_otp_rate_limits.
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
  'transaction_employees',
  'transactions',
  'users',
  'view_logs',
];

/** عدد ملفات الـmigrations بعد Phase 11. */
const MIGRATION_COUNT = 5;

/** الجداول التي ينشئها ملف 0005 وحده. */
const PHASE_11_TABLES: readonly string[] = [
  'auth_sessions',
  'auth_otp_codes',
  'auth_otp_rate_limits',
];

describe('Phase 9 — الـMigrations: التطبیق والتراجع', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase({ migrate: false }));
  });

  after(async () => {
    await stopTestDatabase();
  });

  it(`runMigrations يطبّق الـ${MIGRATION_COUNT} إصدارات ويوجد الـ21 جدولاً حصراً`, async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, [1, 2, 3, 4, 5]);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, [...EXPECTED_TABLES]);
    assert.equal(tables.length, 21);
  });

  it('runMigrations ثانيةً لا يطبّق شيئاً (لا تكرار بناء)', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, []);
  });

  it(`getMigrationStatus يعرض ${MIGRATION_COUNT} إصدارات مُطبَّقة بأختامها`, async () => {
    const status = await getMigrationStatus(pool);
    assert.equal(status.length, MIGRATION_COUNT);
    assert.ok(status.every((entry) => entry.applied && entry.appliedAt !== null));
    assert.deepEqual(status.map((entry) => entry.version), [1, 2, 3, 4, 5]);
  });

  it('تراجع خطوة واحدة يزيل جداول 0005 (مصادقة) فقط', async () => {
    const result = await rollbackMigrations(pool, 1);
    assert.deepEqual(result.rolledBackVersions, [5]);
    for (const table of PHASE_11_TABLES) {
      assert.equal(await tableExists(pool, table), false, `${table} أُزيل`);
    }
    // أعمدة users المضافة في 0005 ترجع كذلك، وما قبلها يبقى.
    assert.equal(await tableExists(pool, 'audit_logs'), true);
    assert.equal(await tableExists(pool, 'employees'), true);
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'status'`,
    );
    assert.equal(columns.rows.length, 0, 'عمود users.status أُزيل مع التراجع');
    const status = await getMigrationStatus(pool);
    assert.equal(status.filter((entry) => entry.applied).length, MIGRATION_COUNT - 1);
  });

  it('تراجع كل الخطوات يفرغ كل جداول المجال', async () => {
    // الاختبار السابق تراجع به 0005، فيُعاد التطبيق أولاً ليكون التراجع
    // الكامل هنا مستقلاً عن ترتيب الاختبارات.
    await runMigrations(pool);
    const result = await rollbackMigrations(pool, MIGRATION_COUNT);
    assert.deepEqual(result.rolledBackVersions, [5, 4, 3, 2, 1]);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, []);
  });

  it('رفض خطوات تراجع غير صالحة', async () => {
    await assert.rejects(() => rollbackMigrations(pool, 0), /غير صالح/);
    await assert.rejects(() => rollbackMigrations(pool, 1.5), /غير صالح/);
  });

  it('إعادة التطبيق بعد التراجع الكامل تعمل من جديد', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, [1, 2, 3, 4, 5]);
    assert.equal(await tableExists(pool, 'transactions'), true);
    for (const table of PHASE_11_TABLES) {
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
      [1, 2, 3, 4, 5],
    );
    for (const migration of migrations) {
      assert.match(migration.upSql, /CREATE TABLE|ALTER TABLE/);
      assert.match(migration.downSql, /DROP TABLE|DROP COLUMN/);
      assert.equal(migration.checksum.length, 64);
    }
  });
});
