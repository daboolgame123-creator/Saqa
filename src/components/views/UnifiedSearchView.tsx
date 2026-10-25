/**
 * واجهة البحث الموحّد (Phase 22 — UI-09 §39–40).
 *
 * نقطة دخول واضحة للبحث في الكتب/المعاملات والمنتسبين عبر `GET /api/search`.
 * تعرض النتائج مجمعة حسب نوع المصدر، مع دعم الاقتراحات أثناء الكتابة،
 * وحالات التحميل، والنتائج الفارغة، وأخطاء API.
 *
 * لا تضيف صلاحيات جديدة: RBAC وAccess Scope تُفرض على الخادم؛ الواجهة
 * تستهلك عقد API الحالي فقط.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Users,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  ChevronRight,
} from 'lucide-react';
import type { NavigationTarget } from '../../core/models';
import { searchUnified, searchSuggestions, type UnifiedSearchResult } from '../../api/searchService';

/** أيقونة نوع المصدر (معاملة / منتسب). */
function sourceIcon(source: 'transaction' | 'employee') {
  return source === 'transaction' ? (
    <FileText className="w-4 h-4 text-stone-500" />
  ) : (
    <Users className="w-4 h-4 text-stone-500" />
  );
}

/** بطاقة نتيجة واحدة. */
function SearchResultCard({
  result,
  onSelect,
}: {
  result: UnifiedSearchResult;
  onSelect: (target: NavigationTarget) => void;
}) {
  // النقر يفتح المورد الحقيقي: المعاملة ← سجل المعاملات، المنتسب ← سجل المنتسبين.
  const handleClick = () => {
    if (result.source === 'transaction') {
      onSelect({
        view: 'transactions',
        searchTerm: result.number ?? result.title,
      });
    } else {
      onSelect({
        view: 'employees',
        employeeId: result.id,
        employeeName: result.title,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-start gap-3 px-4 py-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-right"
    >
      <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
        {sourceIcon(result.source)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {result.sourceLabel}
          </span>
          {result.visibility && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700">
              {result.visibility}
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
          {result.title}
        </h3>
        <div className="flex flex-wrap gap-2 mt-1 text-xs text-stone-500 dark:text-stone-400">
          {result.number && <span>الرقم: {result.number}</span>}
          {result.date && <span>التاريخ: {result.date}</span>}
          {result.person && <span>الشخص: {result.person}</span>}
        </div>
        {result.excerpt && (
          <p className="mt-1.5 text-sm text-stone-600 dark:text-stone-300 line-clamp-2">
            {result.excerpt}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-stone-400 shrink-0 mt-1" />
    </button>
  );
}

export interface UnifiedSearchViewProps {
  onNavigate?: (target: NavigationTarget) => void;
  onClose?: () => void;
}

export const UnifiedSearchView: React.FC<UnifiedSearchViewProps> = ({
  onNavigate,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<UnifiedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedType, setSelectedType] = useState<'transaction' | 'employee' | 'all'>('all');

  const searchRef = useRef<number>(0);
  const suggestionRef = useRef<number>(0);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupedResults = useMemo(() => {
    const transactions = results.filter((r) => r.source === 'transaction');
    const employees = results.filter((r) => r.source === 'employee');
    return { transactions, employees };
  }, [results]);

  const executeSearch = useCallback(
    async (q: string, type: 'transaction' | 'employee' | 'all') => {
      if (!q.trim()) {
        setResults([]);
        setSuggestions([]);
        setShowSuggestions(false);
        setError(null);
        return;
      }

      const searchId = ++searchRef.current;

      setLoading(true);
      setError(null);

      try {
        const fetched = await searchUnified({ q, type, limit: 100, offset: 0 });
        if (searchId !== searchRef.current) return;
        setResults(fetched);
        setShowSuggestions(false);
      } catch (err: unknown) {
        if (searchId !== searchRef.current) return;
        setResults([]);
        setError(
          err instanceof Error
            ? err.message
            : 'تعذّر تنفيذ البحث. يرجى المحاولة مرة أخرى.',
        );
      } finally {
        if (searchId === searchRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const executeSuggestions = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      const suggestionId = ++suggestionRef.current;

      try {
        const fetched = await searchSuggestions(q);
        if (suggestionId !== suggestionRef.current) return;
        setSuggestions(fetched);
        setShowSuggestions(fetched.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    },
    [],
  );

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setError(null);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      if (!value.trim()) {
        setSuggestions([]);
        setShowSuggestions(false);
        setResults([]);
        return;
      }
      debounceTimeout.current = setTimeout(() => {
        executeSuggestions(value);
      }, 300);
    },
    [executeSuggestions],
  );

  const handleSearch = useCallback(() => {
    executeSearch(query, selectedType);
    setShowSuggestions(false);
  }, [query, selectedType, executeSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleSelectSuggestion = useCallback(
    (result: UnifiedSearchResult) => {
      setQuery(result.title);
      setSuggestions([]);
      setShowSuggestions(false);
      executeSearch(result.title, result.source);
    },
    [executeSearch],
  );

  const handleRetry = useCallback(() => {
    if (query.trim()) executeSearch(query, selectedType);
  }, [query, selectedType, executeSearch]);

  // تغيير نوع المورد يعيد تنفيذ البحث مباشرةً بالنص نفسه.
  const handleTypeChange = useCallback(
    (type: 'transaction' | 'employee' | 'all') => {
      setSelectedType(type);
      setShowSuggestions(false);
      if (query.trim()) executeSearch(query, type);
    },
    [query, executeSearch],
  );

  // النقر على نتيجة يفتح المورد الحقيقي ويغلق لوحة البحث.
  const handleSelectResult = useCallback(
    (target: NavigationTarget) => {
      onNavigate?.(target);
      onClose?.();
    },
    [onNavigate, onClose],
  );

  React.useEffect(() => {
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, []);

  const isEmptyQuery = query.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white/50 dark:bg-stone-900/50 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h1 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              البحث الموحّد
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
              aria-label="إغلاق البحث"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="relative">
            <input
              type="search"
              placeholder="ابحث في المعاملات والمنتسبين…"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all text-sm"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
            />
            {!isEmptyQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setSuggestions([]);
                  setShowSuggestions(false);
                  setError(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                aria-label="مسح النص"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="mt-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-900 overflow-hidden shadow-sm">
              {suggestions.map((item) => (
                <button
                  key={`${item.source}-${item.id}`}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors border-b border-stone-100 dark:border-stone-800 last:border-b-0"
                >
                  {sourceIcon(item.source)}
                  <span className="text-stone-500 dark:text-stone-400">{item.sourceLabel}</span>
                  <span className="font-medium text-stone-900 dark:text-stone-100 truncate">
                    {item.title}
                  </span>
                  {item.number && (
                    <span className="text-stone-400 dark:text-stone-500 mr-auto">{item.number}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {(['all', 'transaction', 'employee'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                  selectedType === type
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-500'
                    : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                {type === 'all' ? 'الكل' : type === 'transaction' ? 'المعاملات' : 'المنتسبون'}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>جارٍ البحث…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold underline cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {!loading && !error && isEmptyQuery && (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              اكتب نصاً للبحث في المعاملات والمنتسبين. الحقول المعتمدة: الرقم · التسلسل ·
              التاريخ · المصدر · الجهة · الموضوع · المحتوى · المنتسب · القسم · الحالة.
            </p>
          )}

          {!loading && !error && !isEmptyQuery && results.length === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-sm text-stone-600 dark:text-stone-300">
              <Search className="w-4 h-4 text-stone-400" />
              <span>لا توجد نتائج مطابقة ضمن نطاق رؤيتك.</span>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500 dark:text-stone-400">
                عدد النتائج: {results.length}
              </p>

              {groupedResults.transactions.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold text-stone-600 dark:text-stone-300 mb-2">
                    المعاملات ({groupedResults.transactions.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedResults.transactions.map((item) => (
                      <SearchResultCard
                        key={`transaction-${item.id}`}
                        result={item}
                        onSelect={handleSelectResult}
                      />
                    ))}
                  </div>
                </section>
              )}

              {groupedResults.employees.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold text-stone-600 dark:text-stone-300 mb-2">
                    المنتسبون ({groupedResults.employees.length})
                  </h2>
                  <div className="space-y-2">
                    {groupedResults.employees.map((item) => (
                      <SearchResultCard
                        key={`employee-${item.id}`}
                        result={item}
                        onSelect={handleSelectResult}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};