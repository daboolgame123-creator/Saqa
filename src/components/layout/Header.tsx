import React from 'react';
import { 
  FileText, 
  BarChart3, 
  Users, 
  Plus, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  Bell, 
  CheckCheck, 
  UserCheck, 
  FolderOpen, 
  Edit3,
  Moon,
  Sun,
  CalendarCheck2
} from 'lucide-react';
import { Transaction, UserRole, roleHasPermission } from '../../types';

interface HeaderProps {
  currentView: 'transactions' | 'daily-situations' | 'report' | 'employees' | 'archivist-studio';
  setCurrentView: (view: 'transactions' | 'daily-situations' | 'report' | 'employees' | 'archivist-studio') => void;
  onOpenNewModal: () => void;
  transactions: Transaction[];
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  onMarkAllAsRead: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  onOpenNewModal,
  transactions,
  userRole,
  setUserRole,
  onMarkAllAsRead,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const unreadCount = transactions.filter((t) => !t.isRead).length;

  return (
    <>
      {/* Top Header: In normal flow, scrolls smoothly up and out of view without any layout jitter */}
      <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 transition-colors">
        {/* Top security and alert bar */}
        <div className="bg-stone-900 text-stone-200 text-xs border-b border-stone-800 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-end gap-2">
            {/* Top Right: Dark Mode Toggle, Mark All Read & Role Switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Night Mode Button (الوضع الليلي) */}
              <button
                type="button"
                id="btn-header-dark-mode"
                onClick={onToggleDarkMode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border shadow-2xs active:scale-95 bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700 hover:text-amber-300"
                title={isDarkMode ? 'التحويل إلى الوضع النهاري' : 'التحويل إلى الوضع الليلي'}
              >
                {isDarkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>الوضع النهاري ☀️</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-indigo-300" />
                    <span>الوضع الليلي 🌙</span>
                  </>
                )}
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  id="btn-header-mark-all-read"
                  onClick={onMarkAllAsRead}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200 bg-amber-900/40 hover:bg-amber-900/70 px-2.5 py-0.5 rounded border border-amber-700/60 transition-colors cursor-pointer"
                  title="تحديد كل الكتب غير المقروءة كمطّلع عليها"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>تحديد الكل كمقروء ✓</span>
                </button>
              )}

              {/* Role Segmented Switcher */}
              <div className="inline-flex items-center rounded-lg bg-stone-800 p-0.5 border border-stone-700 text-[11px]">
                <button
                  type="button"
                  id="role-director"
                  onClick={() => setUserRole('director')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                    userRole === 'director'
                      ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                      : 'text-stone-400 hover:text-white'
                  }`}
                  title="الاطلاع على جميع المعاملات وتوجيه الهوامش"
                >
                  <UserCheck className="w-3 h-3" />
                  <span>السيد مدير المركز</span>
                </button>

                <button
                  type="button"
                  id="role-archivist"
                  onClick={() => setUserRole('archivist')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                    userRole === 'archivist'
                      ? 'bg-stone-200 text-stone-900 font-bold shadow-xs'
                      : 'text-stone-400 hover:text-white'
                  }`}
                  title="إدخال وتعديل وأرشفة الكتب والمعاملات"
                >
                  <FolderOpen className="w-3 h-3" />
                  <span>مسؤول الذاتية</span>
                </button>

                <button
                  type="button"
                  id="role-employee"
                  onClick={() => setUserRole('employee')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                    userRole === 'employee'
                      ? 'bg-emerald-400 text-stone-950 font-bold shadow-xs'
                      : 'text-stone-400 hover:text-white'
                  }`}
                  title="حساب منتسب (اختبار التحقق من رؤية الكتب العامة والخاصة بالمنتسب فقط)"
                >
                  <Users className="w-3 h-3" />
                  <span>منتسب (تجريبي)</span>
                </button>

                <button
                  type="button"
                  id="role-admin"
                  onClick={() => setUserRole('admin')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                    userRole === 'admin'
                      ? 'bg-indigo-400 text-stone-950 font-bold shadow-xs'
                      : 'text-stone-400 hover:text-white'
                  }`}
                  title="مدير المنظومة (صلاحيات كاملة وإدارة النظام)"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>مدير النظام</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Branding Bar with Title, Info & New Transaction Button */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              <FileText className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                  منظومة متابعة الذاتية والتقارير
                </h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
                  إصدار 2026
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
            {/* Direct Night Mode Toggle on Main Bar */}
            <button
              type="button"
              id="btn-main-dark-mode"
              onClick={onToggleDarkMode}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-bold hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shadow-2xs cursor-pointer"
              title={isDarkMode ? 'التحويل إلى الوضع النهاري' : 'التحويل إلى الوضع الليلي'}
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>الوضع النهاري</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span>الوضع الليلي</span>
                </>
              )}
            </button>

            {roleHasPermission(userRole, 'transactions.create') && (
              <button
                type="button"
                id="btn-add-transaction"
                onClick={onOpenNewModal}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold hover:bg-stone-800 dark:hover:bg-amber-300 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400 dark:text-stone-950" />
                <span>إدخال معاملة جديدة</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sticky Navigation Bar: Only the tabs remain pinned at top-0 */}
      <nav className="sticky top-0 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200/90 dark:border-stone-800/90 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-center">
          <div className="inline-flex rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100/90 dark:bg-stone-800/90 p-1 text-xs font-medium shadow-2xs max-w-full overflow-x-auto">
            <button
              type="button"
              id="tab-transactions"
              onClick={() => setCurrentView('transactions')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                currentView === 'transactions'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold ring-1 ring-stone-900/5 dark:ring-white/10'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/60 dark:hover:bg-stone-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>سجل المعاملات</span>
              {unreadCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full mr-1">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Daily Report / Situation Tab - FIRST-CLASS PROMINENT SECTION */}
            <button
              type="button"
              id="tab-daily-situations"
              onClick={() => setCurrentView('daily-situations')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                currentView === 'daily-situations'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold ring-1 ring-stone-900/5 dark:ring-white/10'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/60 dark:hover:bg-stone-800'
              }`}
            >
              <CalendarCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>الموقف والتقرير اليومي</span>
            </button>

            {/* Archivist Studio Tab - prominently available for editing */}
            {roleHasPermission(userRole, 'archive.manage') && (
              <button
                type="button"
                id="tab-archivist-studio"
                onClick={() => setCurrentView('archivist-studio')}
                className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  currentView === 'archivist-studio'
                    ? 'bg-stone-900 dark:bg-amber-400 text-amber-300 dark:text-stone-950 shadow-xs font-bold ring-1 ring-stone-900/5'
                    : 'text-amber-900 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50 hover:bg-amber-200/80 dark:hover:bg-amber-900/60 font-bold border border-amber-300/60 dark:border-amber-800/60'
                }`}
                title="الانتقال إلى قسم تحرير المعاملات وإدارة المرفقات الكامل"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>قسم تحرير الذاتية والملفات ✏️</span>
              </button>
            )}

            <button
              type="button"
              id="tab-monthly-report"
              onClick={() => setCurrentView('report')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                currentView === 'report'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold ring-1 ring-stone-900/5 dark:ring-white/10'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/60 dark:hover:bg-stone-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>التقرير الشهري التفاعلي</span>
            </button>

            <button
              type="button"
              id="tab-employees"
              onClick={() => setCurrentView('employees')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                currentView === 'employees'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold ring-1 ring-stone-900/5 dark:ring-white/10'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/60 dark:hover:bg-stone-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>سجل المنتسبين والباحثين</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
};
