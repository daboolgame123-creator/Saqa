/**
 * سلامة ملف المرفق: البصمة والحالة (Phase 14 — §30 metadata · hash/integrity).
 *
 * البصمة هنا **SHA-256** بمعرّف خوارزمي داخل النص (`sha256:<hex>`) لا مجرّد
 * hex. السبب أن `content_hash` عمود نص حر بلا قيد CHECK، فقد توجد قيمة بلا
 * بادئة كُتبت سابقاً أو جاءت من خارج النظام بلا طريقة لمعرفة أي خوارزمية
 * أنتجتها. البادئة تجعل التحقق منطقياً: قيمة بلا بادئة تعني «لا يمكن
 * التحقق منها» فتُعامل كغير متحقَّق منها، لا كـ«مطابقة».
 *
 * القاعدة الحاكمة من §30: البصمة **ليست** معرّفاً. الـstable ID هو
 * `attachments.id`؛ والبصمة تكشف التلف فقط. لذلك لا يوجد أي مسار في هذا
 * الملف يعتمد على البصمة للوصول إلى ملف.
 */
import { createHash } from 'node:crypto';
import type { IntegrityState } from './integrityState';

/** بادئة معرّف خوارزمية البصمة. */
const HASH_ALGORITHM_PREFIX = 'sha256:';

/**
 * يحسب بصمة SHA-256 للمحتوى ويعيدها بالمعرّف الخوارزمي.
 *
 * @param content بايتات الملف.
 * @returns بصمة بصيغة `sha256:<64 محرفاً hex>`.
 */
export function computeContentHash(content: Buffer): string {
  return `${HASH_ALGORITHM_PREFIX}${createHash('sha256').update(content).digest('hex')}`;
}

/**
 * هل القيمة بصمة صالحة من خوارزمية معروفة؟
 *
 * `false` للقيمة الفارغة أو `null` أو النص بلا بادئة أو البادئة مع hex غير
 * صحيح — أي قيمة لا يمكن التحقق منها، فلا تُعامل كصالحة افتراضاً.
 */
export function isVerifiableHash(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !value.startsWith(HASH_ALGORITHM_PREFIX)) {
    return false;
  }
  const hex = value.slice(HASH_ALGORITHM_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(hex);
}

/** مقارنة ثابتة الزمن لمخاددين متساويي الطول. */
function timingSafeCompare(a: Buffer, b: Buffer): boolean {
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

/**
 * يقارن البصمة المحفوظة ببصمة المحتوى المقروء من القرص.
 *
 * المقارنة ثابتة الزمن (لا تعتمد على طول التطابق المتوقف عند أول اختلاف).
 * تكفي هنا — المحتوى ملك الطرف المخوَّل أصلاً — لكنها تكفي أيضاً كي لا
 * يُبنى يدوياً نمط مختلف في كل استدعاء لاحق.
 *
 * @param storedHash البصمة المحفوظة في القاعدة (قد تكون `null`).
 * @param content البايتات المقروءة من التخزين المركزي.
 * @returns `true` فقط إذا كانت البصمة المحفوظة قابلة للتحقق ومطابقة.
 */
export function verifyContentHash(storedHash: string | null, content: Buffer): boolean {
  if (!isVerifiableHash(storedHash)) {
    return false;
  }
  const actual = Buffer.from(computeContentHash(content).slice(HASH_ALGORITHM_PREFIX.length), 'utf8');
  const expected = Buffer.from(storedHash.slice(HASH_ALGORITHM_PREFIX.length), 'utf8');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeCompare(actual, expected);
}

/**
 * يقرّر حالة سلامة المرفق من نتيجة الفحص (§30 · integrity state).
 *
 * @param expectedHash البصمة المحفوظة في القاعدة.
 * @param actualContent المحتوى المقروء، أو `null` إن لم يُقرأ (الملف مفقود
 *   أو تالف تعذّرت قراءته).
 * @returns الحالة التي تُخزَّن في `integrity_state`.
 */
export function resolveIntegrityState(
  expectedHash: string | null,
  actualContent: Buffer | null,
): IntegrityState {
  if (actualContent === null) {
    return 'missing';
  }
  if (!isVerifiableHash(expectedHash)) {
    // لا توجد بصمة صالحة للمقارنة، فلا تُكتب 'verified': تلك تعني
    // «قُوبلت بالمحتوى» وهو ما لم يحدث. تبقى 'unknown' (العمود NULL).
    return 'unknown';
  }
  return verifyContentHash(expectedHash, actualContent) ? 'verified' : 'corrupted';
}
