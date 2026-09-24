import React, { useMemo, useState } from 'react';
import {
  TimelineEntry,
  TimelineSourceType,
} from '../../core/models';
import { TimelineService } from '../../services/timelineService';
import {
  Calendar,
  ChevronLeft,
  Search,
} from 'lucide-react';

interface TimelineViewProps {
  /** اسم المنتسب للعرض في الترويسة */
  employeeName: string;
  /** كل الأحداث الزمنية المشتقة — يُمرّرها المكوّن الأصلي */
  entries: TimelineEntry[];
  /** عدد الأحداث الكلي (من المصادر الأصلية، قبل الفلاتر) */
  totalCount: number;
  /** إحصائيات عدد الأحداث لكل نوع مصدر */
  countsBySource: Record<TimelineSourceType, number>;
  /** التنقّل إلى السجل الأصلي — يمرّر نوع المصدر والمعرّف */
  onNavigateToSource: (sourceType: TimelineSourceType, sourceId: string) => void;
  /** إغلاق العرض (للواجهة المدمجة داخل ملف المنتسب) */
  onBack?: () => void;
}

type Period = 'day' | 'week' | 'month';
type SortOrder = 'desc' | 'asc';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'يومي' },
  { value: 'week', label: 'أسبوعي' },
  { value: 'month', label: 'شهري' },
];

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'desc', label: 'الأحدث أولاً' },
  { value: 'asc', label: 'الأقدم أولاً' },
];

/**
 * TimelineView — طبقة عرض مشتقة من المصادر الأصلية (BR-14 / Phase 7).
 *
 * لا تُخزّن أي بيانات؛ تُظهر الأحداث التي يجمعها TimelineService من الكيانات الأصلية.
 * تدعم الفلاتر، التجميع الزمني، والتنّقّل إلى السجل الأصلي.
 */
export const TimelineView: React.FC<TimelineViewProps> = ({
  employeeName,
  entries,
  totalCount,
  countsBySource,
  onNavigateToSource,
  onBack,
}) => {
  const [activeSources, setActiveSources] = useState<TimelineSourceType[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [period, setPeriod] = useState<Period>('day');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // جميع أنواع المصادر المعتمدة (بدون appointment/transfer)
  const availableSourceTypes = useMemo(
    () =>
      (Object.keys(countsBySource) as TimelineSourceType[]).filter(
        (t) => t !== 'appointment' && t !== 'transfer' && (countsBySource[t] ?? 0) > 0
      ),
    [countsBySource]
  );

  // دمج فلاتر UI على قائمة الأحداث الأصلية (المصدر الأصلي لا يتغير)
  const filteredEntries = useMemo(() => {
    let result = entries;

    if (activeSources.length > 0) {
      result = result.filter((e) => activeSources.includes(e.sourceType));
    }

    if (dateFrom) {
      result = result.filter((e) => e.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((e) => (e.endDate ?? e.date) <= dateTo);
    }

    if (searchText.trim()) {
      const term = searchText.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          (e.description?.toLowerCase().includes(term) ?? false)
      );
    }

    return result;
  }, [entries, activeSources, dateFrom, dateTo, searchText]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const primary =
        sortOrder === 'desc'
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      if (primary !== 0) return primary;
      return a.id.localeCompare(b.id);
    });
  }, [filteredEntries, sortOrder]);

  const grouped = useMemo(
    () => TimelineService.groupByPeriod(sortedEntries, period),
    [sortedEntries, period]
  );

  const toggleSource = (type: TimelineSourceType) => {
    setActiveSources((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const clearFilters = () => {
    setActiveSources([]);
    setDateFrom('');
    setDateTo('');
    setSearchText('');
  };

  const activeFilterCount =
    (activeSources.length > 0 ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (searchText.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>عودة إلى الملف الشخصي</span>
          </button>
        )}
        <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
          الخط الزمني — {employeeName}
        </h2>
        <div className="w-4" />
      </div>

      {/* Control Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowFilters((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${
            activeFilterCount > 0
              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
          } hover:bg-stone-200 dark:hover:bg-stone-700`}
        >
          <Search className="w-4 h-4" />
          <span>التصفية</span>
          {activeFilterCount > 0 && (
            <span className="bg-indigo-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="px-2 py-1 text-sm rounded-md bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-800 dark:text-stone-200"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="px-2 py-1 text-sm rounded-md bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-800 dark:text-stone-200"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className="text-xs text-stone-500 dark:text-stone-400">
          {filteredEntries.length} من {totalCount} حدث
        </span>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-md border border-stone-200 dark:border-stone-700 space-y-3">
          <div>
            <span className="text-xs font-medium text-stone-600 dark:text-stone-400 block mb-1.5">
              نوع المصدر
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableSourceTypes.map((type) => {
                const labels = TimelineService.getSourceTypeLabels();
                const isActive = activeSources.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleSource(type)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      isActive
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'
                    }`}
                  >
                    {labels[type] ?? type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 dark:text-stone-400 block mb-0.5">
                من تاريخ
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded-md bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-800 dark:text-stone-200"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 dark:text-stone-400 block mb-0.5">
                إلى تاريخ
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded-md bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-800 dark:text-stone-200"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-500 dark:text-stone-400 block mb-0.5">
              بحث نصي
            </label>
            <input
              type="text"
              placeholder="ابحث في العنوان أو الوصف..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full px-2 py-1 text-sm rounded-md bg-white dark:bg-stone-700 border border-stone-300 dark:border-stone-600 text-stone-800 dark:text-stone-200"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="px-3 py-1 text-xs rounded-md bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 hover:bg-stone-300 dark:hover:bg-stone-600"
            >
              مسح الفلاتر
            </button>
            <button
              onClick={() => setShowFilters(false)}
              className="px-3 py-1 text-xs rounded-md bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 hover:bg-stone-300 dark:hover:bg-stone-600"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Timeline Content */}
      {sortedEntries.length === 0 ? (
        <div className="text-center py-8 text-stone-500 dark:text-stone-400">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>لا توجد أحداث زمنية مسجلة لهذا المنتسب</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.period} className="border border-stone-200 dark:border-stone-700 rounded-md overflow-hidden">
              <div className="bg-stone-100 dark:bg-stone-800 px-3 py-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                  {group.periodLabel}
                </h3>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {group.count} حدث
                </span>
              </div>
              <div className="divide-y divide-stone-200 dark:divide-stone-700">
                {group.entries.map((entry) => (
                  <TimelineEntryItem
                    key={`${entry.sourceType}-${entry.id}`}
                    entry={entry}
                    onClick={() => onNavigateToSource(entry.sourceType, entry.sourceId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * مكوّن عنصر واحد في الخط الزمني.
 */
const TimelineEntryItem: React.FC<{
  entry: TimelineEntry;
  onClick: () => void;
}> = ({ entry, onClick }) => {
  const { icon, color, bgColor } = TimelineService.getSourceTypeStyle(entry.sourceType);
  const labels = TimelineService.getSourceTypeLabels();

  const formatEntryDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div
      onClick={onClick}
      className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/30 transition-colors px-3 py-2.5"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-base ${bgColor}`}
        >
          <span className="whitespace-nowrap">{icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
            <div>
              <span className={`text-xs font-medium ${color}`}>
                {labels[entry.sourceType] ?? entry.sourceType}
              </span>
              <span className="mx-1.5 text-stone-300 dark:text-stone-600">·</span>
              <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                {entry.title}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
              <Calendar className="w-3 h-3" />
              <span>{formatEntryDate(entry.date)}</span>
              {entry.endDate && entry.endDate !== entry.date && (
                <>
                  <span>→</span>
                  <span>{formatEntryDate(entry.endDate)}</span>
                </>
              )}
            </div>
          </div>

          {entry.description && (
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 truncate">
              {entry.description}
            </p>
          )}

          {entry.status && (
            <span className="inline-block mt-1 text-xs px-1.5 py-0.25 rounded bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
              {entry.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineView;