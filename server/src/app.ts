import express, { type Application } from 'express';
import { config } from './config';
import { createErrorHandler, notFoundHandler, requestIdMiddleware, requestLogger } from './middleware';
import { createRoutes } from './routes';

/**
 * إنشاء تطبيق Express وربط الطبقات (middleware + routes).
 *
 * هذه الدالة تنشئ التطبيق فقط ولا تفتح أي منفذ؛
 * تشغيل HTTP server مسؤولية server.ts.
 * ولا يوضع فيها أي منطق أعمال.
 */
export function createApp(): Application {
  const app = express();

  // إخفاء اسم التقنية من ترويسات الاستجابة.
  app.disable('x-powered-by');

  // معرّف الطلب أولًا ليكون متاحًا للسجلات وللأخطاء ولترويسة الاستجابة.
  app.use(requestIdMiddleware);

  // سجل تقني منظم لكل طلب مكتمل (technical — وليس Audit).
  app.use(requestLogger);

  // أساس موحّد لقراءة أجسام الطلبات بصيغة JSON لبقية مسارات الـAPI.
  app.use(express.json());

  // مسارات الـBackend.
  app.use(createRoutes());

  // 404 ثم معالج الأخطاء المركزي — يجب أن يبقيا آخر ما يُسجَّل بالترتيب نفسه.
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeDetails: !config.isProduction }));

  return app;
}
