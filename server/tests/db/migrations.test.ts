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
 * Phase 19 أضافت request_status_history.
 * Phase 21 **لم تُضِف جداول** (0014 فهارس + `processed_at` فقط) — فقائمة
 * الجداول تبقى 24 كما هي، وهذا بحدّ ذاته تأكيد للفصل بين «جدول جديد»
 * و«ما يُبنى فوق جدول قائم».
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
  'request_status_history',
  'requests',
  'time_permissions',
  'transaction_availability',
  'transaction_employees',
  'transaction_relations',
  'transactions',
  'users',
  'view_logs',
];

/** عدد ملفات الـmigrations بعد إصلاح تفرد الروابط بلا دور. */
const MIGRATION_COUNT = 16;

/** الجداول التي ينشئها ملف 0006 وحده. */
const PHASE_13_TABLES: readonly string[] = [
  'transaction_availability',
];

/** الجدول الذي ينشئه ملف 0012 وحده (تاريخ حالات الطلبات). */
const PHASE_19_TABLES: readonly string[] = [
  'request_status_history',
];

/** الجدول الذي ينشئه ملف 0013 وحده (ارتباط الكتب). */
const PHASE_20_TABLES: readonly string[] = [
  'transaction_relations',
];

/** كل إصدارات الترحيلات المطبَّقة بالترتيب. */
const ALL_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

/** كل إصدارات الترحيلات بالترتيب التنازلي (تراجع كامل). */
const ALL_VERSIONS_DESC: readonly number[] = [
  16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
];

// Phase15-N adds a per-account open state table, without changing the
// Phase1 0016 constraint/index or any historical migration.
const PHASE15_N_VERSIONS = [...ALL_VERSIONS, 17];
const PHASE15_N_VERSIONS_DESC = [17, ...ALL_VERSIONS_DESC];
const PHASE15_N_TABLES = [...EXPECTED_TABLES, 'transaction_opened'].sort();

/** جداول المخطط بعد إسقاط المجموعات المعطاة (تراجع متتابع). */
function tablesWithout(...groups: readonly (readonly string[])[]): string[] {
  return EXPECTED_TABLES.filter(
    (table) => !groups.some((group) => group.includes(table)),
  );
}

describe('Phase 9 — الـMigrations: التطبیق والتراجع', () => {
  let pool: Pool;

  before(async () => {
    ({ pool } = await startTestDatabase({ migrate: false }));
  });

  after(async () => {
    await stopTestDatabase();
  });

  it('runMigrations يطبّق الإصدارات مع جدول فتح الكتب الشخصي', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, PHASE15_N_VERSIONS);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, PHASE15_N_TABLES);
    assert.equal(tables.length, 25);
  });

  it('runMigrations ثانيةً لا يطبّق شيئاً (لا تكرار بناء)', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, []);
  });

  it('getMigrationStatus يعرض الإصدارات بما فيها فتح الكتب', async () => {
    const status = await getMigrationStatus(pool);
    assert.equal(status.length, MIGRATION_COUNT + 1);
    assert.ok(status.every((entry) => entry.applied && entry.appliedAt !== null));
    assert.deepEqual(status.map((entry) => entry.version), PHASE15_N_VERSIONS);
  });

  it('تراجع 0017 يزيل فقط علامات الفتح المملوءة ويحفظ الكتب والتاريخ وAudit', async () => {
    // Fresh isolated PostgreSQL only. Seed actual linked records BEFORE down.
    // The full official application must be stopped before this migration is
    // rolled back operationally: running "new-ids"/"opened" needs the table.
    assert.equal(await tableExists(pool, 'transaction_opened'), true);
    const employee = await pool.query<{ id: string }>(
      "INSERT INTO employees (name,title,department) VALUES ('اختبار', 'موظف', 'إدارية') RETURNING id",
    );
    const employeeId = employee.rows[0].id;
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (username,display_name,role,employee_id)
       VALUES ('PHASE15-N-ROLLBACK','Synthetic N', 'employee', $1) RETURNING id`, [employeeId],
    );
    const userId = user.rows[0].id;
    const book = await pool.query<{ id: string }>(
      `INSERT INTO transactions (
        number,sequence,document_date,month,direction,category,sub_type,entity,subject
      ) VALUES ('15-N-ROLLBACK','N-1','2026-11-23','2026-11','وارد','إدارية',
        'اختبار','Synthetic','Preserve existing book') RETURNING id`,
    );
    const bookId = book.rows[0].id;
    await pool.query(
      'INSERT INTO transaction_opened (user_id,transaction_id) VALUES ($1,$2)',
      [userId, bookId],
    );
    await pool.query(
      'INSERT INTO view_logs (transaction_id,user_id,employee_id,acknowledged_at) VALUES ($1,$2,$3,now())',
      [bookId, userId, employeeId],
    );
    await pool.query(
      "INSERT INTO audit_logs (event_kind,actor_user_id,entity_kind,entity_id) VALUES ('create',$1,'transaction',$2)",
      [userId, bookId],
    );
    await pool.query(
      "INSERT INTO notifications (user_id,kind,payload) VALUES ($1,'book_available','{}'::jsonb)",
      [userId],
    );
    const before = await pool.query<{ table_name: string; total: string }>(
      `SELECT 'books' AS table_name, count(*)::text AS total FROM transactions WHERE id=$1
       UNION ALL SELECT 'view_logs', count(*)::text FROM view_logs WHERE transaction_id=$1
       UNION ALL SELECT 'audit_logs', count(*)::text FROM audit_logs WHERE entity_kind='transaction' AND entity_id=$1
       UNION ALL SELECT 'notifications', count(*)::text FROM notifications WHERE user_id=$2`,
      [bookId,userId],
    );
    assert.deepEqual(before.rows.map(x=>x.total), ['1','1','1','1']);
    const opened = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM transaction_opened WHERE user_id=$1 AND transaction_id=$2',
      [userId,bookId],
    );
    assert.equal(opened.rows[0].count, '1', 'the marker is populated before rollback');

    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [17]);
    assert.equal(await tableExists(pool, 'transaction_opened'), false);
    assert.deepEqual(await listDomainTables(pool), [...EXPECTED_TABLES]);
    const after = await pool.query<{ table_name: string; total: string }>(
      `SELECT 'books' AS table_name, count(*)::text AS total FROM transactions WHERE id=$1
       UNION ALL SELECT 'view_logs', count(*)::text FROM view_logs WHERE transaction_id=$1
       UNION ALL SELECT 'audit_logs', count(*)::text FROM audit_logs WHERE entity_kind='transaction' AND entity_id=$1
       UNION ALL SELECT 'notifications', count(*)::text FROM notifications WHERE user_id=$2`,
      [bookId,userId],
    );
    assert.deepEqual(after.rows, before.rows,
      'rollback must preserve books, official acknowledgement, Audit and notification history');
    // Deliberate irreversible loss: user-specific NEW-clearing markers disappear.
    // Re-enabling the feature requires reapplying migration 0017 after upgrade.
  });

  it('تراجع 0015 يزيل فهرس القراءة بالمؤشر فقط دون المساس بالجداول', async () => {
    const before = await pool.query<{count:string}>(
      `SELECT count(*)::text AS count FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'transactions_active_created_cursor_idx'`,
    );
    assert.equal(before.rows[0].count, '1');
    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [15]);
    const after = await pool.query<{count:string}>(
      `SELECT count(*)::text AS count FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'transactions_active_created_cursor_idx'`,
    );
    assert.equal(after.rows[0].count, '0');
    assert.deepEqual(await listDomainTables(pool), [...EXPECTED_TABLES]);
  });

  it('تراجع 0014 (Phase 21) يزيل processed_at والفهارس فقط، بلا مساس بالجداول', async () => {
    // 0014 **لا تنشئ جداول**: `ALTER TABLE reminders ADD COLUMN processed_at`
    // + ثلاثة فهارس. تراجعه يزيل العمود والفهارس ويبقى `notifications`
    // و`reminders` كما هما في 0004 — وهذا ما يفصله عن «جدول جديد».
    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [14]);
    const processedColumn = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'reminders' AND column_name = 'processed_at'`,
    );
    assert.equal(processedColumn.rows[0].count, '0', 'عمود processed_at أُزيل بالتراجع');
    assert.equal(await tableExists(pool, 'reminders'), true, 'reminders باقٍ');
    assert.equal(await tableExists(pool, 'notifications'), true, 'notifications باقٍ');
    assert.deepEqual(await listDomainTables(pool), [...EXPECTED_TABLES]);
  });

  it('تراجع 0013 (Phase 20) يزيل جدول ارتباط الكتب وحده، وما قبله يبقى', async () => {
    // 0013 إضافة فوق 0002/0009: جدول واحد `transaction_relations` بمفتاحين
    // أجنبيين. تراجعه يحذف الجدول ولا يمسّ `transactions` ولا `version`.
    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [13]);
    for (const table of PHASE_20_TABLES) {
      assert.equal(await tableExists(pool, table), false, `${table} أُزيل بالتراجع`);
    }
    assert.equal(await tableExists(pool, 'transactions'), true, 'الكتاب باقٍ');
    assert.equal(await tableExists(pool, 'request_status_history'), true, 'وما قبله باقٍ');
    assert.deepEqual(await listDomainTables(pool), tablesWithout(PHASE_20_TABLES));
  });

  it('تراجع 0012 (Phase 19) يزيل جدول التاريخ وعمود النسخة ويعيد قيود الطلبات', async () => {
    // 0012 إضافة فوق 0004: توسيع قيدَي kind/status + عمود version +
    // جدول request_status_history. تراجعه يعيد القيدَين كما كانا.
    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [12]);
    for (const table of PHASE_19_TABLES) {
      assert.equal(await tableExists(pool, table), false, `${table} أُزيل بالتراجع`);
    }
    const versionColumn = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'requests' AND column_name = 'version'`,
    );
    assert.equal(versionColumn.rows[0].count, '0', 'عمود version أُزيل بالتراجع');
    // القيد العاد للحالات: `draft` لم يعد مقبولاً بعد التراجع.
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO requests (employee_id, kind, payload, status)
           VALUES ('00000000-0000-0000-0000-000000000009', 'leave', '{}', 'draft')`,
        ),
      /foreign key|violates check constraint/,
    );
    // وما قبله من الجداول يبقى كما هو.
    assert.equal(await tableExists(pool, 'requests'), true);
    assert.deepEqual(
      await listDomainTables(pool),
      tablesWithout(PHASE_20_TABLES, PHASE_19_TABLES),
    );
  });

  it('تراجع 0011 (Phase 18) يزيل أعمدة الرصيد وربط العكس، وما قبله يبقى', async () => {
    // 0011 إضافة أعمدة على `leave_balances` و`leave_ledger` — بلا جداول.
    const step = await rollbackMigrations(pool, 1);
    assert.deepEqual(step.rolledBackVersions, [11]);
    assert.deepEqual(
      await listDomainTables(pool),
      tablesWithout(PHASE_20_TABLES, PHASE_19_TABLES),
    );
    const gone = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'leave_balances' AND column_name = 'annual_balance'`,
    );
    assert.equal(gone.rows[0].count, '0', 'أعمدة الرصيد أُزيلت بالتراجع');
    assert.equal(await tableExists(pool, 'leaves'), true);
  });

  it('تراجع 0010 ثم 0009 ثم 0008 ثم 0007: إضافات تخطيطية بلا أثر على الجداول', async () => {
    const tablesAfter0012 = tablesWithout(PHASE_20_TABLES, PHASE_19_TABLES);
    const versionStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(versionStep.rolledBackVersions, [10]);
    assert.deepEqual(await listDomainTables(pool), tablesAfter0012);
    const versionColumn = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'version'`,
    );
    assert.equal(versionColumn.rows[0].count, '0', 'عمود version أُزيل بالتراجع');

    // 0009 أعمدة أرشفة + قيود FK: تراجعها يمسح الأعمدة ويعيد CASCADE،
    // ولا يُنشئ ولا يحذف أي جدول.
    const firstStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(firstStep.rolledBackVersions, [9]);
    assert.deepEqual(await listDomainTables(pool), tablesAfter0012);
    const columns = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'deleted_at'`,
    );
    assert.equal(columns.rows[0].count, '0', 'عمود deleted_at أُزيل بالتراجع');

    // 0008 قيد UNIQUE على view_logs: إضافة تخطيطية فقط.
    const secondStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(secondStep.rolledBackVersions, [8]);
    assert.deepEqual(await listDomainTables(pool), tablesAfter0012);

    // ثم 0007 (أعمدة المرفقات).
    const thirdStep = await rollbackMigrations(pool, 1);
    assert.deepEqual(thirdStep.rolledBackVersions, [7]);
    assert.deepEqual(await listDomainTables(pool), tablesAfter0012);
  });

  it('تراجع 0006 يزيل جدول الإتاحة فقط، وما قبله يبقى', async () => {
    // يتابع سلسلة التراجع السابقة (0012 ← 0011 ← 0010 ← 0009 ← 0008 ←
    // 0007)، فيسقط 0006 الآن.
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
    // المُطبَّق الآن = من 1 إلى 5 (تراجع 0016..0006 = إحدى عشرة خطوة).
    assert.equal(status.filter((entry) => entry.applied).length, MIGRATION_COUNT - 11);
  });

  it('تراجع كل الخطوات يفرغ كل جداول المجال', async () => {
    // الاختبار السابق تراجع به 0006، فيُعاد التطبيق أولاً ليكون التراجع
    // الكامل هنا مستقلاً عن ترتيب الاختبارات.
    await runMigrations(pool);
    const result = await rollbackMigrations(pool, MIGRATION_COUNT + 1);
    assert.deepEqual(result.rolledBackVersions, PHASE15_N_VERSIONS_DESC);
    const tables = await listDomainTables(pool);
    assert.deepEqual(tables, []);
  });

  it('رفض خطوات تراجع غير صالحة', async () => {
    await assert.rejects(() => rollbackMigrations(pool, 0), /غير صالح/);
    await assert.rejects(() => rollbackMigrations(pool, 1.5), /غير صالح/);
  });

  it('إعادة التطبيق بعد التراجع الكامل تعمل من جديد', async () => {
    const result = await runMigrations(pool);
    assert.deepEqual(result.appliedVersions, PHASE15_N_VERSIONS);
    assert.equal(await tableExists(pool, 'transactions'), true);
    assert.equal(await tableExists(pool, 'transaction_opened'), true);
    for (const table of [...PHASE_13_TABLES, ...PHASE_19_TABLES, ...PHASE_20_TABLES]) {
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

  it('loadMigrations يقرأ جميع الترحيلات بما فيها 0017', async () => {
    const migrations = await loadMigrations();
    assert.equal(migrations.length, MIGRATION_COUNT + 1);
    assert.deepEqual(
      migrations.map((m) => m.version),
      PHASE15_N_VERSIONS,
    );
    for (const migration of migrations) {
      assert.match(migration.upSql, /CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX/);
      assert.match(migration.downSql, /DROP TABLE|DROP COLUMN|DROP CONSTRAINT|ADD CONSTRAINT|DROP INDEX/);
      assert.equal(migration.checksum.length, 64);
    }
  });
});
