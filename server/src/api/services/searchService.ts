/**
 * خدمة البحث الموحد في طبقة الـAPI (Phase 22 — §38).
 *
 * تستدعي مستودع البحث وتحوّل سجلاته إلى DTOs نقل. لا تحقق ولا صلاحيات هنا
 * (تفرضها middleware على المسار)، ولا منطق أعمال مخترع.
 */
import type {
  SearchFilter,
  SearchRepository,
  SearchResult,
  TransactionScopeFilter,
} from '../../repositories/contracts';
import type { SearchQuery, SearchResultDto } from '../dto';

export class SearchApiService {
  constructor(private readonly search: SearchRepository) {}

  /**
   * بحث موحد بناءً على معاملات الاستعلام المحقَّقة.
   * `scope` نطاق الوصول للمعاملات (من `transactionScopeOf` في controller).
   */
  async run(
    query: SearchQuery,
    scope?: TransactionScopeFilter,
  ): Promise<SearchResultDto[]> {
    const filter: SearchFilter = {
      q: query.q,
      type: query.type ?? 'all',
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };

    const results = await this.search.search(filter, scope);
    return results.map((r: SearchResult) => ({
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
}