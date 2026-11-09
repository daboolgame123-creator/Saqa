/**
 * خدمة البحث الموحد في طبقة الـAPI (Phase 22 — §38).
 *
 * تمرّر نطاق الكتب ونطاق المنتسبين المستقل إلى SQL، ثم تحوّل النتائج إلى DTOs.
 * صلاحية العملية والتحقق من المدخلات في middleware.
 */
import type {
  SearchFilter,
  SearchRepository,
  SearchResult,
  TransactionScopeFilter,
} from '../../repositories/contracts';
import type { SearchQuery, SearchResultDto } from '../dto';
import { requirePersonnelScope, type PersonnelReadScope } from '../../authorization/personnelScope';

export class SearchApiService {
  constructor(private readonly search: SearchRepository) {}

  /**
   * بحث موحد بناءً على معاملات الاستعلام المحقَّقة.
   * `scope` نطاق الوصول للمعاملات (من `transactionScopeOf` في controller).
   */
  async run(
    query: SearchQuery,
    personnelScope: PersonnelReadScope,
    scope?: TransactionScopeFilter,
  ): Promise<SearchResultDto[]> {
    requirePersonnelScope(personnelScope);
    const filter: SearchFilter = {
      q: query.q,
      type: query.type ?? 'all',
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };

    const results = await this.search.search(filter, personnelScope, scope);
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
