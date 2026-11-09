/**
 * سطر أوامر قاعدة البيانات (Phase 9).
 *
 * الاستخدام:
 *   npm run db:migrate            تطبيق كل ما لم يُطبَّق
 *   npm run db:rollback -- --confirm-destructive [--steps N] (non-production only)
 *   npm run db:status             عرض حالة كل ملف
 *
 * يتطلب DATABASE_URL في بيئة العملية. لا يطبع الرابط أبداً (بيانات حساسة).
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool';
import { getMigrationStatus, rollbackMigrations, runMigrations } from './migrations';

type Command = 'up' | 'down' | 'status';

/** نتيجة تحليل وسائط سطر الأوامر، بعد رفض أي وسيط غير معتمد. */
export interface CliArgs {
  command: Command;
  steps: number;
  confirmDestructive: boolean;
}

const USAGE =
  'الاستخدام: cli.ts <up|status> أو cli.ts down --confirm-destructive [--steps N]';

/** تحليل صارم: لا تجاهل لوسيط مجهول أو تكرار تأكيد/خطوات. */
export function parseArgs(argv: readonly string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== 'up' && command !== 'down' && command !== 'status') {
    throw new Error(`أمر غير معروف. ${USAGE}`);
  }
  let steps = 1;
  let seenSteps = false;
  let confirmDestructive = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--steps' && command === 'down' && !seenSteps) {
      seenSteps = true;
      const raw = rest[++i];
      if (raw === undefined || !/^[1-9][0-9]*$/.test(raw) ||
          !Number.isSafeInteger(Number(raw))) {
        throw new Error('عدد خطوات التراجع غير صالح. ' + USAGE);
      }
      steps = Number(raw);
    } else if (arg === '--confirm-destructive' && command === 'down' &&
               !confirmDestructive) {
      confirmDestructive = true;
    } else {
      throw new Error('وسيط غير معروف أو مكرر: ' + arg + '. ' + USAGE);
    }
  }
  return { command, steps, confirmDestructive };
}

/** حارس الأمر التدميري قبل إنشاء Pool أو الاتصال بقاعدة البيانات.
 * Production down is entirely forbidden; a non-production down requires
 * an explicit command-line acknowledgement. It is NOT proof that the target
 * DATABASE_URL is safe (a deployer must separately verify its identity).
 */
export function assertCliRollbackAllowed(args: CliArgs, environment: string | undefined): void {
  if (args.command !== 'down') return;
  if (environment === 'production') {
    throw new Error('تراجع قاعدة البيانات محظور في وضع الإنتاج. استعد النسخة الاحتياطية المعتمدة.');
  }
  if (!args.confirmDestructive) {
    throw new Error('التراجع قد يحذف بيانات. للتطوير المعزول فقط أضف --confirm-destructive.');
  }
}

/** ينفذ أمر CLI ويعيد رمز الخروج (0 نجاح، 1 فشل). */
export async function runCli(argv: readonly string[]): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (databaseUrl === '') {
    console.error('DATABASE_URLغير مهيأ — عيّن رابط PostgreSQL أولاً (انظر .env.example).');
    return 1;
  }
  try {
    const args = parseArgs(argv);
    assertCliRollbackAllowed(args, process.env.NODE_ENV);
    const { command, steps } = args;
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
