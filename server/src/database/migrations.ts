/**
 * مشغّل الـMigrations (Phase 9) — بدون أدوات خارجية، بالـSQL فقط.
 *
 * الصيغة: كل ملف SQL في server/migrations يحمل مقطعين:
 *   -- migrate:up     (بناء الجداول — يُنفَّذ ضمن معاملة واحدة ذرّية)
 *   -- migrate:down   (التراجع الكامل لنفس الملف — خطوة بخطوة)
 *
 * السجل: جدول schema_migrations (version, name, checksum, applied_at).
 * checksum لملف مُطبَّق مُتحقَّق منه عند كل تشغيل — تعديل ملف مُطبَّق
 * سابقاً يوقف النظام خطأً واضحاً بدل كسر تسلسل التاريخ.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** ملف migration واحد بعد تحليله. */
export interface MigrationFile {
  /** الرقم الافتراضي من بداية اسم الملف (0001 ⇒ 1). */
  version: number;
  /** اسم الملف بدون رقم وبextension (0001_core_identity.sql ⇒ core_identity). */
  name: string;
  fileName: string;
  upSql: string;
  downSql: string;
  /** SHA-256 للمحتوى الكامل — حارس تعديل المُطبَّق. */
  checksum: string;
}

/** صف مُطبَّق من schema_migrations. */
export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

/** نتيجة تطبيق الـMigrations. */
export interface MigrationRunResult {
  /** إصدارات طُبِّقت الآن (فارغة = لا جديد). */
  appliedVersions: number[];
}

/** نتيجة التراجع. */
export interface RollbackResult {
  rolledBackVersions: number[];
}

/** سطر حالة للاطلاع. */
export interface MigrationStatusEntry {
  version: number;
  name: string;
  applied: boolean;
  appliedAt: string | null;
}

const UP_MARKER = '-- migrate:up';
const DOWN_MARKER = '-- migrate:down';
const MIGRATIONS_TABLE = 'schema_migrations';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** المسار الافتراضي لمجلد الـMigrations (server/migrations). */
export function defaultMigrationsDir(): string {
  return path.resolve(moduleDir, '..', '..', 'migrations');
}

/** خيارات المسار الاختيارية (الاختبارات تستخدم نسخة مؤقتة للتحقق من checksum). */
export interface MigrationOptions {
  dir?: string;
}

/** تحليل محتوى ملف إلى مقطعي up/down مع التحقق من الصيغة. */
function parseMigrationContent(fileName: string, raw: string): { upSql: string; downSql: string } {
  const upIndex = raw.indexOf(UP_MARKER);
  const downIndex = raw.indexOf(DOWN_MARKER);
  if (upIndex < 0 || downIndex < 0 || downIndex < upIndex) {
    throw new Error(
      `ملف migration غير مطابق للصيغة (يحتاج -- migrate:up ثم -- migrate:down): ${fileName}`,
    );
  }
  const upSql = raw.slice(upIndex + UP_MARKER.length, downIndex).trim();
  const downSql = raw.slice(downIndex + DOWN_MARKER.length).trim();
  if (upSql === '' || downSql === '') {
    throw new Error(`ملف migration بمقطع فارغ (up/down): ${fileName}`);
  }
  return { upSql, downSql };
}

/** استخراج رقم الإصدار واسمه من اسم الملف. */
function parseIdentity(fileName: string): { version: number; name: string } {
  const match = /^(\d+)_(.+)\.sql$/.exec(fileName);
  if (match === null) {
    throw new Error(`اسم ملف migration غير صالح (NNNN_name.sql): ${fileName}`);
  }
  const version = Number(match[1]);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`رقم إصدار غير صالح في اسم الملف: ${fileName}`);
  }
  return { version, name: match[2] };
}

/** تحميل كل ملفات الـMigrations من المجلد (مرتبة تصاعدياً). */
export async function loadMigrations(options: MigrationOptions = {}): Promise<MigrationFile[]> {
  const dir = options.dir ?? defaultMigrationsDir();
  const entries = await readdir(dir);
  const sqlFileNames = entries.filter((fileName) => fileName.endsWith('.sql')).sort();
  const migrations: MigrationFile[] = [];
  const seenVersions = new Set<number>();
  for (const fileName of sqlFileNames) {
    const { version, name } = parseIdentity(fileName);
    if (seenVersions.has(version)) {
      throw new Error(`رقم إصدار مكرر في ملفات migration: ${version}`);
    }
    seenVersions.add(version);
    const raw = await readFile(path.join(dir, fileName), 'utf8');
    const { upSql, downSql } = parseMigrationContent(fileName, raw);
    migrations.push({
      version,
      name,
      fileName,
      upSql,
      downSql,
      checksum: createHash('sha256').update(raw, 'utf8').digest('hex'),
    });
  }
  return migrations;
}

/** ينشئ جدول سجل الـMigrations إن لم يوجد (idempotent). */
async function ensureMigrationsTable(query: { query(sql: string): Promise<unknown> }): Promise<void> {
  await query.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/** يقرأ الإصدارات المُطبَّقة مرتدة. */
async function readApplied(pool: Pool): Promise<AppliedMigration[]> {
  const result = await pool.query<{ version: number; name: string; checksum: string; applied_at: string }>(
    `SELECT version, name, checksum, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY version DESC`,
  );
  return result.rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
}

/**
 * يتحقق أن كل إصدار مُطبَّق موجود في المجلد وبنفس checksum
 * (ملف مفقود أو معدَّل = خطأ واضح قبل أي تنفيذ).
 */
function verifyApplied(migrations: MigrationFile[], applied: AppliedMigration[]): void {
  for (const record of applied) {
    const file = migrations.find((migration) => migration.version === record.version);
    if (file === undefined) {
      throw new Error(
        `ملف migration مُطبَّق مفقود من المجلد (version ${record.version}) — لا يمكن المتابعة.`,
      );
    }
    if (file.checksum !== record.checksum) {
      throw new Error(
        `ملف migration مُطبَّق عُدِّل بعد تطبيقه (version ${record.version}, ${file.fileName}) — `
        + 'تعديل المُطبَّق ممنوع؛ أنشئ migration جديداً بدلاً من ذلك.',
      );
    }
  }
}
/**
 * يطبّق كل الإصدارات غير المُطبَّقة بالترتيب داخل معاملة واحدة ذرّية.
 * عند أي فشل يعود كل شيء إلى ما كان عليه (ROLLBACK كامل للدفعة).
 */
export async function runMigrations(
  pool: Pool,
  options: MigrationOptions = {},
): Promise<MigrationRunResult> {
  const migrations = await loadMigrations(options);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureMigrationsTable(client);
    const appliedResult = await client.query<{ version: number; checksum: string }>(
      `SELECT version, checksum FROM ${MIGRATIONS_TABLE} ORDER BY version DESC`,
    );
    const applied: AppliedMigration[] = appliedResult.rows.map((row) => ({
      version: row.version,
      name: '',
      checksum: row.checksum,
      appliedAt: '',
    }));
    verifyApplied(migrations, applied);

    const appliedSet = new Set(applied.map((record) => record.version));
    const appliedVersions: number[] = [];
    for (const migration of migrations) {
      if (appliedSet.has(migration.version)) {
        continue;
      }
      await client.query(migration.upSql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
        [migration.version, migration.name, migration.checksum],
      );
      appliedVersions.push(migration.version);
    }
    await client.query('COMMIT');
    return { appliedVersions };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * يرجع آخر n إصدارات مُطبَّقة إلى حالتها قبل التطبيق (الأحدث أولاً).
 * كل خطوة تراجع = معاملة مستقلة: down + حذف السجل معاً لا ينفصلان.
 */
export async function rollbackMigrations(
  pool: Pool,
  steps: number = 1,
  options: MigrationOptions = {},
): Promise<RollbackResult> {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error(`عدد خطوات التراجع غير صالح: ${steps}. يجب أن يكون عددًا صحيحًا ≥ 1.`);
  }
  const migrations = await loadMigrations(options);
  await ensureMigrationsTable(pool);
  const applied = await readApplied(pool);
  verifyApplied(migrations, applied);
  const targets = applied.slice(0, steps);
  const rolledBackVersions: number[] = [];
  for (const record of targets) {
    const migration = migrations.find((file) => file.version === record.version);
    if (migration === undefined) {
      throw new Error(`لا يمكن التراجع — ملف migration مفقود: version ${record.version}`);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.downSql);
      await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE version = $1`, [record.version]);
      await client.query('COMMIT');
      rolledBackVersions.push(record.version);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return { rolledBackVersions };
}

/** حالة كل ملف: مُطبَّق (ومع متى) أم معلَّق. */
export async function getMigrationStatus(
  pool: Pool,
  options: MigrationOptions = {},
): Promise<MigrationStatusEntry[]> {
  const migrations = await loadMigrations(options);
  await ensureMigrationsTable(pool);
  const applied = await readApplied(pool);
  const appliedByVersion = new Map(applied.map((record) => [record.version, record]));
  return migrations.map((migration) => {
    const record = appliedByVersion.get(migration.version);
    return {
      version: migration.version,
      name: migration.name,
      applied: record !== undefined,
      appliedAt: record?.appliedAt ?? null,
    };
  });
}
