import { config } from '../config';
import {
  LOG_LEVEL_PRIORITY,
  SENSITIVE_KEYS,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type LogSink,
} from './logTypes';

/** القيمة التي تُستبدل بها أي قيمة حساسة عند التسجيل. */
export const REDACTED_VALUE = '[redacted]';

/**
 * تنقية الحقول الحساسة قبل الكتابة (كلمات المرور، OTP، الرموز، الأسرار).
 * تُطبَّق تعريفيًا على الكائنات المتداخلة.
 */
export function redactFields(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      safe[key] = REDACTED_VALUE;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = redactFields(value as LogFields);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/** صياغة السجل إلى سطر JSON واحد (صيغة منظمة قابلة للتحليل آليًا). */
export function formatLogRecord(record: LogRecord): string {
  return JSON.stringify(record);
}

/** جهة الكتابة الافتراضية: stdout للمستويات العادية و stderr للتحذيرات والأخطاء. */
const defaultSink: LogSink = {
  write: (record) => {
    const line = `${formatLogRecord(record)}\n`;
    if (record.level === 'warn' || record.level === 'error') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  },
};

/** خيارات ضبط السجل التقني. */
export interface LoggerOptions {
  level?: LogLevel;
  environment?: string;
  sink?: LogSink;
}

/** سياق اختياري يُرفق بالسجل. */
export interface LogContext {
  requestId?: string;
  source?: string;
  data?: LogFields;
}

/**
 * السجل التقني المركزي للـBackend.
 * قابل للاستخدام من: معالجة الطلبات، الأخطاء، الوظائف المجدولة، ودورة حياة الخادم.
 * لا يسجّل أسرارًا: كل بيانات السياق تمرّ على redactFields.
 */
export class TechnicalLogger {
  private static level: LogLevel = config.logLevel;
  private static environment: string = config.nodeEnv;
  private static sink: LogSink = defaultSink;

  /** ضبط المستوى/البيئة/جهة الكتابة. */
  static configure(options: LoggerOptions): void {
    if (options.level !== undefined) {
      TechnicalLogger.level = options.level;
    }
    if (options.environment !== undefined) {
      TechnicalLogger.environment = options.environment;
    }
    if (options.sink !== undefined) {
      TechnicalLogger.sink = options.sink;
    }
  }

  /** إعادة الإعدادات إلى قيمها الافتراضية — للاختبارات. */
  static reset(): void {
    TechnicalLogger.level = config.logLevel;
    TechnicalLogger.environment = config.nodeEnv;
    TechnicalLogger.sink = defaultSink;
  }

  /** هل المستوى المطلوب يُكتب وفق الإعداد الحالي؟ */
  static isEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[TechnicalLogger.level];
  }

  /** الكتابة الأساسية — تُبنى منها دوال المستويات. */
  static log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (!TechnicalLogger.isEnabled(level)) {
      return;
    }

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: TechnicalLogger.environment,
    };
    if (context.requestId !== undefined) {
      record.requestId = context.requestId;
    }
    if (context.source !== undefined) {
      record.source = context.source;
    }
    if (context.data !== undefined) {
      record.data = redactFields(context.data);
    }

    TechnicalLogger.sink.write(record);
  }

  static debug(message: string, context?: LogContext): void {
    TechnicalLogger.log('debug', message, context);
  }

  static info(message: string, context?: LogContext): void {
    TechnicalLogger.log('info', message, context);
  }

  static warn(message: string, context?: LogContext): void {
    TechnicalLogger.log('warn', message, context);
  }

  static error(message: string, context?: LogContext): void {
    TechnicalLogger.log('error', message, context);
  }
}
