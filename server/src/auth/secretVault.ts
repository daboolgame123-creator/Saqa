/**
 * خزنة الرموز السرية — الوحدة الأمنية المعزولة (§11.8).
 *
 * هذه الاستثناء الوظيفي معتمد في الخطة: «مسؤولو السقاية يستطيعون رؤية
 * الرمز السري الحالي للمنتسب». ولهذا يُخزَّن الرمز **مشفّراً قابلاً
 * للفك** (AES-256-GCM) لا مجزّأً one-way، مع Commitments التالية:
 *
 * 1. المفتاح **لا يُخزَّن في قاعدة البيانات**: يُقرأ من متغير بيئة
 *    منفصل `AUTH_SECRET_KEY`. لا يوجد جدول أو عمود للمفتاح.
 * 2. كل القيمة مشفّرة: `secret_ciphertext` لا يحمل النص الصريح أبداً،
 *    ولا في السجل التقني ولا في الاستجابات إلا عبر مسار الكشف المسجَّل.
 * 3. فشل المفتاح **لا يُتجاوز**: `decryptSecret` يرمي استثناءً، ولا
 *    يوجد أي مسار احتياطي يقارن نصاً صريحاً — المسار الوحيد عند الفشل
 *    هو إعادة الضبط الإداري (§11.8: «أي تسريب أو فشل في المفتاح يؤدي
 *    إلى استخدام إعادة الضبط، لا إلى تجاوز التشفير»).
 *
 * لا يُستخدم هذا النوع على أي بيانات أخرى — الوحدة لا ت export أي
 * دالة عامة تُعمَّم (الواجهة `encryptSecret`/`decryptSecret` وحدها).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config';
import { TechnicalLogger } from '../logging';

/** معرّف إصدار المفتاح — يُخزَّن مع كل قيمة مشفّرة لfuture تدوير المفتاح. */
export const SECRET_KEY_ID = 'v1';

/** خوارزمية التشفير: مصادَق مع النص (AEAD) — يكتشف أي العبث. */
const CIPHER_ALGORITHM = 'aes-256-gcm';

/** بايتات المفتاح المطلوبة لـAES-256. */
const KEY_LENGTH_BYTES = 32;

/** بايتات متجه التهيئة — قياسية لـGCM. */
const IV_LENGTH_BYTES = 12;

/** ناتج تشفير واحد: النص المشفّر + متجه التهيئة + وسم المصادقة. */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

/** يقرأ مفتاح التشفير من البيئة ويتحقق من طوله. */
function decodeConfiguredKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `AUTH_SECRET_KEY غير صالح: يُتوقع ${KEY_LENGTH_BYTES} بايت (base64 بطول ${KEY_LENGTH_BYTES * 2}). ` +
        'لن تُطبع القيمة.',
    );
  }
  return key;
}

/**
 * يحلّ المفتاح الفعّال مرة واحدة.
 *
 * - إن ضُبط `AUTH_SECRET_KEY`: يُستخدم كما هو (الوضع المطلوب في
 *   التشغيل، بما فيه الإنتاج).
 * - إن لم يُضبط خارج الإنتاج: يُولَّد مفتاح عابر لل العملية ويُسجَّل
 *   تحذير. هذا يجعل التطوير والاختبار يعملان بلا إعداد، مع وعي صريح
 *   بأن الأسرار المشفّرة لن تبقى قابلة للفك بعد إعادة تشغيل الخادم
 *   (وعندها التسديد هو إعادة الضبط الإداري).
 * - في الإنتاج: الفحص يُوقف الإقلاع — لا يُشغَّل خادم لا يستطيع فك
 *   الأسرار، لأن ذلك يجعل مسار الدخول متعطلاً بلا أثر واضح.
 */
let resolvedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (resolvedKey !== null) {
    return resolvedKey;
  }
  if (config.authSecretKey !== '') {
    resolvedKey = decodeConfiguredKey(config.authSecretKey);
    return resolvedKey;
  }
  if (config.isProduction) {
    throw new Error(
      'AUTH_SECRET_KEY غير مهيأ — لا يمكن تشفير الرموز السرية (§11.8). عيّنه في بيئة العملية.',
    );
  }
  resolvedKey = randomBytes(KEY_LENGTH_BYTES);
  TechnicalLogger.warn('auth secret key is not configured — using an ephemeral per-process key', {
    source: 'auth',
    data: {
      reason: 'AUTH_SECRET_KEY غير مضبوط خارج بيئة الإنتاج',
      consequence: 'الرموز المشفّرة لن تبقى قابلة للفك بعد إعادة التشغيل؛ التسديد هو إعادة الضبط الإداري',
    },
  });
  return resolvedKey;
}

/** إعادة ضبط المفتاح المحلول — للاختبارات فقط. */
export function resetSecretKeyForTesting(): void {
  resolvedKey = null;
}

/** يشفّر رمزاً سرياً بنص صريح إلى حزمة قابلة للفك. */
export function encryptSecret(plain: string): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(CIPHER_ALGORITHM, resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyId: SECRET_KEY_ID,
  };
}

/**
 * يفكّ رمزاً سرياً مشفّراً.
 *
 * يرمي استثناءً عند أي فشل (مفتاح خاطئ، عبث بالنص، قيمة ناقصة) — لا
 * يعيد ولا فارغاً ولا قيمة افتراضية، حتى لا يتحول الفشل إلى تجاوز.
 */
export function decryptSecret(encrypted: {
  ciphertext: string | null;
  iv: string | null;
  authTag: string | null;
}): string {
  if (encrypted.ciphertext === null || encrypted.iv === null || encrypted.authTag === null) {
    throw new Error('القيمة المشفّرة ناقصة — لا يمكن فكها (استُخدمت إعادة الضبط الإداري).');
  }
  const decipher = createDecipheriv(CIPHER_ALGORITHM, resolveKey(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}