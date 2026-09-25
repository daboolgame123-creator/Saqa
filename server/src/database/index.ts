/**
 * وحدة قاعدة البيانات (Phase 9) — السطح العام للباقي من المراحل.
 *
 * الطبقات:
 * - pool.ts: اتصال ومعاملات (بلا أعمال).
 * - migrations.ts: تطبيق/تراجّع/حالة الـMigrations.
 * - dateTime.ts: استراتيجية التواريخ الموحدة.
 * - repositories/: ربط كيانات المجال الفعلية بـPostgreSQL.
 * - cli.ts / devServer.ts: أدوات تشغيل (لا تُستورد من الخادم).
 */
export {
  closeSharedPool,
  createPool,
  getSharedPool,
  withTransaction,
  type Queryable,
} from './pool';
export {
  defaultMigrationsDir,
  getMigrationStatus,
  loadMigrations,
  rollbackMigrations,
  runMigrations,
  type AppliedMigration,
  type MigrationFile,
  type MigrationOptions,
  type MigrationRunResult,
  type MigrationStatusEntry,
  type RollbackResult,
} from './migrations';
export {
  deriveMonth,
  isValidDateOnly,
  isValidTimeOfDay,
  localDateOnly,
  normalizeTimeOfDay,
  toIsoTimestamp,
  type DateOnly,
  type IsoTimestamp,
  type TimeOfDay,
} from './dateTime';
