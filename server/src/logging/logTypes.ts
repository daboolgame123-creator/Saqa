/**
 * أنواع السجل التقني المهيكل (Structured Technical Logging) — Phase 8.
 *
 * السجل التقني منفصل تمامًا عن Audit Log الخاص بقواعد الأعمال
 * (الخطة §57 بند 8: Structured logs منفصلة عن Audit Logs)،
 * ولا يُكتب هنا أي حدث أعمال من إنشاء/تعديل/حذف سجلات.
 */

/** مستوى السجل التقني — من الأقل أهمية إلى الأعلى. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** حقول سياق إضافية تُسجَّل مع الرسالة (تُنقّى من القيم الحساسة قبل الكتابة). */
export type LogFields = Record<string, unknown>;

/** سجل تقني واحد بصيغة منظمة. */
export interface LogRecord {
  /** وقت الحدث بصيغة ISO 8601. */
  timestamp: string;
  level: LogLevel;
  message: string;
  /** بيئة التشغيل: development | production | test. */
  environment: string;
  /** معرّف الطلب — يُضاف عند ارتباط السجل بطلب HTTP. */
  requestId?: string;
  /** مصدر السجل داخل الـBackend (مثال: http، jobs، server). */
  source?: string;
  /** بيانات إضافية منظَّمة بعد تنقية القيم الحساسة. */
  data?: LogFields;
}

/** جهة الكتابة الفعلية للسجل — تُستبدل في الاختبارات. */
export interface LogSink {
  write(record: LogRecord): void;
}

/** ترتيب الخطورة — يُستخدم لتصفية المستويات. */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * مفاتيح تُمنع قيمها من الظهور في السجلات التقنية
 * (كلمات المرور، OTP، الرموز، الأسرار، ترويسات المصادقة، الجلسات).
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'otp',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'session',
  'sessionid',
];
