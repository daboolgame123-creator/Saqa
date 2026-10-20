/**
 * مسار البحث الموحد (Phase 22).
 *
 * الطبقات الإلزامية:
 *   1) validateApiRequest — يتحقق من q/type/limit/offset.
 *   2) controller — يقرأ validatedQuery وينادي الخدمة.
 *   3) معالج الأخطاء المركزي — يترجم الأخطاء إلى استجابة HTTP.
 *
 * الهوية (`requireSession`)، فرض الصلاحية (`requireResourcePermission` ← view)،
 * ونطاق الوصول (`attachAccessScope`) تُركّب كلها عالمياً في routes/index.ts
 * قبل هذا الراوتر، فتبقى هذه الطبقة نقلاً محايداً.
 */
import { Router } from 'express';
import { validateApiRequest } from '../validation/validateApiRequest';
import { searchQuery } from '../validation';
import { searchController } from '../controllers';

export function createSearchRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: searchQuery } }),
    searchController,
  );
  return router;
}