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

/** كل جداول المجال الـ18 المتوقعة (مرتبة أبجدياً كما تعيده القاعدة). */
const EXPECTED_TABLES: readonly string[] = [
  'assignments',
  'attachments',
  'audit_logs',
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

describe('Phase 9 — الـMigrations: التطبیق والتراجع', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase({ migrate: false }));
  });

  after(async () => {
    await stopTestDatabase();
  });

  it('runMigrations يطبّق الـ4 إصدارات ويوجد الـ18 جدولاً حصراً', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, [1, 2, 3, 4]);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, [...EXPECTED_TABLES]);
    assert.equal(tables.length, 18);
  });

  it('runMigrations ثانيةً لا يطبّق شيئاً (لا تكرار بناء)', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, []);
  });

  it('getMigrationStatus يعرض 4 إصدارات مُطبَّقة بأختامها', async () => {
    const status = await getMigrationStatus(pool);
    assert.equal(status.length, 4);
    assert.ok(status.every((entry) => entry.applied && entry.appliedAt !== null));
    assert.deepEqual(status.map((entry) => entry.version), [1, 2, 3, 4]);
  });

  it('تراجع خطوة واحدة يزيل جداول 0004 فقط', async () => {
    const result = await rollbackMigrations(pool, 1);
    assert.deepEqual(result.rolledBackVersions, [4]);
    assert.equal(await tableExists(pool, 'view_logs'), false);
    assert.equal(await tableExists(pool, 'audit_logs'), false);
    assert.equal(await tableExists(pool, 'employees'), true);
    assert.equal(await tableExists(pool, 'leaves'), true);
    const status = await getMigrationStatus(pool);
    assert.equal(status.filter((entry) => entry.applied).length, 3);
  });

  it('تراجع 3 خطوات يفرغ كل جداول المجال', async () => {
    const result = await rollbackMigrations(pool, 3);
    assert.deepEqual(result.rolledBackVersions, [3, 2, 1]);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, []);
  });

  it('رفض خطوات تراجع غير صالحة', async () => {
    await assert.rejects(() => rollbackMigrations(pool, 0), /غير صالح/);
    await assert.rejects(() => rollbackMigrations(pool, 1.5), /غير صالح/);
  });

  it('إعادة التطبيق بعد التراجع الكامل تعمل من جديد', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, [1, 2, 3, 4]);
    assert.equal(await tableExists(pool, 'transactions'), true);
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

  it('loadMigrations يقرأ 4 ملفات بمقاطعها وأختامها', async () => {
    const migrations = await loadMigrations();
    assert.equal(migrations.length, 4);
    assert.deepEqual(migrations.map((m) => m.version), [1, 2, 3, 4]);
    for (const migration of migrations) {
      assert.match(migration.upSql, /CREATE TABLE/);
      assert.match(migration.downSql, /DROP TABLE/);
      assert.equal(migration.checksum.length, 64);
    }
  });
});
