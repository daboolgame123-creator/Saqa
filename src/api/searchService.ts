/**
 * خدمة البحث الموحّد في الواجهة (Phase 22 — UI-09 §39–40).
 *
 * تستهلك مسار `GET /api/search` الموجود على الخادم. لا تضيف مسارات API جديدة،
 * ولا تخترع معلمات غير معتمدة في العقد الحالي.
 *
 * الاقتراحات تُنفَّذ عبر نفس المسار مع `limit` صغير (5 نتائج)، دون مسار مستقل،
 * تجنبًا لإنشاء عقد API جديد غير محسوم في الخطة.
 */
import { getApiClient, type ApiClient } from './apiClient';
import type { SearchResultDto } from '../../server/src/api/dto/search';

/** معاملات البحث الموحّد الواجهة. */
export interface UnifiedSearchParams {
  /** نص البحث (إلزامي). */
  q: string;
  /** نوع المورد: transaction | employee | all. الافتراضي all. */
  type?: 'transaction' | 'employee' | 'all';
  /** الحد الأقصى للنتائج (الخادم يقصّه إلى 100 كحد أقصى). */
  limit?: number;
  /** عدد النتائج التي تُتخطى للترقيم. */
  offset?: number;
}

/** نتيجة بحث موحّدة مع بيانات العرض. */
export interface UnifiedSearchResult {
  source: 'transaction' | 'employee';
  id: string;
  title: string;
  number?: string;
  date?: string;
  person?: string;
  excerpt?: string;
  sourceLabel: 'معاملة' | 'منتسب';
  visibility?: string;
}

/** إجراء بحث موحّد عبر الـAPI. */
export async function searchUnified(
  params: UnifiedSearchParams,
  client: ApiClient = getApiClient(),
): Promise<UnifiedSearchResult[]> {
  const query: Record<string, string | number | boolean | undefined> = {
    q: params.q,
    type: params.type ?? 'all',
    limit: params.limit,
    offset: params.offset,
  };

  const results = await client.get<SearchResultDto[]>('/api/search', query);

  return results.map((r) => ({
    source: r.source,
    id: r.id,
    title: r.title,
    number: r.number,
    date: r.date,
    person: r.person,
    excerpt: r.excerpt,
    sourceLabel: r.sourceLabel,
    visibility: r.visibility,
  }));
}

/** اقتراحات بحث بسيطة عبر نفس المسار مع limit صغير. */
export async function searchSuggestions(
  q: string,
  client: ApiClient = getApiClient(),
): Promise<UnifiedSearchResult[]> {
  return searchUnified({ q, type: 'all', limit: 5, offset: 0 }, client);
}