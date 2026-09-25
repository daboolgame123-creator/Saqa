/**
 * اتصال PostgreSQL ومعالجة المعاملات (Phase 9) — بلا أي منطق أعمال.
 *
 * المسؤوليات:
 * - إنشاء Pool من DATABASE_URL والpool المشترك للعملية.
 * - قراءة الأنواع: تاريخ كنص وتوقيت كـISO 8601 UTC (انظر dateTime.ts).
 * - withTransaction: BEGIN/COMMIT/ROLLBACK فقط — لا قواعد أعمال إطلاقاً.
 */
import { Client, Pool, types } from 'pg';
import { config } from '../config';
import { TechnicalLogger } from '../logging';

/**
 * نوع مشترك لاستعلامات SQL: Pool (مستقل) أو Client داخل معاملة.
 * كل repositories تستقبله حتى تعمل داخل معاملة واحدة مع الوحدات الأخرى.
 */
export type Queryable = Pool | Client;

/** هل طُبِّقت محلّلات الأنواع؟ (idempotent على مستوى العملية). */
let typeParsersApplied = false;

/**
 * ضبط محلّلات pg لاستراتيجية التواريخ الموحدة:
 * - date (1082): يبقى نص YYYY-MM-DD (لا Date — لا انزياح منطقة زمنية).
 * - timestamp (1114): يبقى نص كما هو.
 * - timestamptz (1184): يُحوَّل إلى ISO 8601 بصيغة UTC (Z).
 * - numeric/int يبقي نصوصاً في الافتراضي (دقائق مالية/رصيد بلا فقد دقة).
 */
function applyTypeParsers(): void {
  if (typeParsersApplied) {
    return;
  }
  typeParsersApplied = true;
  types.setTypeParser(1082, (value: string) => value);
  types.setTypeParser(1114, (value: string) => value);
  types.setTypeParser(1184, (value: string) => new Date(value).toISOString());
}

/**
 * إنشاء Pool جديد على رابط معيّن.
 * أخطاء العملاء الخاملة تُسجَّل تقنياً بدل إسقاط العملية (لا قيم حساسة تُطبع).
 */
export function createPool(connectionString: string): Pool {
  applyTypeParsers();
  const pool = new Pool({ connectionString, max: 10, application_name: 'alsqaya' });
  pool.on('error', (error: Error) => {
    TechnicalLogger.error('idle database client error', {
      source: 'database',
      data: { error: error.message },
    });
  });
  return pool;
}

/** الـPool المشترك للعملية — يُنشأ بأول استدعاء من DATABASE_URL. */
let sharedPool: Pool | null = null;

/** يعيد الـPool المشترك، أو يرمي خطأً واضحاً إن لم يُضبط DATABASE_URL. */
export function getSharedPool(): Pool {
  if (config.databaseUrl === '') {
    throw new Error(
      'DATABASE_URL غير مهيأ — عيّن رابط PostgreSQL في بيئة العملية أولاً.',
    );
  }
  if (sharedPool === null) {
    sharedPool = createPool(config.databaseUrl);
  }
  return sharedPool;
}

/** يغلق الـPool المشترك إن وُجد (no-op إن لم يُفتح) — يُستدعى عند إيقاف الخادم. */
export async function closeSharedPool(): Promise<void> {
  if (sharedPool === null) {
    return;
  }
  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
}

/**
 * تنفيذ عملية ضمن معاملة واحدة: نجاح ⇒ COMMIT، فشل ⇒ ROLLBACK وإعادة الخطأ.
 * لا يوجد هنا أي تحقق من قواعد أعمال — مسؤولية النداء driver وحده.
 */
export async function withTransaction<T>(
  pool: Pool,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      TechnicalLogger.error('transaction rollback failed', {
        source: 'database',
        data: {
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        },
      });
    }
    throw error;
  } finally {
    client.release();
  }
}
