/**
 * أساسيات التشفير المستخدمة في المصادقة (Phase 11).
 *
 * مسؤولياته — بلا أي منطق أعمال ولا قراءة قاعدة:
 * - توليد الرمز السري (secret) ورقم OTP ورفعة الجلسة: عشوائية
 *   تشفيرية من `node:crypto` (لا `Math.random`).
 * - التجزئة `SHA-256` للأرقام السرية ورفعات الجلسات: لا تُخزَّن
 *   نصاً صريحاً في القاعدة.
 * - المقارنة بزمن ثابت: لا تكشف طول الرمز الصحيح عبر زمن التنفيذ.
 *
 * تشفير الرموز السرية نفسها (القابل للفك) موجود في `secretVault.ts`
 * لأنه معزول أمنياً في وحدة منفصلة (§11.8: «يجب عزل هذا الاستثناء
 * في وحدة أمنية واضحة وعدم تعميمه على بيانات أخرى»).
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from './authTypes';

/**
 * أبجدية الرمز السري: حروف لاتينية كبيرة وأرقام، بلا أحرف متشابهة
 * (0/O, 1/I/L) حتى لا يقع المستخدم في خطأ قراءة/كتابة عند النسخ.
 *
 * قرار تقني: §11 لا تحدد شكل الرمز ولا طوله، فالحصر هنا قرار تقني
 * لتداول يدوي سليم، لا قاعدة أعمال.
 */
const SECRET_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** طول الرمز السري المولَّد افتراضيًا. */
const GENERATED_SECRET_LENGTH = 12;

/** بايتات رفعة الجلسة: 32 بايت = 256 بت قوة. */
const SESSION_TOKEN_BYTES = 32;

/**
 * يولّد رقم OTP من 6 أرقام (صفر مسموح في الخانات).
 * تُملأ الخانات الناقصة بصفر على اليسار، و`randomInt` موزّع بانتظام.
 */
export function generateOtpCode(): string {
  const upperBound = 10 ** OTP_LENGTH;
  return String(randomInt(0, upperBound)).padStart(OTP_LENGTH, '0');
}

/** يولّد رمزاً سرياً عشوائياً من الأبجدية المعتمدة. */
export function generateSecret(length: number = GENERATED_SECRET_LENGTH): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += SECRET_ALPHABET[randomInt(0, SECRET_ALPHABET.length)];
  }
  return out;
}

/**
 * يولّد رفعة جلسة عشوائية (base64url) تُرسل للعميل مرة واحدة.
 * القاعدة لا تُخزَّن — تُخزَّن تجزئتها فقط.
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/** تجزئة `SHA-256` بصيغة hex — لتخزين رموز الجلسات وأرقام OTP. */
export function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * مقارنة بزمن ثابت بين قيمتين نصيتين.
 * تعيد false مباشرة إن اختلف الطول — `timingSafeEqual` يرمي استثناءً
 * عند اختلاف الأطوال، واختلاف الطول هنا معلومة عامة لا سرية.
 */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}