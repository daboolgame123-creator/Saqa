/**
 * عميل الـAPI في الواجهة (Phase 10).
 *
 * مسؤولياته:
 * - إرسال طلبات JSON إلى الـBackend عبر `fetch`.
 * - ترجمة استجابات الخطأ إلى `ApiError` يحمل `code` الثابت من عقد
 *   الأخطاء في الخادم (Phase 8) بدل قراءة الرسالة العربية.
 * - فرض مهلة على الطلب حتى لا تتعلّق الواجهة على خادم متوقف.
 *
 * ما لا يفعله: لا يمرّر الهوية ولا الرموز — المصادقة مرحلة 11، فلا
 * يُرفق أي ترويسة مصادقة الآن. ولا يعرف قواعد عمل.
 */
import { ApiError, type ApiErrorBody } from './apiError';

export { ApiError };
export type { ApiErrorBody };

/** وسيلة تنفيذ الطلب — تُحقن ليسهل الاختبار بلا شبكة. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** خيارات إنشاء العميل. */
export interface ApiClientOptions {
  /** جذر المسارات (مثل ‎/api). */
  baseUrl: string;
  /** مهلة الطلب بالمللي ثانية. */
  timeoutMs?: number;
  /** وسيلة تنفيذ قابلة للحقن (الافتراضية fetch). */
  fetchImpl?: FetchLike;
}

/** المسار الافتراضي للـBackend — منفذ مختلف عن Vite عمداً (Phase 8). */
const DEFAULT_BASE_URL = 'http://127.0.0.1:4000/api';
const DEFAULT_TIMEOUT_MS = 15000;

/** خيارات نداء واحد. */
export interface RequestOptions {
  /** جسم الطلب (يُحوَّل إلى JSON). */
  body?: unknown;
  /** معاملات الاستعلام؛ تُستبعد القيم الفارغة. */
  query?: Record<string, string | number | boolean | undefined>;
  /** طريقة HTTP. */
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** معرّف طلب من العميل — يعيده الخادم في الترويسة (Phase 8). */
  requestId?: string;
}

/** يبني رابط الطلب مع معاملات الاستعلام المعرَّفة فقط. */
function buildUrl(baseUrl: string, path: string, query: RequestOptions['query']): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl.replace(/\/+$/, '')}${normalized}`;
  if (query === undefined) {
    return url;
  }
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length > 0 ? `${url}?${pairs.join('&')}` : url;
}

/** يقرأ جسم الاستجابة نصاً ثم يحلله، ويتحمّل bodies الفارغة (204). */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // استجابة ليست JSON — تُمرَّر كنص كما هي.
    return text;
  }
}

/** واجهة العميل التي تعتمد عليها الـadapters. */
export interface ApiClient {
  get<T>(path: string, query?: RequestOptions['query'], requestId?: string): Promise<T>;
  post<T>(path: string, body: unknown, requestId?: string): Promise<T>;
  patch<T>(path: string, body: unknown, requestId?: string): Promise<T>;
  remove(path: string, requestId?: string): Promise<void>;
  /** جذر الـAPI المستخدم — للتشخيص. */
  readonly baseUrl: string;
}

/**
 * ينشئ عميل الـAPI.
 *
 * المهلة عبر `AbortSignal`، والمؤقت يُحرَّر في كل الأحوال حتى لا تبقى
 * العملية معلّقة على Node بعد انتهاء الطلب.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = options;
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, requestOptions: Omit<RequestOptions, 'body'> & {
    body?: unknown;
  }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await doFetch(buildUrl(baseUrl, path, requestOptions.query), {
        method: requestOptions.method,
        headers: {
          accept: 'application/json',
          ...(requestOptions.body !== undefined && { 'content-type': 'application/json' }),
          ...(requestOptions.requestId !== undefined && { 'x-request-id': requestOptions.requestId }),
        },
        ...(requestOptions.body !== undefined && { body: JSON.stringify(requestOptions.body) }),
        signal: controller.signal,
      });

      const payload = await readBody(response);
      if (!response.ok) {
        throw new ApiError(response.status, (payload ?? {}) as ApiErrorBody);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new ApiError(408, {
          error: { code: 'REQUEST_TIMEOUT', message: 'انتهت مهلة الاتصال بالخادم.' },
        });
      }
      // فشل شبكي (الخادم متوقف) — لا نعترض رمزاً مخترعاً.
      throw new ApiError(0, {
        error: { code: 'NETWORK_ERROR', message: 'تعذّر الوصول إلى الخادم.' },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** يقرأ جذر الـAPI من إعدادات Vite مع قيمة افتراضية للتطوير. */
  function get<T>(path: string, query?: RequestOptions['query'], requestId?: string): Promise<T> {
    return request<T>(path, { method: 'GET', query, requestId });
  }
  function post<T>(path: string, body: unknown, requestId?: string): Promise<T> {
    return request<T>(path, { method: 'POST', body, requestId });
  }
  function patch<T>(path: string, body: unknown, requestId?: string): Promise<T> {
    return request<T>(path, { method: 'PATCH', body, requestId });
  }

  return {
    baseUrl,
    get,
    post,
    patch,
    remove: (path: string, requestId?: string) =>
      request<unknown>(path, { method: 'DELETE', requestId }).then(() => undefined),
  };
}

/** يقرأ جذر الـAPI من إعدادات Vite مع قيمة افتراضية للتطوير. */
function resolveBaseUrl(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL;
  return typeof configured === 'string' && configured.trim().length > 0
    ? configured.trim()
    : DEFAULT_BASE_URL;
}

/** العميل الافتراضي للواجهة (يُنشأ مرة واحدة عند أول استيراد). */
let sharedClient: ApiClient | null = null;

/** يعيد عميل الـAPI المشترك. */
export function getApiClient(): ApiClient {
  if (sharedClient === null) {
    sharedClient = createApiClient({ baseUrl: resolveBaseUrl() });
  }
  return sharedClient;
}
