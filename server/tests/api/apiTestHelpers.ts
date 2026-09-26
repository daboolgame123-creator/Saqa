/**
 * أدوات مشتركة لاختبارات الـAPI (Phase 10) — ليست اختباراً بذاتها.
 *
 * الاختبارات تشغّل تطبيق Express حقيقياً على منفذ عشوائي وتخاطبه عبر
 * fetch، فالمسار المُختبَر هو المسار الفعلي بالكامل:
 *   middleware → validation → controller → service → repository → PostgreSQL
 * لا mock في أي طبقة، ولا شبكة خارجية (منفذ عشوائي على 127.0.0.1).
 *
 * الخدمات تُبنى على Pool قاعدة الاختبار وتُحقَن عبر `useApiServices`
 * (انظر `src/api/serviceContext.ts`)، فتعمل الاختبارات بلا `DATABASE_URL`
 * ولا تفتح قاعدة التطوير إطلاقاً.
 */
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { createApiRouter } from '../../src/api/routes';
import { createApiServicesOnPool, type ApiServices } from '../../src/api/services';
import { useApiServices } from '../../src/api/serviceContext';
import {
  createErrorHandler,
  notFoundHandler,
  requestIdMiddleware,
  requestLogger,
} from '../../src/middleware';
import { listenApp, silenceLogs, type RunningApp } from '../helpers';

/** جسم خطأ الـAPI كما يعيده معالج الأخطاء المركزي (Phase 8). */
export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: { field: string; message: string }[];
    requestId?: string;
  };
}

/** استجابة JSON مع رمز الحالة، لاختبارات التحقق. */
export interface JsonResponse<T = unknown> {
  status: number;
  body: T;
}

/** سياق الاختبار: تطبيق يعمل + عنوانه + الخدمات المبنية عليه. */
export interface ApiTestContext {
  running: RunningApp;
  services: ApiServices;
  baseUrl: string;
}

/**
 * يبني تطبيق الاختبار بنفس تركيب `createApp` (Phase 8):
 * requestId → requestLogger → json → routes → 404 → errorHandler.
 * الفرق الوحيد: `useApiServices` قبل الراوترات لحقن Pool الاختبار.
 */
export function buildApiTestApp(pool: Pool): { app: Express; services: ApiServices } {
  const services = createApiServicesOnPool(pool);
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(express.json());
  app.use(useApiServices(services));
  app.use('/api', createApiRouter());
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeDetails: true }));

  return { app, services };
}

/** يشغّل التطبيق على منفذ عشوائي ويعيد سياق الاختبار. */
export async function startApiTestContext(pool: Pool): Promise<ApiTestContext> {
  silenceLogs();
  const { app, services } = buildApiTestApp(pool);
  const running = await listenApp(app);
  return { running, services, baseUrl: running.baseUrl };
}

/** ينفّذ طلباً ويعيد رمز الحالة والجسم معاً. */
export async function json<T = unknown>(response: Response): Promise<JsonResponse<T>> {
  return { status: response.status, body: (await response.json()) as T };
}

/** يرسل POST JSON ويعيد الرمز والجسم. */
export async function postJson<T = unknown>(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<JsonResponse<T>> {
  return json<T>(
    await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** يرسل PATCH JSON ويعيد الرمز والجسم. */
export async function patchJson<T = unknown>(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<JsonResponse<T>> {
  return json<T>(
    await fetch(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** يرسل GET مع سلسلة استعلام اختيارية ويعيد الرمز والجسم. */
export async function getJson<T = unknown>(
  baseUrl: string,
  path: string,
): Promise<JsonResponse<T>> {
  return json<T>(await fetch(`${baseUrl}${path}`));
}

/**
 * يرسل DELETE ويعيد الرمز والجسم.
 *
 * استجابة 204 لا تحمل جسماً، ومحاولة `response.json()` عليها ترمي
 * «Unexpected end of JSON input». لذلك نقرأ النص ونحلله فقط إن كان
 * غير فارغ — وإلا نُعيد `undefined` كجسم.
 */
export async function deleteJson<T = unknown>(
  baseUrl: string,
  path: string,
): Promise<JsonResponse<T | undefined>> {
  const response = await fetch(`${baseUrl}${path}`, { method: 'DELETE' });
  const text = await response.text();
  return {
    status: response.status,
    body: (text.length > 0 ? JSON.parse(text) : undefined) as T | undefined,
  };
}
