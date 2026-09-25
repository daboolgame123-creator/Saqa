/**
 * سطر أوامر قاعدة البيانات (Phase 9).
 *
 * الاستخدام:
 *   npm run db:migrate            تطبيق كل ما لم يُطبَّق
 *   npm run db:rollback           تراجع خطوة واحدة (Options: --steps N)
 *   npm run db:status             عرض حالة كل ملف
 *
 * يتطلب DATABASE_URL في بيئة العملية. لا يطبع الرابط أبداً (بيانات حساسة).
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool';
import { getMigrationStatus, rollbackMigrations, runMigrations } from './migrations';

type Command = 'up' | 'down' | 'status';

/** نتيجة تحليل وسائط سطر الأوامر. */
interface CliArgs {
  command: Command;
  steps: number;
}

const USAGE = 'الاستخدام: cli.ts <up|down|status> [--steps N]';

/** يقرأ الأمر وعدد خطوات التراجع، أو يرمي خطأ استخدام واضح. */
function parseArgs(argv: readonly string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== 'up' && command !== 'down' && command !== 'status') {
    throw new Error(`أمر غير معروف. ${USAGE}`);
  }
  let steps = 1;
  const stepsIndex = rest.indexOf('--steps');
  if (stepsIndex >= 0) {
    const raw = rest[stepsIndex + 1];
    steps = Number(raw);
    if (!Number.isInteger(steps) || steps < 1) {
      throw new Error(`قيمة --steps غير صالحة: "${raw ?? ''}". يجب أن يكون عددًا صحيحًا ≥ 1.`);
    }
  }
  return { command, steps };
}

/** ينفذ أمر CLI ويعيد رمز الخروج (0 نجاح، 1 فشل). */
export async function runCli(argv: readonly string[]): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '') {
    console.error('DATABASE_URLغير مهيأ — عيّن رابط PostgreSQL أولاً (انظر .env.example).');
    return 1;
  }
  try {
    const { command, steps } = parseArgs(argv);
    const pool = createPool(databaseUrl);
    try {
      if (command === 'up') {
        const result = await runMigrations(pool);
        if (result.appliedVersions.length === 0) {
          console.log('لا يوجد migration جديد — كل شيء مُطبَّق مسبقاً.');
        } else {
          console.log(`طُبِّقت الإصدارات: ${result.appliedVersions.join(', ')}`);
        }
      } else if (command === 'down') {
        const result = await rollbackMigrations(pool, steps);
        if (result.rolledBackVersions.length === 0) {
          console.log('لا يوجد ما يُرجَع — كل الملفات في أقدم حالة ممكنة.');
        } else {
          console.log(`رُجعت الإصدارات: ${result.rolledBackVersions.join(', ')}`);
        }
      } else {
        const entries = await getMigrationStatus(pool);
        for (const entry of entries) {
          const state = entry.applied ? `مُطبَّق ${entry.appliedAt ?? ''}` : 'معلَّق';
          console.log(`${String(entry.version).padStart(4, '0')}_${entry.name} — ${state}`);
        }
      }
      return 0;
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** هل يُنفَّذ هذا الملف مباشرة (وليس مستوردًا)؟ */
function isDirectRun(): boolean {
  const entryPath = process.argv[1];
  if (entryPath === undefined) {
    return false;
  }
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
