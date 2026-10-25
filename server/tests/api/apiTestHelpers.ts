/**
 * أدوات مشتركة لاختبارات الـAPI (Phase 10؛ وُسّعت في Phase 11 بجلسات المصادقة).
 *
 * الاختبارات تشغّل تطبيق Express حقيقياً على منفذ عشوائي وتخاطبه عبر
 * fetch، فالمسار المُختبَر هو المسار الفعلي بالكامل:
 *   middleware → validation → controller → service → repository → PostgreSQL
 * لا mock في أي طبقة، ولا شبكة خارجية (منفذ عشوائي على 127.0.0.1).
 *
 * الخدمات تُبنى على Pool قاعدة الاختبار وتُحقَن عبر `useApiServices`
 * و`useAuthService`، فتعمل الاختبارات بلا `DATABASE_URL` ولا تفتح
 * قاعدة التطوير إطلاقاً.
 *
 * Phase 11 — الجلسات: كل مسارات `/api/*` تتطلّب جلسة صالحة، فتُحقن
 * الرفعة في كل طلب عبر `useTestSession`. هذا يعكس واقع التشغيل تماماً:
 * لا اختبار يمرّ بلا هوية إلا ما يفحص رفض الغياب عمداً.
 */
import express, { type Express } from 'express';
import type { Pool } from 'pg';
import { createApiRouter } from '../../src/api/routes';
import { createApiServicesOnPool, type ApiServices } from '../../src/api/services';
import { useApiServices } from '../../src/api/serviceContext';
import { createAuthRouter } from '../../src/auth/authRoutes';
import { createAuthServiceOnPool, type AuthService } from '../../src/auth/authService';
import { useAuthService } from '../../src/auth/serviceContext';
import { createTestOtpProvider, type TestOtpProvider } from '../../src/auth/otpProvider';
import type { FileStorage } from '../../src/storage';
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
  authService: AuthService;
  /** Pool قاعدة الاختبار — لزرع البذور التي لا تمرّ عبر HTTP. */
  pool: Pool;
  /** مزوّد OTP الاختباري — منه تُقرأ الأرقام المُصدَرة فعلاً. */
  otpProvider: TestOtpProvider;
  baseUrl: string;
}

/**
 * الرفعة المستخدَمة في الطلبات التالية.
 *
 * تُضبط عبر `useTestSession` بعد تسجيل دخول حقيقي، فتكون كل اختبارات
 * Phase 10 تسير كما هي لكن خلف هوية فعلية. `useTestSession(null)` تعيد
 * الطلب بلا هوية — ويستخدمها اختبارPhase 11 المتعلق برفض الغياب.
 */
let currentSessionToken: string | null = null;

/** يضبط الرفعة المستخدَمة في كل الطلبات اللاحقة. */
export function useTestSession(token: string | null): void {
  currentSessionToken = token;
}

/** يعيد الرفعة الحالية (أو null). */
export function currentTestSession(): string | null {
  return currentSessionToken;
}

/** ترويسة المصادقة عند وجود رفعة، وإلا كائن فارغ. */
function authHeaders(): Record<string, string> {
  return currentSessionToken === null ? {} : { authorization: `Bearer ${currentSessionToken}` };
}

/**
 * يبني تطبيق الاختبار بنفس تركيب `createApp` (Phase 8):
 * requestId → requestLogger → json → routes → 404 → errorHandler.
 * يضيف Phase 11: حقن `useAuthService` (بمزوّد OTP اختباري) و
 * تركيب `/api/auth` **قبل** `/api` المحمي بـ`requireSession`.
 */
export function buildApiTestApp(
  pool: Pool,
  fileStorage?: FileStorage,
): {
  app: Express;
  services: ApiServices;
  authService: AuthService;
  otpProvider: TestOtpProvider;
} {
  const services = createApiServicesOnPool(pool, fileStorage);
  const otpProvider = createTestOtpProvider();
  const authService = createAuthServiceOnPool(pool, otpProvider);
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(express.json());
  app.use(useApiServices(services));
  app.use(useAuthService(authService));
  // نفس ترتيب الإنتاج: المصادقة قبل طبقة البيانات المحمية.
  app.use('/api/auth', createAuthRouter());
  app.use('/api', createApiRouter());
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeDetails: true }));

  return { app, services, authService, otpProvider };
}

/** يشغّل التطبيق على منفذ عشوائي ويعيد سياق الاختبار. */
export async function startApiTestContext(
  pool: Pool,
  fileStorage?: FileStorage,
): Promise<ApiTestContext> {
  silenceLogs();
  const { app, services, authService, otpProvider } = buildApiTestApp(pool, fileStorage);
  const running = await listenApp(app);
  useTestSession(null);
  return { running, services, authService, pool, otpProvider, baseUrl: running.baseUrl };
}

/**
 * دوال الطلبات: كما هي من Phase 10، مع حقن الرفعة الحالية في كل طلب
 * (Phase 11)، فتبقى شكل الاستدعاء في ملفات الاختبار القائمة بلا تغيير.
 */

/**
 * ترويسات مشتركة لكل طلبات الاختبار.
 *
 * `connection: close`: بعض المسارات تردّ بلا جسم (204 عند تسجيل الخروج)،
 * ولوحظ في هذه البيئة أن طلباً تالٍ على اتصال مشترك ينتظر جسماً لن يأتي.
 *
 * **ترتيب الانتشار مقصود**: `authHeaders()` تُنشر **قبل** `extra` حتى لا
 * تمحو ترويسة `authorization` الصريحة التي يمرّرها `requestWithToken`؛
 * فطلب برفعة محدّدة يجب أن يُرسل تلك الرفعة لا الرفعة المحقونة.
 */
function requestHeaders(extra: Record<string, string>): Record<string, string> {
  return { accept: 'application/json', ...authHeaders(), ...extra, connection: 'close' };
}

/**
 * يقرأ رمز الحالة والجسم معاً.
 *
 * يتحمّل **الاستجابة بلا جسم** (204 عند تسجيل الخروج): `response.json()`
 * يرمي «Unexpected end of JSON input» على نص فارغ، لذلك نقرأ النص أولاً
 * ونحلله فقط إن كان غير فارغ — السلوك نفسه الموثّق في `deleteJson`.
 */
export async function json<T = unknown>(response: Response): Promise<JsonResponse<T>> {
  const text = await response.text();
  return {
    status: response.status,
    body: (text.length > 0 ? JSON.parse(text) : undefined) as T,
  };
}

/**
 * يرسل POST ويعيد الرمز والجسم.
 *
 * `body === undefined` ⇐ مسار بلا جسم (مثل إعادة الضبط وكشف الرمز).
 * عندها **لا** نُرسل `content-type` ولا جسماً إطلاقاً: فمحلل JSON في
 * Express 5 ينتظر ترويسة `content-length`/بيانات، فيتعلّق الطلب حتى
 * ينتهي مهلة العميل (300 ثانية) بدل أن يُرَدّ فوراً.
 */
export async function postJson<T = unknown>(
  baseUrl: string,
  path: string,
  body?: unknown,
): Promise<JsonResponse<T>> {
  const hasBody = body !== undefined;
  return json<T>(
    await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: requestHeaders(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(hasBody && { body: JSON.stringify(body) }),
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
      headers: requestHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }),
  );
}

/** يرسل GET مع سلسلة استعلام اختيارية ويعيد الرمز والجسم. */
export async function getJson<T = unknown>(
  baseUrl: string,
  path: string,
): Promise<JsonResponse<T>> {
  return json<T>(
    await fetch(`${baseUrl}${path}`, {
      headers: requestHeaders({}),
    }),
  );
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
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: requestHeaders({}),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text.length > 0 ? JSON.parse(text) : undefined) as T | undefined,
  };
}

/**
 * طلب برفعة صريحة — لاختبارات Phase 11 التي تفحص حالات الرفض
 * (غياب الهوية، انتهاء الجلسة، طلب تغيير الرمز المؤقت) برفعة محدّدة
 * لا بالرفعة العامة المحقونة.
 */
export async function requestWithToken<T = unknown>(
  baseUrl: string,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<JsonResponse<T | undefined>> {
  const { method = 'GET', token = null, body } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders({
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(token !== null && { authorization: `Bearer ${token}` }),
    }),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text.length > 0 ? JSON.parse(text) : undefined) as T,
  };
}

/**
 * يرفع ملف مرفق (Phase 14) — بايتات خام لا JSON.
 *
 * الاسم يُرسل بترميز URI عبر ترويسة `x-attachment-filename` لأن الأسماء
 * العربية لا تُنقل بترميز latin1 في ترويسات HTTP. ونوع المرفق كذلك، لأن قيم
 * الكتالوج عربية. وهذا يجعل الاختبار يمرّ بمسار الرفع الحقيقي كاملاً:
 * `express.raw` ← قراءة الترويسات ← الخدمة.
 */
export async function postAttachment<T = unknown>(
  baseUrl: string,
  transactionId: string,
  file: { filename: string; content: Buffer; declaredMimeType?: string; type?: string },
): Promise<JsonResponse<T>> {
  return json<T>(
    await fetch(`${baseUrl}/api/transactions/${transactionId}/attachments`, {
      method: 'POST',
      headers: requestHeaders({
        'content-type': file.declaredMimeType ?? 'application/octet-stream',
        'x-attachment-filename': encodeURIComponent(file.filename),
        // النوع أيضاً يُرمَّز: قيم الكتالوج عربية وترويسات HTTP لا تقبلها.
        ...(file.type !== undefined && {
          'x-attachment-type': encodeURIComponent(file.type),
        }),
      }),
      body: new Uint8Array(file.content),
    }),
  );
}

/**
 * ينزّل محتوى مرفق ويعيد الاستجابة الخام (لا JSON).
 *
 * `getJson` لا يصلح هنا لأن الرد بايتات ملف لا كائن؛ نحتاج ترويساته
 * (للتحقق من `Content-Type` ومنع التخزين المؤقت) والبايتات نفسها
 * (لمطابقة المحتوى بعد التنزيل).
 */
export async function getAttachmentContent(
  baseUrl: string,
  transactionId: string,
  attachmentId: string,
): Promise<Response> {
  return fetch(
    `${baseUrl}/api/transactions/${transactionId}/attachments/${attachmentId}/content`,
    { headers: requestHeaders({}) },
  );
}
