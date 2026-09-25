/**
 * اختبارات معالجة الأخطاء المركزية ونطاق Phase 8 — Phase 8.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app';
import { AppError, NotFoundError } from '../src/errors';
import { createErrorHandler, notFoundHandler, requestIdMiddleware } from '../src/middleware';
import { LifecycleState } from '../src/utils';
import { jsonOf, listenApp, silenceLogs, type RunningApp } from './helpers';

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    stack?: string;
    requestId?: string;
  };
}

describe('معالجة الأخطاء المركزية', () => {
  silenceLogs();

  let productionMode: RunningApp;
  let developmentMode: RunningApp;

  before(async () => {
    // بيئة إنتاج: بلا تفاصيل داخلية
    const productionApp = express();
    productionApp.use(requestIdMiddleware);
    productionApp.get('/boom', () => {
      throw new Error('unexpected failure');
    });
    productionApp.get('/known', () => {
      throw new AppError('طلب غير صالح', 400, 'BAD_REQUEST');
    });
    productionApp.get('/missing-thing', () => {
      throw new NotFoundError('مورد غير موجود');
    });
    productionApp.use(notFoundHandler);
    productionApp.use(createErrorHandler({ exposeDetails: false }));
    productionMode = await listenApp(productionApp);

    // بيئة تطوير: مع تفاصيل التشخيص
    const developmentApp = express();
    developmentApp.use(requestIdMiddleware);
    developmentApp.use(notFoundHandler);
    developmentApp.use(createErrorHandler({ exposeDetails: true }));
    developmentMode = await listenApp(developmentApp);
  });

  after(async () => {
    await productionMode.shutdown();
    await developmentMode.shutdown();
  });

  test('خطأ داخلي -> 500 منظم بلا تسريب تفاصيل', async () => {
    const response = await fetch(`${productionMode.baseUrl}/boom`);
    const body = await jsonOf<ErrorBody>(response);

    assert.equal(response.status, 500);
    assert.equal(body.error?.code, 'INTERNAL_ERROR');
    assert.equal(body.error?.message, 'حدث خطأ داخلي غير متوقع في الخادم.');
    assert.equal(body.error?.stack, undefined);
    assert.equal(body.error?.details, undefined);
  });

  test('AppError يحافظ على رمز الحالة ورمزه الخاص', async () => {
    const response = await fetch(`${productionMode.baseUrl}/known`);
    const body = await jsonOf<ErrorBody>(response);

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, 'BAD_REQUEST');
    assert.equal(body.error?.message, 'طلب غير صالح');
    assert.equal(body.error?.stack, undefined);
  });

  test('NotFoundError مرفوع من معالج -> 404 منظم', async () => {
    const response = await fetch(`${productionMode.baseUrl}/missing-thing`);
    const body = await jsonOf<ErrorBody>(response);

    assert.equal(response.status, 404);
    assert.equal(body.error?.code, 'NOT_FOUND');
  });

  test('بيئة التطوير تُظهر stack للتشخيص', async () => {
    const response = await fetch(`${developmentMode.baseUrl}/nope`);
    const body = await jsonOf<ErrorBody>(response);

    assert.equal(response.status, 404);
    assert.equal(body.error?.code, 'NOT_FOUND');
    assert.equal(typeof body.error?.stack, 'string');
  });

  test('كل استجابة خطأ تحتوي معرّف الطلب', async () => {
    const response = await fetch(`${productionMode.baseUrl}/boom`);
    const body = await jsonOf<ErrorBody>(response);

    assert.ok(typeof body.error?.requestId === 'string');
    assert.equal(body.error?.requestId, response.headers.get('x-request-id'));
  });
});

describe('نطاق Phase 8 — لا مسارات لمراحل لاحقة', () => {
  silenceLogs();
  let app: RunningApp;

  before(async () => {
    LifecycleState.markReady();
    app = await listenApp(createApp());
  });

  after(async () => {
    await app.shutdown();
    LifecycleState.reset();
  });

  test('مسارات الموظفين والكتب والطلبات والمصادقة غير موجودة', async () => {
    const futurePhasePaths = [
      '/api/employees',
      '/api/transactions',
      '/api/requests',
      '/api/notifications',
      '/api/reminders',
      '/api/audit-logs',
      '/api/reports',
      '/api/search',
      '/api/attachments',
      '/api/auth/login',
      '/api/auth/otp',
      '/authorization/permissions',
      '/storage/files',
    ];

    for (const path of futurePhasePaths) {
      const response = await fetch(`${app.baseUrl}${path}`);
      assert.equal(response.status, 404, `${path} يجب ألا يكون متاحًا في Phase 8`);
    }
  });
});
