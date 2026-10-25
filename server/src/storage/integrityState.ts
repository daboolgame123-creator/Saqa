/**
 * حالة سلامة المرفق (Phase 14 — §30 metadata · integrity state).
 *
 * القيم الأربع مشتقّة من متطلبات §30 وحدها ولا قيمة خارجها، وهي مقيَّدة
 * بـCHECK في الترحيل `0007_attachment_storage.sql`:
 *   - `unknown`   → لم تُفحص بعد، أو لا توجد بصمة صالحة للمقارنة.
 *                  يُخزَّن `NULL` في `integrity_state` (ليست قيمة مخترعة).
 *   - `verified`  → قُرئ الملف بعد حفظه وتطابقت بصمته مع المحفوظة.
 *   - `corrupted` → الملف على القرص موجود لكن بصمته لا تطابق المحفوظة.
 *   - `missing`   → السجل في القاعدة موجود والملف غير موجود على القرص.
 *
 * `ocr_state` **لا** يُعرَّف هنا: §30 تذكر وجود حقل OCR status فقط، والقيم
 * منصوص عليها في Phase 17، فلم تُخترع هنا (قاعدة Phase 9 السارية).
 */

/** الحالات المخزَّنة في `integrity_state`. */
export type IntegrityState = 'verified' | 'corrupted' | 'missing' | 'unknown';

/** الحالات التي تُخزَّن فعلاً في العمود (عدا `unknown` = NULL). */
export const STORED_INTEGRITY_STATES: readonly Exclude<IntegrityState, 'unknown'>[] = [
  'verified',
  'corrupted',
  'missing',
];

/** هل القيمة حالة سلامة معروفة يمكن تخزينها؟ */
export function isStoredIntegrityState(value: string): value is Exclude<IntegrityState, 'unknown'> {
  return (STORED_INTEGRITY_STATES as readonly string[]).includes(value);
}
