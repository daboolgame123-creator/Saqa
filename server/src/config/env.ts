/**
 * الإعدادات المركزية للـBackend (Phase 8).
 *
 * المصدر الوحيد للإعدادات هو متغيرات بيئة العملية (process.env)،
 * ويُحمَّل هذا الملف مرة واحدة عند أول استيراد.
 *
 * لا يحتوي هذا الملف — وفق نطاق Phase 8 — أي إعداد لقاعدة بيانات،
 * أو مصادقة/JWT، أو تخزين ملفات إنتاجي؛ تلك إعدادات مراحل لاحقة.
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
  };
}

/** الإعدادات الفعلية للعملية — تُحسب مرة واحدة عند الاستيراد. */
export const config: ServerConfig = loadConfig();
