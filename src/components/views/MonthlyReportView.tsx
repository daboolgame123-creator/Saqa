import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  Calendar, 
  FolderTree, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Printer, 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign, 
  Briefcase, 
  Users,
  Eye,
  Search,
  Layers,
  HelpCircle
} from 'lucide-react';
import { Transaction, NavigationTarget } from '../../types';
import { splitEmployeeNames } from '../../utils/employeeUtils';

interface MonthlyReportViewProps {
  transactions: Transaction[];
  onSelectTransaction: (transaction: Transaction) => void;
  onNavigate?: (target: NavigationTarget) => void;
  onViewAttachmentDirectly?: (transaction: Transaction, attachmentIndex: number) => void;
}

const getArabicMonthName = (monthStr: string): string => {
  if (!monthStr || monthStr === 'all') return 'كافة الأشهر (السجل العام)';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const year = parts[0];
  const month = parts[1];

  const monthNames: Record<string, string> = {
    '01': 'كانون الثاني (يناير)',
    '02': 'شباط (فبراير)',
    '03': 'آذار (مارس)',
    '04': 'نيسان (أبريل)',
    '05': 'أيار (مايو)',
    '06': 'حزيران (يونيو)',
    '07': 'تموز (يوليو)',
    '08': 'آب (أغسطس)',
    '09': 'أيلول (سبتمبر)',
    '10': 'تشرين الأول (أكتوبر)',
    '11': 'تشرين الثاني (نوفمبر)',
    '12': 'كانون الأول (ديسمبر)',
  };

  return `${monthNames[month] || month} ${year}`;
};

export const MonthlyReportView: React.FC<MonthlyReportViewProps> = ({
  transactions,
  onSelectTransaction,
  onNavigate,
  onViewAttachmentDirectly,
}) => {
  // Dynamically extract all unique months present in transactions
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    // Add current month by default
    const nowMonth = new Date().toISOString().substring(0, 7);
    set.add(nowMonth);

    transactions.forEach((t) => {
      if (t.month && t.month.length === 7) {
        set.add(t.month);
      } else if (t.date && t.date.length >= 7) {
        set.add(t.date.substring(0, 7));
      }
    });

    return Array.from(set).sort().reverse();
  }, [transactions]);

  // Determine initial default month: the month of the latest transaction or current month
  const defaultMonth = useMemo(() => {
    if (transactions.length > 0) {
      const latest = transactions[0];
      const m = latest.month || latest.date?.substring(0, 7);
      if (m && m.length === 7) return m;
    }
    return availableMonths[0] || 'all';
  }, [transactions, availableMonths]);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [activeTab, setActiveTab] = useState<'all' | 'administrative' | 'financial' | 'personnel' | 'outgoing' | 'incoming' | 'other'>('all');
  const [reportSearch, setReportSearch] = useState('');

  // If new transactions are added in a different month, ensure selectedMonth stays valid or offers all
  useEffect(() => {
    if (selectedMonth !== 'all' && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(defaultMonth);
    }
  }, [availableMonths, selectedMonth, defaultMonth]);

  // Filter transactions by selected month (or all)
  const monthTransactions = useMemo(() => {
    if (selectedMonth === 'all') {
      return transactions;
    }
    return transactions.filter((t) => {
      const trMonth = t.month || t.date?.substring(0, 7);
      return trMonth === selectedMonth;
    });
  }, [transactions, selectedMonth]);

  // Groupings by section / category
  const administrativeTrs = useMemo(
    () => monthTransactions.filter((t) => t.category === 'إدارية'),
    [monthTransactions]
  );
  const financialTrs = useMemo(
    () => monthTransactions.filter((t) => t.category === 'مالية'),
    [monthTransactions]
  );
  // Personnel section: any transaction categorized as 'منتسبين' OR having an employeeName associated with it!
  const personnelTrs = useMemo(
    () => monthTransactions.filter((t) => t.category === 'منتسبين' || Boolean(t.employeeName && t.employeeName.trim())),
    [monthTransactions]
  );
  const outgoingTrs = useMemo(
    () => monthTransactions.filter((t) => t.direction === 'صادر'),
    [monthTransactions]
  );
  const incomingTrs = useMemo(
    () => monthTransactions.filter((t) => t.direction === 'وارد'),
    [monthTransactions]
  );
  const otherTrs = useMemo(
    () => monthTransactions.filter((t) => t.category === 'أخرى' || (!['إدارية', 'مالية', 'منتسبين'].includes(t.category) && !t.employeeName)),
    [monthTransactions]
  );

  // Counts & stats
  const total = monthTransactions.length;
  const completed = monthTransactions.filter((t) => t.status === 'مكتمل').length;
  const underReview = monthTransactions.filter((t) => t.status === 'قيد المراجعة').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Decide which list to show based on active tab
  const tabList = useMemo(() => {
    switch (activeTab) {
      case 'administrative':
        return { list: administrativeTrs, title: 'المعاملات الإدارية (إيفادات، تكاليف، أوامر...)' };
      case 'financial':
        return { list: financialTrs, title: 'المعاملات المالية (صرف مستحقات، سلف، موازنة...)' };
      case 'personnel':
        return { list: personnelTrs, title: 'معاملات شؤون المنتسبين والذاتية (إجازات، مباشرة، انفكاك، باجات...)' };
      case 'outgoing':
        return { list: outgoingTrs, title: 'الكتب الصادرة الرسمية من المركز' };
      case 'incoming':
        return { list: incomingTrs, title: 'الكتب الواردة الرسمية إلى المركز' };
      case 'other':
        return { list: otherTrs, title: 'المعاملات والكتب العامة الأخرى' };
      default:
        return { list: monthTransactions, title: 'كافة معاملات وكتب التقرير' };
    }
  }, [activeTab, administrativeTrs, financialTrs, personnelTrs, outgoingTrs, incomingTrs, otherTrs, monthTransactions]);

  // Apply search query within report
  const displayedList = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return tabList.list;
    return tabList.list.filter(
      (t) =>
        t.number.toLowerCase().includes(q) ||
        t.sequence.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.entity.toLowerCase().includes(q) ||
        t.subType.toLowerCase().includes(q) ||
        (t.employeeName && t.employeeName.toLowerCase().includes(q))
    );
  }, [tabList.list, reportSearch]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Top Controls Bar */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 flex items-center justify-center shadow-2xs">
            <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span>ملف التقرير الشهري المنظم</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 border border-amber-300/40">
                {selectedMonth === 'all' ? 'السجل العام الشامل' : getArabicMonthName(selectedMonth)}
              </span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              تحديث فوري مع كل معاملة جديدة تضاف لأي قسم (إدارية، مالية، منتسبين، صادر، وارد)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-end">
          {/* Dynamic Month Selector */}
          <div className="flex items-center gap-1.5 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs">
            <Calendar className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <span className="font-semibold text-stone-700 dark:text-stone-300">الشهر:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-stone-900 dark:text-stone-100 outline-hidden cursor-pointer"
            >
              <option value="all">كافة الأشهر ({transactions.length} معاملة إجمالية)</option>
              {availableMonths.map((m) => {
                const count = transactions.filter((t) => (t.month || t.date?.substring(0, 7)) === m).length;
                return (
                  <option key={m} value={m}>
                    {getArabicMonthName(m)} ({count} معاملة)
                  </option>
                );
              })}
            </select>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
            طباعة التقرير
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400 block mb-1">إجمالي المعاملات</span>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{total}</div>
          <span className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 block">
            {selectedMonth === 'all' ? 'كافة الفترات المسجلة' : `خلال ${getArabicMonthName(selectedMonth)}`}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 block mb-1">المعاملات المكتملة</span>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{completed}</div>
          <span className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 block">بنسبة إنجاز {completionRate}%</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 block mb-1">قيد المراجعة للمتابعة</span>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{underReview}</div>
          <span className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 block">
            تتطلب إجراءات ومتابعة
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs">
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 block mb-1">الكتب الصادرة والواردة (انقر للانتقال)</span>
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => onNavigate?.({ view: 'transactions', direction: 'صادر' })}
              className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              title="الانتقال المباشر لكتب الصادر"
            >
              {outgoingTrs.length} صادر ↗
            </button>
            <span className="text-stone-300 dark:text-stone-600">/</span>
            <button
              type="button"
              onClick={() => onNavigate?.({ view: 'transactions', direction: 'وارد' })}
              className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              title="الانتقال المباشر لكتب الوارد"
            >
              {incomingTrs.length} وارد ↗
            </button>
          </div>
          <span className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 block">حركة المراسلات الرسمية</span>
        </div>
      </div>

      {/* Interactive Dossier Tree Navigation (All requested departments & categories) */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            أقسام وأبواب التقرير الشهري:
          </h3>
          <span className="text-xs text-stone-400 dark:text-stone-500">
            انقر على أي قسم لفرز المعاملات المرتبطة به تلقائياً
          </span>
        </div>

        {/* Categories Tab Selector Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
          {/* 1. All */}
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-stone-400 dark:text-stone-900" />
                كافة الأقسام
              </span>
              <span className="text-[11px] font-mono">({total})</span>
            </div>
            <p className="text-[10px] opacity-80">السجل الإجمالي</p>
          </button>

          {/* 2. Administrative */}
          <button
            type="button"
            onClick={() => setActiveTab('administrative')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'administrative'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                الإدارية
              </span>
              <span className="text-[11px] font-mono">({administrativeTrs.length})</span>
            </div>
            <p className="text-[10px] opacity-80">إيفادات، تكاليف، أوامر</p>
          </button>

          {/* 3. Financial */}
          <button
            type="button"
            onClick={() => setActiveTab('financial')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'financial'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                المالية
              </span>
              <span className="text-[11px] font-mono">({financialTrs.length})</span>
            </div>
            <p className="text-[10px] opacity-80">صرف مستحقات، سلف</p>
          </button>

          {/* 4. Personnel (شؤون المنتسبين) */}
          <button
            type="button"
            onClick={() => setActiveTab('personnel')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'personnel'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-blue-500" />
                المنتسبين
              </span>
              <span className="text-[11px] font-mono">({personnelTrs.length})</span>
            </div>
            <p className="text-[10px] opacity-80">إجازات، مباشرة، انفكاك</p>
          </button>

          {/* 5. Outgoing */}
          <button
            type="button"
            onClick={() => setActiveTab('outgoing')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'outgoing'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500" />
                الصادر
              </span>
              <span className="text-[11px] font-mono">({outgoingTrs.length})</span>
            </div>
            <p className="text-[10px] opacity-80">الكتب الصادرة للخارج</p>
          </button>

          {/* 6. Incoming */}
          <button
            type="button"
            onClick={() => setActiveTab('incoming')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'incoming'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-amber-500" />
                الوارد
              </span>
              <span className="text-[11px] font-mono">({incomingTrs.length})</span>
            </div>
            <p className="text-[10px] opacity-80">الكتب الواردة للمركز</p>
          </button>

          {/* 7. Other */}
          <button
            type="button"
            onClick={() => setActiveTab('other')}
            className={`p-3 rounded-lg border text-right transition-all cursor-pointer ${
              activeTab === 'other'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400 shadow-xs font-bold'
                : 'bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
            }`}
          >
            <div className="font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-stone-500" />
                أخرى
              </span>
              <span className="text-[11px] font-mono">({otherTrs.length})</span>
            </div>
            <p className="text-[10px] opacity-80">معاملات عامة متنوعة</p>
          </button>
        </div>
      </div>

      {/* Breakdown List for the Selected Branch */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
        <div className="p-4 bg-stone-50 dark:bg-stone-800/80 border-b border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span>{tabList.title}</span>
              <span className="px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 text-[11px] font-mono">
                {displayedList.length} سجلات
              </span>
            </h4>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              تنسيق رسمي معتمد لمتابعة السيد المدير ومسؤول الذاتية
            </span>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث في هذا الباب..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              className="w-full pr-8 pl-3 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 outline-hidden focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        {displayedList.length === 0 ? (
          <div className="p-10 text-center text-xs text-stone-400 dark:text-stone-500 space-y-2">
            <p className="font-semibold text-stone-600 dark:text-stone-300">
              لا توجد معاملات مسجلة في هذا الباب للفترة المحددة
            </p>
            <p className="text-[11px]">
              عند إضافة أو تعديل أي معاملة وتحديد هذا القسم ستظهر هنا فوراً وتلقائياً.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {displayedList.map((tr) => (
              <div
                key={tr.id}
                onClick={() => onSelectTransaction(tr)}
                className="p-4 hover:bg-amber-50/40 dark:hover:bg-stone-800/60 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {/* Transaction Number */}
                    <span className="font-bold font-mono text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800 group-hover:bg-amber-100 dark:group-hover:bg-amber-950 px-2 py-0.5 rounded text-[11px] border border-stone-200 dark:border-stone-700">
                      العدد: {tr.number}
                    </span>

                    {/* Sequence */}
                    <span className="text-stone-400 dark:text-stone-500 text-[11px]">
                      ت: {tr.sequence}
                    </span>

                    {/* Date */}
                    <span className="text-stone-500 dark:text-stone-400 text-[11px]">
                      • {tr.date}
                    </span>

                    {/* Category Tag */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tr.category === 'منتسبين' && onNavigate) {
                          onNavigate({ view: 'employees' });
                        } else if (onNavigate) {
                          onNavigate({ view: 'transactions', category: tr.category });
                        }
                      }}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 cursor-pointer transition-colors"
                      title={tr.category === 'منتسبين' ? 'الانتقال لسجل المنتسبين والباحثين' : `الانتقال لقسم ${tr.category}`}
                    >
                      القسم: {tr.category} ↗
                    </button>

                    {/* Direction Tag */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate?.({ view: 'transactions', direction: tr.direction });
                      }}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 cursor-pointer transition-colors"
                      title={`الانتقال لكتب ال${tr.direction}`}
                    >
                      {tr.direction} ↗
                    </button>

                    {/* SubType */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((tr.isDailySituation || tr.subType === 'موقف يومي') && onNavigate) {
                          onNavigate({ view: 'daily-situations' });
                        } else if (onNavigate) {
                          onNavigate({ view: 'transactions', subType: tr.subType });
                        }
                      }}
                      className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 font-medium text-[10px] cursor-pointer transition-colors"
                      title={tr.subType === 'موقف يومي' ? 'الانتقال إلى الموقف اليومي' : `الانتقال لنوع: ${tr.subType}`}
                    >
                      {tr.subType} ↗
                    </button>

                    {/* Entity */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate?.({ view: 'transactions', searchTerm: tr.entity });
                      }}
                      className="text-stone-500 dark:text-stone-400 hover:text-amber-600 font-medium text-[11px] cursor-pointer underline decoration-stone-300"
                      title={`الانتقال لمعاملات: ${tr.entity}`}
                    >
                      إلى/من: {tr.entity} ↗
                    </button>

                    {/* Attachments indicator */}
                    {tr.attachments && tr.attachments.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800/60 flex items-center gap-1">
                        <span>📎 {tr.attachments.length} مرفقات</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-stone-800 dark:text-stone-200 leading-relaxed">
                    {tr.subject}
                  </p>

                  {/* Direct Attachment Viewers in Monthly Report */}
                  {tr.attachments && tr.attachments.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                        معاينة الوثائق:
                      </span>
                      {tr.attachments.map((att, attIdx) => (
                        <button
                          key={att.id || attIdx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewAttachmentDirectly) {
                              onViewAttachmentDirectly(tr, attIdx);
                            } else {
                              onSelectTransaction(tr);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 hover:bg-amber-100 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-amber-300 border border-stone-200 dark:border-stone-700 text-[10px] font-semibold transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                          title={`انقر لفتح ومطالعة ${att.name} بدقة عالية`}
                        >
                          <Eye className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span className="max-w-[140px] truncate">{att.name}</span>
                          <span className="text-[9px] text-stone-400 dark:text-stone-500 font-mono">
                            ({att.type})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {tr.employeeName && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5 flex-wrap">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>المنتسب المعني:</span>
                      {splitEmployeeNames(tr.employeeName).map((empName, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate?.({ view: 'employees', employeeName: empName });
                          }}
                          className="font-bold underline hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200/60"
                          title={`الانتقال لإضبارة ${empName}`}
                        >
                          {empName} ↗
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold border whitespace-nowrap ${
                      tr.status === 'قيد المراجعة'
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    {tr.status}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTransaction(tr);
                    }}
                    className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-900 hover:text-white dark:hover:bg-amber-400 dark:hover:text-stone-950 transition-colors"
                    title="معاينة تفاصيل ومرفقات المعاملة"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
