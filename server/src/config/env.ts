/** الحد الأقصى الافتراضي لحجم ملف مرفق واحد (25 MiB). */
const DEFAULT_ATTACHMENT_MAX_FILE_SIZE = 25 * 1024 * 1024;

/** حدود الحجم المقبولة لإعداد `ATTACHMENT_MAX_FILE_SIZE_BYTES`. */
const MIN_ATTACHMENT_MAX_FILE_SIZE = 1024;
const MAX_ATTACHMENT_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * جذر تخزين المرفقات: يُؤخذ كما هو من البيئة بلا توسعة.
 *
 * **لا يوجد مسار افتراضي مقصود**: قيمة غائبة أو فارغة تعني «غير مهيأ»،
 * وطبقة التخزين ترفض الكتابة بدل أن تملأ قرصاً في مسار لم يطلبه المشغّل.
 */
function parseAttachmentStorageDir(rawValue: string | undefined): string {
  if (rawValue === undefined) {
    return '';
  }
  return rawValue.trim();
}

/** يحقق حد حجم المرفق: عدد صحيح موجب ضمن الحدود، ويرفض أي قيمة أخرى. */
function parseAttachmentMaxFileSize(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_ATTACHMENT_MAX_FILE_SIZE;
  }
  const value = Number(rawValue.trim());
  if (
    !Number.isInteger(value) ||
    value < MIN_ATTACHMENT_MAX_FILE_SIZE ||
    value > MAX_ATTACHMENT_MAX_FILE_SIZE
  ) {
    throw new Error(
      `ATTACHMENT_MAX_FILE_SIZE_BYTES غير صالح: "${rawValue}". يجب أن يكون عددًا صحيحًا بين ${MIN_ATTACHMENT_MAX_FILE_SIZE} و${MAX_ATTACHMENT_MAX_FILE_SIZE}.`,
    );
  }
  return value;
}

/**
 * بنية، قواعد، وتوقيت الحالات (Phase 8) — وُسّعت في Phase 9 بإعدادات
 * قاعدة البيانات، وفي Phase 11 بإعدادات المصادقة، وفي Phase 14 بإعدادات
 * التخزين المركزي للمرفقات.
 *
 * المصدر الوحيد للإعدادات هو متغيرات بيئة العملية (process.env)،
 * ويُحمَّل هذا الملف مرة واحدة عند أول استيراد.
 *
 * لا تُطبع قيم الأسرار ولا روابط قواعد البيانات ولا مسار التخزين في السجل
 * التقني أبداً (مفاتيح حساسة في logTypes).
 */

import type { LogLevel } from '../logging/logTypes';

/** بيئات التشغيل المدعومة. */
export type NodeEnvironment = 'development' | 'production' | 'test';

/** إعدادات تشغيل الـBackend بعد التحقق منها. */
export interface ServerConfig {
  /** بيئة التشغيل الفعلية. */
  nodeEnv: NodeEnvironment;
  /** منفذ HTTP server. */
  port: number;
  /** true في بيئة production — تُستخدم لتقييد تفاصيل الأخطاء المعادة. */
  isProduction: boolean;
  /** true في بيئة test. */
  isTest: boolean;
  /** أدنى مستوى يُكتب في السجل التقني المهيكل. */
  logLevel: LogLevel;
  /**
   * رابط الاتصال بقاعدة بيانات PostgreSQL (خطة التطوير/التشغيل).
   * '' يعني غير مهيأ — لا فتح اتصال ولا فشل تشغيل حتى Phase 10 يستخدمها.
   */
  databaseUrl: string;
  /** رابط قاعدة الاختبار المعزولة — للاختبارات فقط، اختياري. */
  testDatabaseUrl: string;
  /**
   * مفتاح تشفير الرموز السرية (§11.8) بترميز base64 — فارغ يعني غير مهيأ.
   * يبقى خارج قاعدة البيانات عمداً: يُقرأ من بيئة العملية فقط.
   */
  authSecretKey: string;
  /**
   * الجذر الذي تُحفظ فيه ملفات المرفقات فعلياً (Phase 14 — §30).
   *Metadata فقط داخل PostgreSQL؛ البايتات على القرص تحت هذا الجذر.
   * فارغ يعني «غير مهيأ»: أي كتابة مرفق تُرفض بدل أن تُكتب في مسار
   * افتراضي غير مقصود. لا يُطبع في السجل التقني (مسار يفضّل كشفه).
   */
  attachmentStorageDir: string;
  /**
   * الحد الأقصى لحجم ملف المرفق الواحد بالبايت (Phase 14 — §30 size limits).
   * قيمة موجبة دائماً؛ الافتراضي 25 MiB. تجاوزه يُرفض عند الحفظ.
   */
  attachmentMaxFileSizeBytes: number;
}

/** البيئة الافتراضية عند غياب NODE_ENV. */
const DEFAULT_NODE_ENV: NodeEnvironment = 'development';

/** المنفذ الافتراضي للـBackend (مختلف عن منفذ واجهة Vite وهو 3000). */
const DEFAULT_PORT = 4000;

const VALID_NODE_ENVS: readonly NodeEnvironment[] = ['development', 'production', 'test'];

/** أدنى مستوى سجل يُكتب افتراضيًا. */
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const VALID_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** يتحقق من LOG_LEVEL ويعيد قيمة مدعومة، ويرفض أي قيمة غير معروفة. */
function parseLogLevel(rawValue: string | undefined): LogLevel {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_LOG_LEVEL;
  }
  const value = rawValue.trim().toLowerCase();
  if ((VALID_LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  throw new Error(`LOG_LEVEL غير صالح: "${value}". القيم المسموحة: ${VALID_LOG_LEVELS.join(', ')}.`);
}

/** يتحقق من NODE_ENV ويعيد قيمة مدعومة، ويرفض أي قيمة غير معروفة. */
function parseNodeEnv(rawValue: string | undefined): NodeEnvironment {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_NODE_ENV;
  }
  const value = rawValue.trim();
  if ((VALID_NODE_ENVS as readonly string[]).includes(value)) {
    return value as NodeEnvironment;
  }
  throw new Error(
    `NODE_ENV غير صالح: "${value}". القيم المسموحة: ${VALID_NODE_ENVS.join(', ')}.`,
  );
}

/** يتحقق من PORT ويعيد منفذًا صحيحًا ضمن النطاق المسموح. */
function parsePort(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_PORT;
  }
  const value = rawValue.trim();
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT غير صالح: "${value}". يجب أن يكون عددًا صحيحًا بين 1 و65535.`);
  }
  return port;
}

/** البروتوكولات المدعومة لربط PostgreSQL. */
const VALID_POSTGRES_PROTOCOLS = ['postgres://', 'postgresql://'];

/**
 * يتحقق من رابط قاعدة البيانات: فارغ (غير مهيأ) أو بادئة ببروتوكول postgres.
 * لا يُفك تفكيك الرابط ولا يطبع قيمته عند الفشل — القيمة حساسة.
 */
function parseDatabaseUrl(rawValue: string | undefined, variableName: string): string {
  if (rawValue === undefined) {
    return '';
  }
  const value = rawValue.trim();
  if (value === '') {
    return '';
  }
  const lowercased = value.toLowerCase();
  if (!VALID_POSTGRES_PROTOCOLS.some((protocol) => lowercased.startsWith(protocol))) {
    throw new Error(
      `${variableName} غير صالح: يجب أن يبدأ بـ postgres:// أو postgresql:// (لن تُطبع القيمة).`,
    );
  }
  return value;
}

/**
 * يتحقق من مفتاح تشفير الرموز السرية: فارغ (غير مهيأ) أو base64.
 * لا يُفكّ ترميزه ولا تُطبع قيمته أبداً — القيمة سرّ (§11.8).
 */
function parseAuthSecretKey(rawValue: string | undefined): string {
  if (rawValue === undefined) {
    return '';
  }
  const value = rawValue.trim();
  if (value === '') {
    return '';
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('AUTH_SECRET_KEY غير صالح: يجب أن يكون نصاً بترميز base64 (لن تُطبع القيمة).');
  }
  return value;
}

/**
 * بناء كائن الإعدادات من متغيرات البيئة.
 * مُصدَّرة منفصلة لتمكين اختبارها بقيم بيئة صريحة دون تعديل العملية.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  return {
    nodeEnv,
    port: parsePort(env.PORT),
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    logLevel: parseLogLevel(env.LOG_LEVEL),
    databaseUrl: parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL'),
    testDatabaseUrl: parseDatabaseUrl(env.TEST_DATABASE_URL, 'TEST_DATABASE_URL'),
    authSecretKey: parseAuthSecretKey(env.AUTH_SECRET_KEY),
    attachmentStorageDir: parseAttachmentStorageDir(env.ATTACHMENT_STORAGE_DIR),
    attachmentMaxFileSizeBytes: parseAttachmentMaxFileSize(env.ATTACHMENT_MAX_FILE_SIZE_BYTES),
  };
}

/** الإعدادات الفعلية للعملية — تُحسب مرة واحدة عند الاستيراد. */
export const config: ServerConfig = loadConfig();
