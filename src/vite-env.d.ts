/// <reference types="vite/client" />

/**
 * تعريفات أنواع Vite للتطبيق (Phase 10).
 *
 * `tsconfig.json` لا يفعّل `types` ولا يشير إلى `vite/client`، فلا
 * يعرف TypeScript خاصية `import.meta.env`. هذا الملف يسدّ النقص دون
 * توسيع إعدادات المشروع أو إضافة حزم.
 *
 * المتغيّرات المسموح تصريفها تبدأ بـ`VITE_` (قاعدة Vite) — وكل ما
 * عداه يبقى في الخادم ولا يصل إلى الحزمة.
 */
interface ImportMetaEnv {
  /** جذر مسارات الـAPI (‎/api افتراضياً، أو عنوان كامل للتطوير). */
  readonly VITE_API_BASE_URL?: string;
  /** نمط البيانات: api (الافتراضي) | local (fallback للتطوير والاختبار). */
  readonly VITE_DATA_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
