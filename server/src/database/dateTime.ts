/**
 * استراتيجية التواريخ والأوقات الموحدة (Phase 9 — ALSQAYA_PLAN §25).
 *
 * القاعدة: التاريخ ≠ التوقيت ≠ وقت الإنشاء/الاستيراد — لا يُخلط بينها.
 *
 * | المعنى               | النوع في PostgreSQL      | يُقرأ كـ          |
 * |----------------------|--------------------------|--------------------|
 * | تاريخ مستند (كتاب)  | date                     | نص YYYY-MM-DD      |
 * | وقت جداري (زمنية)   | time                     | نص HH:mm (بعد التطبيع) |
 * | توقيت تشغيلي/نظام   | timestamptz (UTC)        | نص ISO 8601 Z      |
 * | المدد                | integer (دقائق)          | عدد                |
 *
 * الفروق الجوهرية الموثقة في الخطة:
 * - document_date: تاريخ الكتاب الفعلي (لا علاقة له بزمن تسجيل السجل).
 * - created_at: وقت تسجيل السجل في قاعدة البيانات (تشغيل).
 * - imported_at: تاريخ استيراد الكتاب من الأرشيف (إن وُجد).
 * - updated_at: آخر تعديل للسجل (تشغيل).
 *
 * التوقيتات التشغيلية تُخزن وتُعاد بتوقيت UTC دائماً (ISO 8601 بـZ)،
 * وتُحسب التواريخ اليومية بحسب ساعة النظام المحلية للمنشأة.
 */

/** تاريخ بترميز YYYY-MM-DD. */
export type DateOnly = string;

/** وقت جداري بنظام 24 ساعة HH:mm. */
export type TimeOfDay = string;

/** طابع زمني بصيغة ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ). */
export type IsoTimestamp = string;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY_PATTERN = /^(\d{2}):(\d{2})$/;

/** صيغة تاريخ صحيحة فعلاً (لا 2026-13-45). */
export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** صيغة وقت صحيحة بنظام 24 ساعة. */
export function isValidTimeOfDay(value: string): boolean {
  const match = TIME_OF_DAY_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59;
}

/**
 * اشتقاق شهر الكتاب (YYYY-MM-DD ⇒ YYYY-MM) — الحقل المشتق للتصفية الشهرية.
 * يفترض تاريخاً صالحاً؛ يرمي خطأً إن لم يكن كذلك (لا اشتقاق من قيمة فاسدة).
 */
export function deriveMonth(documentDate: DateOnly): string {
  if (!isValidDateOnly(documentDate)) {
    throw new Error(`تاريخ مستند غير صالح لا يمكن اشتقاق شهر منه: "${documentDate}".`);
  }
  return documentDate.slice(0, 7);
}

/** تاريخ اليوم المحلي للمنشأة (YYYY-MM-DD) — للاشتقاقات لا للتخزين. */
export function localDateOnly(now: Date = new Date()): DateOnly {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** تحويل Date إلى طابع ISO 8601 UTC. */
export function toIsoTimestamp(date: Date): IsoTimestamp {
  return date.toISOString();
}

/**
 * تطبيع قيمة time من قاعدة البيانات (HH:MM:SS) إلى HH:mm حسب النموذج.
 * النماذج تكتب وتقرأ HH:mm فقط.
 */
export function normalizeTimeOfDay(dbValue: string): TimeOfDay {
  return dbValue.length >= 5 ? dbValue.slice(0, 5) : dbValue;
}
