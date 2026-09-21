import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Plus, 
  FileText, 
  Printer, 
  Search, 
  Users, 
  Clock, 
  Send, 
  Paperclip, 
  Eye, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Filter, 
  Download,
  AlertCircle,
  Briefcase,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  CalendarCheck2
} from 'lucide-react';
import { Transaction, DailySituationData, DailySituationEntry, NavigationTarget } from '../../types';
import { DailySituationDocumentModal } from '../modals/DailySituationDocumentModal';

interface DailySituationsViewProps {
  transactions: Transaction[];
  onSelectTransaction?: (transaction: Transaction) => void;
  onOpenNewDailySituation: () => void;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onViewAttachment?: (transaction: Transaction, index: number) => void;
  onNavigate?: (target: NavigationTarget) => void;
  navigationTarget?: NavigationTarget | null;
}

export const DailySituationsView: React.FC<DailySituationsViewProps> = ({
  transactions,
  onSelectTransaction,
  onOpenNewDailySituation,
  onEditTransaction,
  onDeleteTransaction,
  onViewAttachment,
  onNavigate,
  navigationTarget,
}) => {
  const [activeTab, setActiveTab] = useState<'forms' | 'time-permissions' | 'leaves'>('forms');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
  const [activePreviewDoc, setActivePreviewDoc] = useState<Transaction | null>(null);

  // Sync with deep linking navigation target
  React.useEffect(() => {
    if (navigationTarget && navigationTarget.view === 'daily-situations') {
      if (navigationTarget.searchTerm) {
        setSearchQuery(navigationTarget.searchTerm);
      }
      if (navigationTarget.employeeName) {
        setSearchQuery(navigationTarget.employeeName);
      }
      if (navigationTarget.subType === 'إجازة') {
        setActiveTab('leaves');
      } else if (navigationTarget.subType === 'زمنية') {
        setActiveTab('time-permissions');
      } else {
        setActiveTab('forms');
      }
    }
  }, [navigationTarget]);

  // Filter transactions that are daily situations
  const dailySituationTransactions = useMemo(() => {
    return transactions.filter(
      (t) => t.isDailySituation === true || t.subType === 'موقف يومي' || Boolean(t.dailySituationData)
    ).sort((a, b) => {
      const dateA = a.dailySituationData?.situationDate || a.date;
      const dateB = b.dailySituationData?.situationDate || b.date;
      return dateB.localeCompare(dateA);
    });
  }, [transactions]);

  // Extract all unique dates available
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    dailySituationTransactions.forEach((t) => {
      const d = t.dailySituationData?.situationDate || t.date;
      if (d) dates.add(d);
    });
    return Array.from(dates).sort().reverse();
  }, [dailySituationTransactions]);

  // Filtered by date & search query
  const filteredSituations = useMemo(() => {
    return dailySituationTransactions.filter((t) => {
      const situationDate = t.dailySituationData?.situationDate || t.date;
      if (selectedDateFilter && situationDate !== selectedDateFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const data = t.dailySituationData;
        const inSubject = t.subject.toLowerCase().includes(q);
        const inNumber = t.number.toLowerCase().includes(q);

        const inEntries = data ? (
          data.permanentLeaves?.some((e) => e.employeeName.toLowerCase().includes(q) || e.details.toLowerCase().includes(q)) ||
          data.permanentTimePermissions?.some((e) => e.employeeName.toLowerCase().includes(q) || e.details.toLowerCase().includes(q)) ||
          data.permanentShiftChanges?.some((e) => e.employeeName.toLowerCase().includes(q) || e.details.toLowerCase().includes(q)) ||
          data.temporaryLeaves?.some((e) => e.employeeName.toLowerCase().includes(q) || e.details.toLowerCase().includes(q)) ||
          data.temporaryTimePermissions?.some((e) => e.employeeName.toLowerCase().includes(q) || e.details.toLowerCase().includes(q)) ||
          data.temporaryShiftChanges?.some((e) => e.employeeName.toLowerCase().includes(q) || e.details.toLowerCase().includes(q))
        ) : false;

        return inSubject || inNumber || inEntries;
      }

      return true;
    });
  }, [dailySituationTransactions, selectedDateFilter, searchQuery]);

  // Aggregated Time Permissions (الساعات الزمنية) across all daily situations
  const allTimePermissions = useMemo(() => {
    const list: Array<{
      entry: DailySituationEntry;
      situationDate: string;
      transactionId: string;
      docNumber: string;
      categoryType: 'دائمي' | 'مكافأة / مؤقت';
    }> = [];

    dailySituationTransactions.forEach((t) => {
      const d = t.dailySituationData;
      const date = d?.situationDate || t.date;
      if (d?.permanentTimePermissions) {
        d.permanentTimePermissions.forEach((p) => {
          if (p.employeeName?.trim()) {
            list.push({
              entry: p,
              situationDate: date,
              transactionId: t.id,
              docNumber: t.number,
              categoryType: 'دائمي',
            });
          }
        });
      }
      if (d?.temporaryTimePermissions) {
        d.temporaryTimePermissions.forEach((p) => {
          if (p.employeeName?.trim()) {
            list.push({
              entry: p,
              situationDate: date,
              transactionId: t.id,
              docNumber: t.number,
              categoryType: 'مكافأة / مؤقت',
            });
          }
        });
      }
    });

    return list.sort((a, b) => b.situationDate.localeCompare(a.situationDate));
  }, [dailySituationTransactions]);

  // Aggregated Leaves (الإجازات الاعتيادية والمرضية والتحويل والدوريات)
  const allLeavesAndShifts = useMemo(() => {
    const list: Array<{
      entry: DailySituationEntry;
      situationDate: string;
      transactionId: string;
      docNumber: string;
      kind: 'إجازة دائمية' | 'إجازة مؤقتة' | 'تحويل دوام / دورية / إيفاد';
    }> = [];

    dailySituationTransactions.forEach((t) => {
      const d = t.dailySituationData;
      const date = d?.situationDate || t.date;
      if (d?.permanentLeaves) {
        d.permanentLeaves.forEach((p) => {
          if (p.employeeName?.trim()) {
            list.push({
              entry: p,
              situationDate: date,
              transactionId: t.id,
              docNumber: t.number,
              kind: 'إجازة دائمية',
            });
          }
        });
      }
      if (d?.temporaryLeaves) {
        d.temporaryLeaves.forEach((p) => {
          if (p.employeeName?.trim()) {
            list.push({
              entry: p,
              situationDate: date,
              transactionId: t.id,
              docNumber: t.number,
              kind: 'إجازة مؤقتة',
            });
          }
        });
      }
      if (d?.permanentShiftChanges) {
        d.permanentShiftChanges.forEach((p) => {
          if (p.employeeName?.trim()) {
            list.push({
              entry: p,
              situationDate: date,
              transactionId: t.id,
              docNumber: t.number,
              kind: 'تحويل دوام / دورية / إيفاد',
            });
          }
        });
      }
      if (d?.temporaryShiftChanges) {
        d.temporaryShiftChanges.forEach((p) => {
          if (p.employeeName?.trim()) {
            list.push({
              entry: p,
              situationDate: date,
              transactionId: t.id,
              docNumber: t.number,
              kind: 'تحويل دوام / دورية / إيفاد',
            });
          }
        });
      }
    });

    return list.sort((a, b) => b.situationDate.localeCompare(a.situationDate));
  }, [dailySituationTransactions]);

  // Statistics calculation across all daily situations
  const stats = useMemo(() => {
    let totalLeaves = 0;
    let totalTimePermissions = 0;
    let totalMissionsAndShifts = 0;
    const recordedEmployees = new Set<string>();

    dailySituationTransactions.forEach((t) => {
      const d = t.dailySituationData;
      if (d) {
        const permLeaves = d.permanentLeaves?.length || 0;
        const tempLeaves = d.temporaryLeaves?.length || 0;
        totalLeaves += (permLeaves + tempLeaves);

        const permTimes = d.permanentTimePermissions?.length || 0;
        const tempTimes = d.temporaryTimePermissions?.length || 0;
        totalTimePermissions += (permTimes + tempTimes);

        const permShifts = d.permanentShiftChanges?.length || 0;
        const tempShifts = d.temporaryShiftChanges?.length || 0;
        totalMissionsAndShifts += (permShifts + tempShifts);

        [
          ...(d.permanentLeaves || []),
          ...(d.permanentTimePermissions || []),
          ...(d.permanentShiftChanges || []),
          ...(d.temporaryLeaves || []),
          ...(d.temporaryTimePermissions || []),
          ...(d.temporaryShiftChanges || []),
        ].forEach((e) => {
          if (e.employeeName) recordedEmployees.add(e.employeeName.trim());
        });
      }
    });

    return {
      totalSituations: dailySituationTransactions.length,
      totalLeaves,
      totalTimePermissions,
      totalMissionsAndShifts,
      uniqueEmployeesCount: recordedEmployees.size,
    };
  }, [dailySituationTransactions]);

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Banner and Navigation Bar */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50 flex items-center justify-center font-bold text-xl shadow-2xs">
            <CalendarCheck2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100">
                سجل الموقف والتقرير اليومي
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                النموذج الرسمي المعتمد لمركز الدراسات
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              قسم مستقل ومتكامل لإدارة استمارات الموقف اليومي، الساعات الزمنية، الإجازات الاعتيادية والمرضية، مع الربط المباشر بسجل المعاملات وسجل المنتسبين
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigate && (
            <button
              type="button"
              id="btn-goto-transactions"
              onClick={() => onNavigate({ view: 'transactions', subType: 'موقف يومي' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold transition-all border border-stone-300 dark:border-stone-700 cursor-pointer"
              title="الانتقال إلى قيود الموقف اليومي في سجل المعاملات الرئيسي"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>عرض في سجل المعاملات ↗</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenNewDailySituation}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold hover:bg-stone-800 dark:hover:bg-amber-300 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4 text-amber-400 dark:text-stone-950" />
            <span>+ تنظيم استمارة موقف جديدة</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
            <span>المواقف المؤرشفة</span>
            <Calendar className="w-4 h-4 text-stone-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 dark:text-stone-100">
            {stats.totalSituations}
          </div>
          <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
            استمارة موقف يومي معتمدة
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
            <span>إجمالي الإجازات</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {stats.totalLeaves}
          </div>
          <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
            إجازات دائمية ومكافأة
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
            <span>الساعات الزمنية</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats.totalTimePermissions}
          </div>
          <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
            إذن خروج وزمنيات مسجلة
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
            <span>المنتسبون بالموقف</span>
            <Briefcase className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {stats.uniqueEmployeesCount}
          </div>
          <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
            منتسب موثق في القيود
          </div>
        </div>
      </div>

      {/* THREE DEDICATED SECTIONS / SUB-TABS AS REQUESTED BY USER */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-1.5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs">
          <button
            type="button"
            id="tab-sub-daily-forms"
            onClick={() => setActiveTab('forms')}
            className={`py-2 px-3 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'forms'
                ? 'bg-stone-900 dark:bg-stone-800 text-amber-300 ring-1 ring-amber-400/40 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <CalendarCheck2 className="w-4 h-4" />
            <span>استمارات المواقف اليومية (حسب التاريخ)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
              {dailySituationTransactions.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-sub-time-permissions"
            onClick={() => setActiveTab('time-permissions')}
            className={`py-2 px-3 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'time-permissions'
                ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-stone-950 shadow-xs ring-1 ring-amber-400/50'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>قسم الإجازات والساعات الزمنية</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-stone-700 text-amber-900 dark:text-amber-300 font-bold">
              {allTimePermissions.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-sub-leaves-register"
            onClick={() => setActiveTab('leaves')}
            className={`py-2 px-3 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'leaves'
                ? 'bg-emerald-700 text-white shadow-xs ring-1 ring-emerald-400/50'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>سجل الإجازات الاعتيادية والإيفادات</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-stone-700 text-emerald-900 dark:text-emerald-300 font-bold">
              {allLeavesAndShifts.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: DAILY SITUATION FORMS (BY DATE) */}
      {activeTab === 'forms' && (
        <div className="space-y-4">
          {/* Search & Date Filters Bar */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في المواقف اليومية (اسم منتسب، رقم كتاب، تاريخ، تفاصيل)..."
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-stone-500 dark:text-stone-400 font-medium">تصفية التاريخ:</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                <select
                  value={selectedDateFilter}
                  onChange={(e) => setSelectedDateFilter(e.target.value)}
                  className="bg-transparent font-bold text-stone-900 dark:text-stone-100 outline-hidden cursor-pointer"
                >
                  <option value="">كافة التواريخ ({dailySituationTransactions.length})</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDateFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedDateFilter('')}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline px-1 cursor-pointer"
                >
                  إلغاء التصفية
                </button>
              )}
            </div>
          </div>

          {/* Forms List */}
          {filteredSituations.length === 0 ? (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center shadow-xs">
              <CalendarCheck2 className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mb-1">
                لا توجد استمارات موقف يومي مسجلة تطابق البحث
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto mb-4">
                يمكنك إدخال استمارة الموقف اليومي لمنتسبي المركز وتوثيق كافة الإجازات والساعات الزمنية والإيفادات.
              </p>
              <button
                type="button"
                onClick={onOpenNewDailySituation}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold hover:bg-stone-800 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تنظيم موقف يومي جديد</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSituations.map((tr) => {
                const data: DailySituationData | undefined = tr.dailySituationData;
                const dateStr = data?.situationDate || tr.date;

                const permLeaves = data?.permanentLeaves || [];
                const permTimes = data?.permanentTimePermissions || [];
                const permShifts = data?.permanentShiftChanges || [];
                const tempLeaves = data?.temporaryLeaves || [];
                const tempTimes = data?.temporaryTimePermissions || [];
                const tempShifts = data?.temporaryShiftChanges || [];

                return (
                  <div
                    key={tr.id}
                    className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs hover:shadow-md transition-all overflow-hidden"
                  >
                    {/* Header Row */}
                    <div className="p-4 sm:p-5 border-b border-stone-100 dark:border-stone-800/80 bg-stone-50/70 dark:bg-stone-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-2xs">
                          <CalendarCheck2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                              {tr.subject || `الموقف اليومي لمنتسبي المركز بتاريخ ${dateStr}`}
                            </h3>
                            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300/60">
                              بتاريخ: {dateStr}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400 mt-1 flex-wrap">
                            <span>العدد: <strong className="font-mono text-stone-700 dark:text-stone-300">{tr.number}</strong></span>
                            <span>•</span>
                            <span>القيد: <strong className="font-mono text-stone-700 dark:text-stone-300">{tr.sequence}</strong></span>
                            <span>•</span>
                            <span>الجهة: {data?.departmentName || tr.entity || 'مركز الدراسات الافريقية'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setActivePreviewDoc(tr)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold hover:bg-stone-800 dark:hover:bg-amber-300 transition-colors shadow-2xs cursor-pointer active:scale-95"
                          title="عرض الاستمارة الرسمية الكاملة المعتمدة والطباعة (طراز 9.jpg)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>عرض الاستمارة الرسمية والطباعة</span>
                        </button>

                        {onSelectTransaction && (
                          <button
                            type="button"
                            onClick={() => onSelectTransaction(tr)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-100 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors cursor-pointer"
                            title="عرض التفاصيل في سجل المعاملات"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>تفاصيل المعاملة</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick Breakdown Grid of Entries with Clickable Employee Names */}
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {/* 1. Time Permissions Section */}
                        <div className="p-3 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-800/40 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-300">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              الساعات الزمنية (إذن خروج)
                            </span>
                            <span className="font-mono text-[11px] px-2 py-0.2 rounded-full bg-amber-100 dark:bg-amber-900/60">
                              {permTimes.length + tempTimes.length} قيود
                            </span>
                          </div>

                          {permTimes.length + tempTimes.length === 0 ? (
                            <p className="text-[11px] text-stone-400">لا توجد ساعات زمنية مسجلة لهذا اليوم</p>
                          ) : (
                            <div className="space-y-1 max-h-36 overflow-y-auto">
                              {[...permTimes, ...tempTimes].map((e, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-xs bg-white dark:bg-stone-800/80 p-2 rounded-lg border border-stone-200/60 dark:border-stone-700/60"
                                >
                                  <button
                                    type="button"
                                    onClick={() => onNavigate?.({ view: 'employees', employeeName: e.employeeName })}
                                    className="font-bold text-stone-800 dark:text-stone-200 hover:text-amber-600 dark:hover:text-amber-400 text-right cursor-pointer"
                                    title="الانتقال إلى إضبارة المنتسب"
                                  >
                                    👤 {e.employeeName} ↗
                                  </button>
                                  <span className="text-[11px] text-amber-800 dark:text-amber-300 font-mono bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                                    {e.details}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Leaves & Shifts Section */}
                        <div className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/70 dark:border-emerald-800/40 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-300">
                            <span className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-emerald-600" />
                              الإجازات الاعتيادية والمرضية والتحويل
                            </span>
                            <span className="font-mono text-[11px] px-2 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                              {permLeaves.length + tempLeaves.length + permShifts.length + tempShifts.length} قيود
                            </span>
                          </div>

                          {permLeaves.length + tempLeaves.length + permShifts.length + tempShifts.length === 0 ? (
                            <p className="text-[11px] text-stone-400">لا توجد إجازات مسجلة لهذا اليوم</p>
                          ) : (
                            <div className="space-y-1 max-h-36 overflow-y-auto">
                              {[...permLeaves, ...tempLeaves, ...permShifts, ...tempShifts].map((e, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-xs bg-white dark:bg-stone-800/80 p-2 rounded-lg border border-stone-200/60 dark:border-stone-700/60"
                                >
                                  <button
                                    type="button"
                                    onClick={() => onNavigate?.({ view: 'employees', employeeName: e.employeeName })}
                                    className="font-bold text-stone-800 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 text-right cursor-pointer"
                                    title="الانتقال إلى إضبارة المنتسب"
                                  >
                                    👤 {e.employeeName} ↗
                                  </button>
                                  <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                                    {e.details}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPREHENSIVE TIME PERMISSIONS REGISTER */}
      {activeTab === 'time-permissions' && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>سجل الإجازات والساعات الزمنية الشامل للمنتسبين</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                يعرض كافة الساعات الزمنية وإذن الخروج المسجلة في استمارات الموقف مع التواريخ والمدد من وإلى
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
              إجمالي الساعات الزمنية: {allTimePermissions.length} إذن
            </span>
          </div>

          {allTimePermissions.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              لا توجد ساعات زمنية مسجلة حالياً
            </div>
          ) : (
            <div className="space-y-2">
              {allTimePermissions.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-white dark:bg-stone-800/60 flex flex-wrap items-center justify-between gap-2.5 hover:border-amber-400 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onNavigate?.({ view: 'employees', employeeName: item.entry.employeeName })}
                      className="font-bold text-xs text-stone-900 dark:text-stone-100 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                      title="الانتقال إلى إضبارة المنتسب"
                    >
                      👤 {item.entry.employeeName} ↗
                    </button>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium">
                      نوع التعيين: {item.categoryType}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300/60">
                      ⏰ {item.entry.details}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-stone-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      تاريخ الموقف: <strong>{item.situationDate}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate?.({ view: 'transactions', searchTerm: item.docNumber })}
                      className="text-amber-600 hover:underline text-[11px] font-mono cursor-pointer"
                    >
                      رقم الموقف: {item.docNumber}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPREHENSIVE LEAVES & SHIFTS REGISTER */}
      {activeTab === 'leaves' && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>سجل الإجازات الاعتيادية والمرضية والتحويل والإيفادات</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                يعرض كافة الإجازات اليومية المسجلة في استمارات الموقف مع التواريخ والمدد
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
              إجمالي القيود: {allLeavesAndShifts.length}
            </span>
          </div>

          {allLeavesAndShifts.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              لا توجد إجازات مسجلة حالياً
            </div>
          ) : (
            <div className="space-y-2">
              {allLeavesAndShifts.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-white dark:bg-stone-800/60 flex flex-wrap items-center justify-between gap-2.5 hover:border-emerald-400 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onNavigate?.({ view: 'employees', employeeName: item.entry.employeeName })}
                      className="font-bold text-xs text-stone-900 dark:text-stone-100 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                      title="الانتقال إلى إضبارة المنتسب"
                    >
                      👤 {item.entry.employeeName} ↗
                    </button>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium">
                      التصنيف: {item.kind}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300/60">
                      📄 {item.entry.details}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-stone-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      بتاريخ: <strong>{item.situationDate}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate?.({ view: 'transactions', searchTerm: item.docNumber })}
                      className="text-emerald-600 hover:underline text-[11px] font-mono cursor-pointer"
                    >
                      رقم الموقف: {item.docNumber}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Official Sheet Printable Modal */}
      {activePreviewDoc && (
        <DailySituationDocumentModal
          transaction={activePreviewDoc}
          onClose={() => setActivePreviewDoc(null)}
          onViewAttachment={onViewAttachment}
        />
      )}
    </div>
  );
};
