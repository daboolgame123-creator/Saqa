import React, { useState, useMemo } from 'react';
import { 
  Search, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
  Building2,
  User,
  Calendar,
  FileText,
  Eye, 
  Paperclip, 
  AlertCircle,
  Bell,
  CheckCheck,
  Check,
  Sparkles,
  LayoutList,
  Table,
  Edit3,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { 
  Transaction, 
  TransactionStatus, 
  TransactionCategory, 
  TransactionDirection, 
  TransactionPriority, 
  UserRole, 
  NavigationTarget, 
  ACCESS_SCOPE_OPTIONS, 
  roleHasPermission 
} from '../../types';
import { splitEmployeeNames } from '../../utils/employeeUtils';

interface TransactionsListProps {
  transactions: Transaction[];
  onSelectTransaction: (transaction: Transaction) => void;
  onToggleReadStatus?: (id: string, e?: React.MouseEvent) => void;
  onMarkAllAsRead?: () => void;
  onUpdateStatus: (id: string, status: TransactionStatus) => void;
  onOpenNewModal: () => void;
  userRole?: UserRole;
  onViewAttachmentDirectly?: (transaction: Transaction, attachmentIndex?: number) => void;
  onSaveDirective?: (transactionId: string, directiveText: string, actionRequired: boolean) => void;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onNavigateToStudio?: () => void;
  onNavigate?: (target: NavigationTarget) => void;
  navigationTarget?: NavigationTarget | null;
}

export const TransactionsList: React.FC<TransactionsListProps> = ({
  transactions,
  onSelectTransaction,
  onToggleReadStatus,
  onMarkAllAsRead,
  onUpdateStatus,
  onOpenNewModal,
  userRole = 'director',
  onViewAttachmentDirectly,
  onSaveDirective,
  onEditTransaction,
  onDeleteTransaction,
  onNavigateToStudio,
  onNavigate,
  navigationTarget,
}) => {
  // 1. General search input
  const [searchTerm, setSearchTerm] = useState('');

  // Layout View Mode: Vertical (بالطول) by default as requested, with table option
  const [viewMode, setViewMode] = useState<'vertical' | 'table'>('vertical');

  // 2. Unread filter toggle (dedicated for the Director)
  const [unreadOnly, setUnreadOnly] = useState(false);

  // 3. Collapsible state for Advanced / Special Search
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // 4. Optional specific filters (none are mandatory)
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');
  const [employeeFilter, setEmployeeFilter] = useState<string>('');
  const [subTypeFilter, setSubTypeFilter] = useState<string>('الكل');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [directionFilter, setDirectionFilter] = useState<string>('الكل');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [priorityFilter, setPriorityFilter] = useState<string>('الكل');

  // Directive editing state on cards
  const [activeDirectiveCardId, setActiveDirectiveCardId] = useState<string | null>(null);
  const [customDirectiveText, setCustomDirectiveText] = useState<string>('');
  const [directiveActionRequired, setDirectiveActionRequired] = useState<boolean>(false);

  // Deletion state for transactions in Archivist mode
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // Listen to deep navigation targets (Deep Linking requested by Director)
  React.useEffect(() => {
    if (!navigationTarget) return;
    if (navigationTarget.direction) {
      setDirectionFilter(navigationTarget.direction);
    }
    if (navigationTarget.category) {
      setCategoryFilter(navigationTarget.category);
    }
    if (navigationTarget.subType) {
      setSubTypeFilter(navigationTarget.subType);
    }
    if (navigationTarget.searchTerm) {
      setSearchTerm(navigationTarget.searchTerm);
    }
    if (navigationTarget.employeeName) {
      setEmployeeFilter(navigationTarget.employeeName);
    }
  }, [navigationTarget]);

  const handleQuickDirective = (transactionId: string, text: string, actionReq: boolean = false) => {
    if (onSaveDirective) {
      onSaveDirective(transactionId, text, actionReq);
      setActiveDirectiveCardId(null);
      setCustomDirectiveText('');
      setDirectiveActionRequired(false);
    }
  };

  const handleSaveCustomDirective = (transactionId: string) => {
    if (customDirectiveText.trim() && onSaveDirective) {
      onSaveDirective(transactionId, customDirectiveText.trim(), directiveActionRequired);
      setActiveDirectiveCardId(null);
      setCustomDirectiveText('');
      setDirectiveActionRequired(false);
    }
  };

  // Count unread transactions total
  const totalUnreadCount = useMemo(() => {
    return transactions.filter((t) => !t.isRead).length;
  }, [transactions]);

  // Extract unique available employees and subTypes dynamically
  const uniqueEmployees = useMemo(() => {
    const names = new Set<string>();
    transactions.forEach((t) => {
      if (t.employeeName?.trim()) names.add(t.employeeName.trim());
    });
    return Array.from(names);
  }, [transactions]);

  const uniqueSubTypes = useMemo(() => {
    const types = new Set<string>();
    transactions.forEach((t) => {
      if (t.subType?.trim()) types.add(t.subType.trim());
    });
    return Array.from(types);
  }, [transactions]);

  // Count active advanced/special filters
  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (categoryFilter !== 'الكل') count++;
    if (employeeFilter.trim() !== '') count++;
    if (subTypeFilter !== 'الكل' && subTypeFilter.trim() !== '') count++;
    if (dateFilter.trim() !== '') count++;
    if (directionFilter !== 'الكل') count++;
    if (statusFilter !== 'الكل') count++;
    if (priorityFilter !== 'الكل') count++;
    return count;
  }, [categoryFilter, employeeFilter, subTypeFilter, dateFilter, directionFilter, statusFilter, priorityFilter]);

  const handleResetAdvanced = () => {
    setCategoryFilter('الكل');
    setEmployeeFilter('');
    setSubTypeFilter('الكل');
    setDateFilter('');
    setDirectionFilter('الكل');
    setStatusFilter('الكل');
    setPriorityFilter('الكل');
  };

  const handleResetAll = () => {
    setSearchTerm('');
    setUnreadOnly(false);
    handleResetAdvanced();
  };

  // Main filtered transactions computation
  const filteredTransactions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return transactions.filter((item) => {
      // 0. Unread Only Filter
      if (unreadOnly && item.isRead) {
        return false;
      }

      // 1. General search across everything naturally
      const matchesGeneral =
        query === '' ||
        item.number.toLowerCase().includes(query) ||
        item.sequence.toLowerCase().includes(query) ||
        item.subject.toLowerCase().includes(query) ||
        item.entity.toLowerCase().includes(query) ||
        item.subType.toLowerCase().includes(query) ||
        (item.employeeName && item.employeeName.toLowerCase().includes(query)) ||
        item.date.toLowerCase().includes(query) ||
        (item.notes && item.notes.toLowerCase().includes(query)) ||
        (item.specificDetails?.purpose && item.specificDetails.purpose.toLowerCase().includes(query)) ||
        (item.specificDetails?.destination && item.specificDetails.destination.toLowerCase().includes(query)) ||
        (item.specificDetails?.vehicle && item.specificDetails.vehicle.toLowerCase().includes(query));

      // 2. Optional specific filters (independent and non-mandatory)
      const matchesCategory =
        categoryFilter === 'الكل' || item.category === categoryFilter;

      const matchesEmployee =
        employeeFilter.trim() === '' ||
        (item.employeeName &&
          item.employeeName.toLowerCase().includes(employeeFilter.trim().toLowerCase()));

      const matchesSubType =
        subTypeFilter === 'الكل' ||
        subTypeFilter.trim() === '' ||
        item.subType.toLowerCase().includes(subTypeFilter.trim().toLowerCase());

      const matchesDate =
        dateFilter.trim() === '' || item.date.includes(dateFilter.trim());

      const matchesDirection =
        directionFilter === 'الكل' || item.direction === directionFilter;

      const matchesStatus =
        statusFilter === 'الكل' || item.status === statusFilter;

      const matchesPriority =
        priorityFilter === 'الكل' || item.priority === priorityFilter;

      return (
        matchesGeneral &&
        matchesCategory &&
        matchesEmployee &&
        matchesSubType &&
        matchesDate &&
        matchesDirection &&
        matchesStatus &&
        matchesPriority
      );
    });
  }, [
    transactions,
    searchTerm,
    unreadOnly,
    categoryFilter,
    employeeFilter,
    subTypeFilter,
    dateFilter,
    directionFilter,
    statusFilter,
    priorityFilter,
  ]);

  return (
    <div className="space-y-4">
      {/* Active Persona Banner for Employee Role */}
      {userRole === 'employee' && (
        <div className="bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-emerald-950 dark:text-emerald-200">
                أنت مسجل حالياً بحساب المنتسب: د. أمير إبراهيم علي حسن (باحث / تدريسي)
              </p>
              <p className="text-emerald-700 dark:text-emerald-400 text-[11px] mt-0.5">
                المعاملات والكتب الإدارية المعروضة أدناه مفلترة تلقائياً وفق نطاق الصلاحيات والخصوصية (الكتب العامة للمنتسبين، والكتب والقرارات الخاصة بك بالاسم).
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto inline-flex items-center gap-1 font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/60 px-2.5 py-1 rounded-md text-[11px] border border-emerald-300/60">
            صلاحية: منتسب (اطلاع فقط)
          </span>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 shadow-xs space-y-3.5">
        {/* Main Row: Single Simple Search Box + "بحث متقدم / خاص ⚙️" Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* 1. Simple Natural General Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="search-transactions"
              placeholder="ابحث بشكل مباشر في كل شيء (العدد، الجهة، المضمون، اسم المنتسب، نوع المعاملة...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-14 py-2.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs sm:text-sm bg-stone-50/50 dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-750 text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:ring-2 focus:ring-amber-500 outline-hidden transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 bg-stone-200/60 dark:bg-stone-700 hover:bg-stone-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                مسح
              </button>
            )}
          </div>

          {/* 2. Optional "بحث متقدم / خاص ⚙️" Button */}
          <button
            type="button"
            id="btn-advanced-search"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
              isAdvancedOpen
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs'
                : activeAdvancedCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/80'
                : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
            }`}
          >
            <span>بحث متقدم / خاص ⚙️</span>
            {activeAdvancedCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {activeAdvancedCount}
              </span>
            )}
            {isAdvancedOpen ? (
              <ChevronUp className="w-3.5 h-3.5 opacity-75" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 opacity-75" />
            )}
          </button>

          {/* Reset all button if search or active filters exist */}
          {(searchTerm || unreadOnly || activeAdvancedCount > 0) && (
            <button
              type="button"
              id="btn-reset-all-filters"
              onClick={handleResetAll}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              title="تفريغ وإلغاء جميع الفلاتر والبحث"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تفريغ</span>
            </button>
          )}
        </div>

        {/* 3. Collapsible Optional Filters Panel (Non-mandatory & fully flexible) */}
        {isAdvancedOpen && (
          <div 
            id="advanced-filters-panel"
            className="p-4 rounded-xl bg-stone-50/90 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-3.5 transition-all animate-fadeIn"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 dark:border-stone-700/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  لوحة الفلاتر الخاصة (اختيارية بالكامل)
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 bg-stone-200/60 dark:bg-stone-700 px-2 py-0.5 rounded-md">
                  اختر أي حقل تريده دون الحاجة لتحديد الباقي
                </span>
              </div>

              {activeAdvancedCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetAdvanced}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> تفريغ خيارات البحث الخاص
                </button>
              )}
            </div>

            {/* Flexible Filter Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Filter 1: Department / Category */}
              <div className="space-y-1.5">
                <label className="font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-stone-400" />
                  القسم المختص:
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={`w-full py-2 px-2.5 rounded-lg border text-xs outline-hidden transition-all cursor-pointer ${
                    categoryFilter !== 'الكل'
                      ? 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 font-bold text-amber-900 dark:text-amber-300 shadow-2xs'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200'
                  }`}
                >
                  <option value="الكل">الكل (غير مقيد بقسم)</option>
                  <option value="إدارية">قسم الإدارية</option>
                  <option value="مالية">قسم المالية</option>
                  <option value="منتسبين">قسم شؤون المنتسبين</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              {/* Filter 2: Employee Name */}
              <div className="space-y-1.5">
                <label className="font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-stone-400" />
                  اسم المنتسب:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="employees-datalist"
                    placeholder="اكتب أو اختر اسم المنتسب..."
                    value={employeeFilter}
                    onChange={(e) => setEmployeeFilter(e.target.value)}
                    className={`w-full py-2 pr-2.5 pl-7 rounded-lg border text-xs outline-hidden transition-all ${
                      employeeFilter.trim() !== ''
                        ? 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 font-bold text-amber-900 dark:text-amber-300 shadow-2xs'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  />
                  <datalist id="employees-datalist">
                    {uniqueEmployees.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  {employeeFilter && (
                    <button
                      type="button"
                      onClick={() => setEmployeeFilter('')}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter 3: SubType */}
              <div className="space-y-1.5">
                <label className="font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-stone-400" />
                  نوع المعاملة:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="subtypes-datalist"
                    placeholder="مثل: إيفاد، إجازة، صرف..."
                    value={subTypeFilter === 'الكل' ? '' : subTypeFilter}
                    onChange={(e) => setSubTypeFilter(e.target.value.trim() === '' ? 'الكل' : e.target.value)}
                    className={`w-full py-2 pr-2.5 pl-7 rounded-lg border text-xs outline-hidden transition-all ${
                      subTypeFilter !== 'الكل' && subTypeFilter !== ''
                        ? 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 font-bold text-amber-900 dark:text-amber-300 shadow-2xs'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  />
                  <datalist id="subtypes-datalist">
                    {uniqueSubTypes.map((type) => (
                      <option key={type} value={type} />
                    ))}
                    <option value="إيفاد" />
                    <option value="إجازة اعتيادية" />
                    <option value="إجازة مرضية" />
                    <option value="صرف مستحقات" />
                    <option value="مباشرة" />
                    <option value="شكر وتقدير" />
                    <option value="ترفيع وعلاوة" />
                    <option value="طلب شراء وتجهيز" />
                  </datalist>
                  {subTypeFilter !== 'الكل' && subTypeFilter !== '' && (
                    <button
                      type="button"
                      onClick={() => setSubTypeFilter('الكل')}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter 4: Date Filter */}
              <div className="space-y-1.5">
                <label className="font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" />
                  التاريخ المحدد:
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className={`w-full py-2 pr-2.5 pl-7 rounded-lg border text-xs outline-hidden transition-all ${
                      dateFilter
                        ? 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 font-bold text-amber-900 dark:text-amber-300 shadow-2xs'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200'
                    }`}
                  />
                  {dateFilter && (
                    <button
                      type="button"
                      onClick={() => setDateFilter('')}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Optional Toggles: Direction & Status */}
            <div className="pt-2 border-t border-stone-200/70 dark:border-stone-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Direction */}
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500 dark:text-stone-400 font-medium text-[11px]">حركة الكتاب:</span>
                  <div className="inline-flex rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-0.5">
                    {['الكل', 'صادر', 'وارد', 'داخلي'].map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setDirectionFilter(dir)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                          directionFilter === dir
                            ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 font-semibold'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                        }`}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500 dark:text-stone-400 font-medium text-[11px]">حالة الإنجاز:</span>
                  <div className="inline-flex rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-0.5">
                    {['الكل', 'جديد', 'قيد الإنجاز', 'مكتمل'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                          statusFilter === st
                            ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 font-semibold'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority */}
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500 dark:text-stone-400 font-medium text-[11px]">درجة الأسبقية:</span>
                  <div className="inline-flex rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-0.5">
                    {['الكل', 'عاجل جداً', 'هام', 'سري', 'عادي'].map((pr) => (
                      <button
                        key={pr}
                        type="button"
                        onClick={() => setPriorityFilter(pr)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                          priorityFilter === pr
                            ? pr === 'عاجل جداً'
                              ? 'bg-rose-600 text-white font-bold shadow-2xs'
                              : pr === 'هام'
                              ? 'bg-amber-600 text-white font-bold shadow-2xs'
                              : pr === 'سري'
                              ? 'bg-purple-700 text-white font-bold shadow-2xs'
                              : 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 font-bold shadow-2xs'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                        }`}
                      >
                        {pr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAdvancedOpen(false)}
                className="text-[11px] text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 font-medium px-2.5 py-1 rounded bg-stone-200/60 dark:bg-stone-700 transition-colors"
              >
                إخفاء لوحة الفلاتر
              </button>
            </div>
          </div>
        )}

        {/* Quick Department Buttons Row + Active Filter Chips & Counter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-stone-800 text-xs">
          {/* Quick Department Selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-stone-400 dark:text-stone-500 font-medium text-[11px]">القسم:</span>
            <div className="inline-flex rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 p-0.5">
              {[
                { label: 'الكل', value: 'الكل' },
                { label: 'قسم الإدارية', value: 'إدارية' },
                { label: 'قسم المالية', value: 'مالية' },
                { label: 'قسم المنتسبين', value: 'منتسبين' },
              ].map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategoryFilter(cat.value)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    categoryFilter === cat.value
                      ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results counter and active tags */}
          <div className="flex flex-wrap items-center gap-2 mr-auto">
            {unreadOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 text-[11px] font-bold border border-rose-200">
                الكتب غير المقروءة فقط 🔴
                <button type="button" onClick={() => setUnreadOnly(false)} className="hover:text-rose-700">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {categoryFilter !== 'الكل' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/70 text-amber-900 text-[11px] font-medium">
                قسم: {categoryFilter}
                <button type="button" onClick={() => setCategoryFilter('الكل')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {employeeFilter.trim() !== '' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100/70 text-emerald-900 text-[11px] font-medium">
                المنتسب: {employeeFilter}
                <button type="button" onClick={() => setEmployeeFilter('')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {subTypeFilter !== 'الكل' && subTypeFilter.trim() !== '' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100/70 text-blue-900 text-[11px] font-medium">
                نوع: {subTypeFilter}
                <button type="button" onClick={() => setSubTypeFilter('الكل')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {dateFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100/70 text-purple-900 text-[11px] font-medium">
                التاريخ: {dateFilter}
                <button type="button" onClick={() => setDateFilter('')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {directionFilter !== 'الكل' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-200 text-stone-800 text-[11px] font-medium">
                حركة: {directionFilter}
                <button type="button" onClick={() => setDirectionFilter('الكل')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {statusFilter !== 'الكل' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-200 text-stone-800 text-[11px] font-medium">
                حالة: {statusFilter}
                <button type="button" onClick={() => setStatusFilter('الكل')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {priorityFilter !== 'الكل' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                priorityFilter === 'عاجل جداً'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : priorityFilter === 'هام'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : priorityFilter === 'سري'
                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                  : 'bg-stone-200 text-stone-800'
              }`}>
                أسبقية: {priorityFilter}
                <button type="button" onClick={() => setPriorityFilter('الكل')} className="hover:text-rose-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <span className="text-[11px] text-stone-500 dark:text-stone-400 whitespace-nowrap">
              النتائج: <strong className="text-stone-800 dark:text-stone-200 font-bold">{filteredTransactions.length}</strong> معاملة
            </span>
          </div>
        </div>
      </div>

      {/* Transactions Section Header with Layout View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <span>سجل المعاملات والكتب الرسمية</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              {filteredTransactions.length}
            </span>
          </h3>
          {unreadOnly && (
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
              (غير المقروء فقط)
            </span>
          )}
        </div>

        {/* View Layout Switcher (Default: Vertical بالطول) */}
        <div className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('vertical')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              viewMode === 'vertical'
                ? 'bg-stone-900 dark:bg-amber-400 text-amber-300 dark:text-stone-950 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/50 dark:hover:bg-stone-700/50'
            }`}
            title="عرض سجل المعاملات بشكل بطاقات طولية منظمة ومريحة للقراءة"
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>عرض طولي (بطاقات عمودية)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-stone-900 dark:bg-amber-400 text-amber-300 dark:text-stone-950 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/50 dark:hover:bg-stone-700/50'
            }`}
            title="عرض سجل المعاملات على شكل جدول أفقي كلاسيكي"
          >
            <Table className="w-3.5 h-3.5" />
            <span>عرض جدولي (أفقي)</span>
          </button>
        </div>
      </div>

      {/* Transactions List Container (Vertical or Table) */}
      {filteredTransactions.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs text-center py-12 px-4 space-y-3">
          <AlertCircle className="w-10 h-10 text-stone-300 dark:text-stone-600 mx-auto" />
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">لا توجد معاملات مطابقة للبحث</h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {unreadOnly ? 'لا توجد كتب غير مقروءة حالياً، كافة المعاملات تم الاطلاع عليها.' : 'جرّب تغيير كلمات البحث أو إعادة تعيين الفلاتر'}
          </p>
          {unreadOnly && (
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 cursor-pointer"
            >
              عرض كافة المعاملات
            </button>
          )}
        </div>
      ) : viewMode === 'vertical' ? (
        /* Vertical Cards Feed (بالطول) */
        <div className="space-y-3.5">
          {filteredTransactions.map((tr) => {
            const isUnread = !tr.isRead;

            return (
              <div
                key={tr.id}
                onClick={() => onSelectTransaction(tr)}
                className={`rounded-xl border transition-all cursor-pointer overflow-hidden p-4 sm:p-5 bg-white dark:bg-stone-900 shadow-xs hover:shadow-md ${
                  isUnread
                    ? 'border-amber-400 dark:border-amber-500/80 bg-amber-50/20 dark:bg-amber-950/20 border-r-6 border-r-rose-500 ring-1 ring-amber-300/30'
                    : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                {/* Card Top Header: Sequence, Number, Badges, Read Indicator, Date */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-stone-100 dark:border-stone-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                      #{tr.sequence}
                    </span>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-stone-900 dark:bg-amber-400 text-amber-300 dark:text-stone-950">
                      العدد: {tr.number}
                    </span>

                    {/* Interactive Direction Badge (Deep Linking requested by Director) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDirectionFilter(tr.direction);
                      }}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                        tr.direction === 'صادر'
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                          : tr.direction === 'وارد'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                      }`}
                      title={`تصفية والاطلاع المباشر على كتب ال${tr.direction}`}
                    >
                      {tr.direction} ↗
                    </button>

                    {/* Interactive Department Badge */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tr.category === 'منتسبين' && onNavigate) {
                          onNavigate({ view: 'employees' });
                        } else {
                          setCategoryFilter(tr.category);
                        }
                      }}
                      className="text-[11px] font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 cursor-pointer transition-colors"
                      title={tr.category === 'منتسبين' ? 'الانتقال مباشرة إلى سجل المنتسبين والباحثين' : `تصفية حسب قسم ${tr.category}`}
                    >
                      قسم {tr.category} ↗
                    </button>

                    {/* Interactive Subtype Badge (Daily Situation / Mission / Badge / etc) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((tr.isDailySituation || tr.subType === 'موقف يومي') && onNavigate) {
                          onNavigate({ view: 'daily-situations' });
                        } else {
                          setSubTypeFilter(tr.subType);
                        }
                      }}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 cursor-pointer transition-colors"
                      title={tr.subType === 'موقف يومي' || tr.isDailySituation ? 'الانتقال مباشرة إلى قسم الموقف والتقرير اليومي' : `تصفية حسب نوع المعاملة: ${tr.subType}`}
                    >
                      {tr.subType} ↗
                    </button>
                    {tr.priority && tr.priority !== 'عادي' && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        tr.priority === 'عاجل جداً'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 animate-pulse'
                          : tr.priority === 'هام'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          : 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                      }`}>
                        {tr.priority === 'عاجل جداً' ? '🚨 عاجل جداً' : tr.priority === 'هام' ? '⚠️ هام' : '🔒 سري وخاص'}
                      </span>
                    )}

                    {/* Access Scope / Privacy Badge */}
                    {tr.visibility && ACCESS_SCOPE_OPTIONS[tr.visibility] && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border ${ACCESS_SCOPE_OPTIONS[tr.visibility].badgeColor}`}
                        title={ACCESS_SCOPE_OPTIONS[tr.visibility].description}
                      >
                        {ACCESS_SCOPE_OPTIONS[tr.visibility].label}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Read / Unread Status Badge with quick action */}
                    <div onClick={(e) => e.stopPropagation()}>
                      {isUnread ? (
                        <button
                          type="button"
                          onClick={(e) => onToggleReadStatus?.(tr.id, e)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs hover:bg-rose-200 dark:hover:bg-rose-900/80 transition-all cursor-pointer"
                          title="كتاب جديد غير مقروء - انقر لتحديده كمقروء"
                        >
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                          <span>غير مقروء 🔴</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => onToggleReadStatus?.(tr.id, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                          title="تم الاطلاع - انقر للتبديل"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>تم الاطلاع ✓</span>
                        </button>
                      )}
                    </div>

                    <span className="text-xs text-stone-500 dark:text-stone-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      {tr.date}
                    </span>
                  </div>
                </div>

                {/* Subject & Details */}
                <div className="py-3.5 space-y-2.5">
                  <h4 
                    className={`text-sm sm:text-base leading-relaxed ${
                      isUnread ? 'font-bold text-stone-950 dark:text-stone-100' : 'font-semibold text-stone-900 dark:text-stone-200'
                    }`}
                  >
                    {tr.subject}
                  </h4>

                  {/* Metadata Grid with Clickable Entities & Employees (Deep Linking) */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchTerm(tr.entity);
                      }}
                      className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer transition-colors"
                      title={`البحث عن كافة معاملات: ${tr.entity}`}
                    >
                      <Building2 className="w-4 h-4 text-stone-400 shrink-0" />
                      <span className="text-stone-400 dark:text-stone-500">الجهة المرتبطة:</span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200 underline decoration-stone-300 underline-offset-2">{tr.entity} ↗</span>
                    </button>

                    {tr.employeeName && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {splitEmployeeNames(tr.employeeName).map((empName, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigate) {
                                onNavigate({ view: 'employees', employeeName: empName });
                              } else {
                                setEmployeeFilter(empName);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2.5 py-1 rounded-md border border-emerald-200/80 dark:border-emerald-800/80 cursor-pointer transition-colors"
                            title={`الانتقال مباشرة لإضبارة ${empName}`}
                          >
                            <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">المنتسب:</span>
                            <span className="font-bold">{empName} ↗</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {tr.specificDetails?.purpose && (
                      <div className="text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/80 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                        <span className="text-stone-400 dark:text-stone-500">الغرض: </span>
                        <span className="font-medium">{tr.specificDetails.purpose}</span>
                      </div>
                    )}
                    {tr.specificDetails?.destination && (
                      <div className="text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/80 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                        <span className="text-stone-400 dark:text-stone-500">الوجهة: </span>
                        <span className="font-medium">{tr.specificDetails.destination}</span>
                      </div>
                    )}
                    {tr.specificDetails?.vehicle && (
                      <div className="text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/80 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                        <span className="text-stone-400 dark:text-stone-500">العجلة: </span>
                        <span className="font-medium">{tr.specificDetails.vehicle}</span>
                      </div>
                    )}
                    {tr.specificDetails?.amount && (
                      <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 font-semibold">
                        <span className="text-stone-400 dark:text-stone-500">المبلغ: </span>
                        <span>{tr.specificDetails.amount}</span>
                      </div>
                    )}
                  </div>

                  {/* Attachments Strip - Direct Clickable to View Attachment Instantly */}
                  {tr.attachments && tr.attachments.length > 0 && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-300 text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700">
                        <Paperclip className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>المرفقات الممسوحة ({tr.attachments.length}):</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tr.attachments.slice(0, 5).map((att, i) => (
                          <button
                            key={att.id || i}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onViewAttachmentDirectly) {
                                onViewAttachmentDirectly(tr, i);
                              } else {
                                onSelectTransaction(tr);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-stone-50 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 hover:border-amber-400 dark:hover:border-amber-500 transition-all cursor-pointer group shadow-2xs"
                            title={`انقر لمعاينة ${att.name} (${att.type}) مباشرة`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 group-hover:scale-125 transition-transform"></span>
                            <span className="truncate max-w-[130px] font-medium group-hover:text-amber-950 dark:group-hover:text-amber-300">{att.name}</span>
                            <span className="text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/60 px-1.5 py-0.2 rounded text-[10px] font-bold">({att.type})</span>
                            <Eye className="w-3 h-3 text-stone-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 ml-0.5" />
                          </button>
                        ))}
                        {tr.attachments.length > 5 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onViewAttachmentDirectly) {
                                onViewAttachmentDirectly(tr, 0);
                              } else {
                                onSelectTransaction(tr);
                              }
                            }}
                            className="text-[11px] font-bold text-stone-600 dark:text-stone-300 hover:text-amber-900 dark:hover:text-amber-300 bg-stone-100 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-stone-700 px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-700 cursor-pointer"
                          >
                            +{tr.attachments.length - 5} أخرى (عرض الكل)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Director Directive Display Box */}
                  {tr.directorDirective && (
                    <div className="mt-2.5 p-3 rounded-xl bg-linear-to-r from-amber-50 to-orange-50/70 dark:from-amber-950/40 dark:to-stone-900 border border-amber-200/90 dark:border-amber-800/80 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5 shadow-2xs">
                      <span className="text-base leading-none shrink-0 mt-0.5">✍️</span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-amber-900 dark:text-amber-300">هامش وتوجيه السيد المدير:</span>
                          {tr.directorDirective.date && (
                            <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80 bg-amber-100/70 dark:bg-amber-900/60 px-2 py-0.5 rounded font-semibold">
                              {tr.directorDirective.date}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold leading-relaxed text-stone-900 dark:text-stone-100 bg-white/70 dark:bg-stone-800/80 p-2 rounded-lg border border-amber-200/60 dark:border-amber-800/60">
                          «{tr.directorDirective.text}»
                        </p>
                        {tr.directorDirective.actionRequired && (
                          <span className="inline-block text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                            مطلوب إجراء فوري ومتابعة من شعبة الذاتية
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer: Status control, Log timestamp & Full preview action */}
                <div className="border-t border-stone-100 dark:border-stone-800 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div 
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-stone-500 dark:text-stone-400 font-medium text-[11px]">حالة الإنجاز:</span>
                    {roleHasPermission(userRole, 'transactions.edit') ? (
                      <select
                        value={tr.status}
                        onChange={(e) => onUpdateStatus(tr.id, e.target.value as TransactionStatus)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border outline-hidden transition-colors cursor-pointer ${
                          tr.status === 'جديد'
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-bold'
                            : tr.status === 'قيد الإنجاز'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-bold'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold'
                        }`}
                      >
                        <option value="جديد">جديد</option>
                        <option value="قيد الإنجاز">قيد الإنجاز</option>
                        <option value="مكتمل">مكتمل</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                        tr.status === 'جديد'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-bold'
                          : tr.status === 'قيد الإنجاز'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-bold'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold'
                      }`}>
                        {tr.status}
                      </span>
                    )}

                    {tr.createdAt && (
                      <span className="text-stone-400 dark:text-stone-500 text-[11px] pr-2 border-r border-stone-200 dark:border-stone-700">
                        تاريخ الرفع: {tr.createdAt}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Archivist / Admin Edit & Delete Actions */}
                    {roleHasPermission(userRole, 'transactions.edit') && onEditTransaction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTransaction(tr);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 font-bold text-xs border border-amber-300 dark:border-amber-800 transition-colors shadow-2xs cursor-pointer active:scale-95"
                        title="تحرير المعاملة وإدارة المرفقات (إضافة، تعديل، حذف ملفات)"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                        <span>تحرير ومرفقات ✏️</span>
                      </button>
                    )}

                    {roleHasPermission(userRole, 'transactions.delete') && onDeleteTransaction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTransactionToDelete(tr);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                        title="حذف هذه المعاملة نهائياً من السجل"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>حذف</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tr.attachments && tr.attachments.length > 0 && onViewAttachmentDirectly) {
                          onViewAttachmentDirectly(tr, 0);
                        } else {
                          onSelectTransaction(tr);
                        }
                      }}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                        isUnread
                          ? 'bg-amber-400 hover:bg-amber-500 text-stone-950 ring-2 ring-amber-300'
                          : 'bg-stone-900 dark:bg-amber-400 hover:bg-stone-800 dark:hover:bg-amber-300 text-white dark:text-stone-950'
                      }`}
                      title="فتح صورة ومستند الكتاب والمرفقات مباشرة بحجم كامل"
                    >
                      <Eye className="w-4 h-4 text-amber-400 dark:text-stone-950" />
                      <span>معاينة والاطلاع الكامل على الكتب والمرفقات</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Classic Horizontal Table (بالعرض) */
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-stone-50/90 dark:bg-stone-800/90 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-semibold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">التسلسل</th>
                  <th className="py-3 px-4 whitespace-nowrap">حالة الاطلاع (المدير)</th>
                  <th className="py-3 px-4">العدد والتاريخ</th>
                  <th className="py-3 px-4">الجهة ونوع المعاملة</th>
                  <th className="py-3 px-4">المضمون والارتباط</th>
                  <th className="py-3 px-4 text-center">المرفقات</th>
                  <th className="py-3 px-4 text-center">حالة الإنجاز</th>
                  <th className="py-3 px-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {filteredTransactions.map((tr) => {
                  const isUnread = !tr.isRead;

                  return (
                    <tr
                      key={tr.id}
                      className={`transition-colors group cursor-pointer ${
                        isUnread 
                          ? 'bg-rose-50/30 dark:bg-rose-950/30 hover:bg-rose-50/70 dark:hover:bg-rose-950/50 border-r-4 border-r-rose-500 font-medium' 
                          : 'hover:bg-amber-50/40 dark:hover:bg-stone-800/60'
                      }`}
                      onClick={() => onSelectTransaction(tr)}
                    >
                      {/* Sequence */}
                      <td className="py-3.5 px-4 text-center text-stone-400 dark:text-stone-500 font-mono text-xs">
                        {tr.sequence}
                      </td>

                      {/* Read / Unread Status Indicator */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-0.5">
                          {isUnread ? (
                            <button
                              type="button"
                              onClick={(e) => onToggleReadStatus?.(tr.id, e)}
                              title="كتاب جديد غير مقروء - انقر لتحديده كمقروء"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs hover:bg-rose-200 dark:hover:bg-rose-900/80 transition-all cursor-pointer"
                            >
                              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                              <span>غير مقروء 🔴</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => onToggleReadStatus?.(tr.id, e)}
                              title="تم الاطلاع - انقر للتبديل"
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                            >
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>مقروء ✓</span>
                            </button>
                          )}
                          <span className="text-[10px] text-stone-400 dark:text-stone-500 pr-1">
                            {isUnread && tr.createdAt ? `رُفع: ${tr.createdAt}` : tr.readAt ? `اطّلع: ${tr.readAt}` : `تاريخ: ${tr.date}`}
                          </span>
                        </div>
                      </td>

                      {/* Number & Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-[11px] font-mono">
                            {tr.number}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDirectionFilter(tr.direction);
                            }}
                            className={`text-[10px] px-1.5 py-0.2 rounded font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                              tr.direction === 'صادر'
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800'
                                : tr.direction === 'وارد'
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800'
                                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                            }`}
                            title={`تصفية كتب ال${tr.direction}`}
                          >
                            {tr.direction} ↗
                          </button>
                          {tr.priority && tr.priority !== 'عادي' && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              tr.priority === 'عاجل جداً'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse'
                                : tr.priority === 'هام'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                            }`}>
                              {tr.priority}
                            </span>
                          )}
                          {tr.visibility && ACCESS_SCOPE_OPTIONS[tr.visibility] && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${ACCESS_SCOPE_OPTIONS[tr.visibility].badgeColor}`}
                              title={ACCESS_SCOPE_OPTIONS[tr.visibility].description}
                            >
                              {ACCESS_SCOPE_OPTIONS[tr.visibility].label}
                            </span>
                          )}
                        </div>
                        <div className="text-stone-400 dark:text-stone-500 text-[11px] mt-0.5">
                          {tr.date}
                        </div>
                      </td>

                      {/* Entity & Type */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSearchTerm(tr.entity);
                          }}
                          className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer text-right"
                          title={`البحث عن كافة معاملات: ${tr.entity}`}
                        >
                          <Building2 className="w-3 h-3 text-stone-400 shrink-0" />
                          <span className="underline decoration-stone-300">{tr.entity} ↗</span>
                        </button>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if ((tr.isDailySituation || tr.subType === 'موقف يومي') && onNavigate) {
                                onNavigate({ view: 'daily-situations' });
                              } else {
                                setSubTypeFilter(tr.subType);
                              }
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 font-medium cursor-pointer"
                            title={tr.subType === 'موقف يومي' ? 'الانتقال إلى الموقف اليومي' : `تصفية: ${tr.subType}`}
                          >
                            {tr.subType} ↗
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tr.category === 'منتسبين' && onNavigate) {
                                onNavigate({ view: 'employees' });
                              } else {
                                setCategoryFilter(tr.category);
                              }
                            }}
                            className="text-[10px] text-stone-400 dark:text-stone-500 hover:text-stone-700 cursor-pointer"
                            title={tr.category === 'منتسبين' ? 'الانتقال إلى سجل المنتسبين' : `تصفية قسم ${tr.category}`}
                          >
                            (قسم {tr.category} ↗)
                          </button>
                        </div>
                      </td>

                      {/* Subject & Employee */}
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                        <p className={`line-clamp-2 leading-relaxed ${isUnread ? 'text-stone-900 dark:text-stone-100 font-bold' : 'text-stone-800 dark:text-stone-200 font-medium'}`}>
                          {tr.subject}
                        </p>
                        {tr.directorDirective && (
                          <div className="mt-1 text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1">
                            <span>✍️</span>
                            <span className="font-bold">هامش المدير:</span>
                            <span className="truncate max-w-[200px]">{tr.directorDirective.text}</span>
                          </div>
                        )}
                        {tr.employeeName && (
                          <div className="mt-1 flex items-center gap-1 flex-wrap text-[11px]">
                            {splitEmployeeNames(tr.employeeName).map((empName, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onNavigate) {
                                    onNavigate({ view: 'employees', employeeName: empName });
                                  } else {
                                    setEmployeeFilter(empName);
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200/60 cursor-pointer"
                                title={`الانتقال لإضبارة ${empName}`}
                              >
                                <User className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{empName} ↗</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Attachments */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tr.attachments && tr.attachments.length > 0 && onViewAttachmentDirectly) {
                              onViewAttachmentDirectly(tr, 0);
                            } else {
                              onSelectTransaction(tr);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-amber-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 hover:text-amber-900 dark:hover:text-amber-200 text-[11px] font-medium transition-colors cursor-pointer border border-stone-200 dark:border-stone-700"
                          title="عرض المرفقات مباشرة"
                        >
                          <Paperclip className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>{tr.attachments.length} مرفق</span>
                        </button>
                      </td>

                      {/* Status with quick switcher */}
                      <td 
                        className="py-3.5 px-4 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {roleHasPermission(userRole, 'transactions.edit') ? (
                          <select
                            value={tr.status}
                            onChange={(e) => onUpdateStatus(tr.id, e.target.value as TransactionStatus)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border outline-hidden transition-colors cursor-pointer ${
                              tr.status === 'جديد'
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                : tr.status === 'قيد الإنجاز'
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            }`}
                          >
                            <option value="جديد">جديد</option>
                            <option value="قيد الإنجاز">قيد الإنجاز</option>
                            <option value="مكتمل">مكتمل</option>
                          </select>
                        ) : (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            tr.status === 'جديد'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : tr.status === 'قيد الإنجاز'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          }`}>
                            {tr.status}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {roleHasPermission(userRole, 'transactions.edit') && onEditTransaction && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTransaction(tr);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 font-bold text-[11px] border border-amber-300 dark:border-amber-800 transition-colors shadow-2xs cursor-pointer"
                              title="تحرير المعاملة والمرفقات"
                            >
                              <Edit3 className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                              <span>تحرير</span>
                            </button>
                          )}

                          {roleHasPermission(userRole, 'transactions.delete') && onDeleteTransaction && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransactionToDelete(tr);
                              }}
                              className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-[11px] border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                              title="حذف المعاملة"
                            >
                              <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tr.attachments && tr.attachments.length > 0 && onViewAttachmentDirectly) {
                                onViewAttachmentDirectly(tr, 0);
                              } else {
                                onSelectTransaction(tr);
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium text-[11px] cursor-pointer ${
                              isUnread
                                ? 'bg-amber-400 hover:bg-amber-500 text-stone-950 font-bold shadow-2xs'
                                : 'bg-stone-900 dark:bg-amber-400 hover:bg-stone-800 dark:hover:bg-amber-300 text-white dark:text-stone-950'
                            }`}
                            title="معاينة الكتاب والمرفقات مباشرة"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400 dark:text-stone-950" />
                            <span>معاينة واطلاع</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal for Transactions */}
      {transactionToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-rose-300 dark:border-rose-800 shadow-2xl p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">تأكيد حذف المعاملة بالكامل</h4>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">تحذير: هذا الحذف نهائي</p>
              </div>
            </div>

            <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed bg-rose-50/70 dark:bg-rose-950/40 p-3 rounded-lg border border-rose-200 dark:border-rose-800">
              هل أنت متأكد من رغبتك في حذف المعاملة بالكامل رقم قيد (<strong>#{transactionToDelete.sequence}</strong>) والعدد (<strong>{transactionToDelete.number}</strong>) بموضوع «<strong>{transactionToDelete.subject}</strong>» مع كافة مرفقاتها الممسوحة؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTransactionToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTransaction) {
                    onDeleteTransaction(transactionToDelete.id);
                  }
                  setTransactionToDelete(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                نعم، احذف المعاملة نهائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
