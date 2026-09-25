/**
 * بيئة قاعدة بيانات الاختبار (Phase 9) — ليست اختباراً بذاتها.
 *
 * - PostgreSQL مدمج (binaries محلية عبر embedded-postgres) بلا تثبيت نظام
 *   وبلا صلاحيات إدارية — لا يُشترط وجود psql أو خدمة نظام.
 * - عنقود واحد مشترك لكل ملف اختبار: البيانات تبقى بين الملفات،
 *   وقاعدة alsqaya_test تُحذف وتُنشأ من جديد عند بدء كل ملف.
 * - لا بيانات حقيقية إطلاقاً: كل ما يُزرع داخل الاختبارات اصطناعي.
 * - الملفات تتسلسل (--test-concurrency=1) فلا تنافس على المنفذ 5440.
 */
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { Pool } from 'pg';
import { createPool } from '../../src/database/pool';
import { runMigrations } from '../../src/database/migrations';

const PORT = 5440;
const USER = 'alsqaya';
const PASSWORD = 'alsqaya_test';

/** اسم قاعدة الاختبار المعزولة. */
export const TEST_DATABASE_NAME = 'alsqaya_test';

/** كل جداول المجال الـ18 — تُصفَّر بين الاختبارات دون المساس بسجل الـMigrations. */
const DOMAIN_TABLES: readonly string[] = [
  'users',
  'employees',
  'employee_status_history',
  'transactions',
  'transaction_employees',
  'attachments',
  'leaves',
  'leave_balances',
  'leave_ledger',
  'time_permissions',
  'assignments',
  'courses',
  'daily_situations',
  'requests',
  'notifications',
  'reminders',
  'audit_logs',
  'view_logs',
];

let instance: EmbeddedPostgres | null = null;
let pool: Pool | null = null;

/** مقبض القاعدة جاهزاً للاستخدام. */
export interface TestDbHandle {
  pool: Pool;
  connectionString: string;
}

/**
 * يشغّل العنقود (أو يعيد استخدامه بين ملفات الاختبار المتسلسلة)،
 * يعيد إنشاء قاعدة الاختبار من الصفر، ويطبّق الـMigrations إن طُلب.
 */
export async function startTestDatabase(options: { migrate?: boolean } = {}): Promise<TestDbHandle> {
  const { migrate = true } = options;
  const dataDir = path.join(os.tmpdir(), 'alsqaya-test-pg');
  instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => undefined,
    onError: (message) => console.error('[test-pg]', String(message)),
  });
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    await instance.initialise();
  }
  await instance.start();
  try {
    await instance.dropDatabase(TEST_DATABASE_NAME);
  } catch {
    // القاعدة غير موجودة في أول تشغيل — متوقّع.
  }
  await instance.createDatabase(TEST_DATABASE_NAME);

  const connectionString = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${TEST_DATABASE_NAME}`;
  pool = createPool(connectionString);
  if (migrate) {
    await runMigrations(pool);
  }
  return { pool, connectionString };
}

/** يغلق الاتصالات ثم يوقف العنقود (يبقى بين ملفات الاختبار). */
export async function stopTestDatabase(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
  if (instance !== null) {
    await instance.stop();
    instance = null;
  }
}

/** يصفّر كل جداول المجال (يبقى schema_migrations كما هو). */
export async function resetDomainTables(target: Pool): Promise<void> {
  await target.query(`TRUNCATE ${DOMAIN_TABLES.join(', ')} CASCADE`);
}

/** يتحقق أن الجدول موجود في مخطط القاعدة. */
export async function tableExists(target: Pool, tableName: string): Promise<boolean> {
  const result = await target.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return result.rows[0].exists;
}

/** كل جداول المخطط العام مرتبة (للمقارنة بالـ18 المتوقعة). */
export async function listDomainTables(target: Pool): Promise<string[]> {
  const result = await target.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
     ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}
