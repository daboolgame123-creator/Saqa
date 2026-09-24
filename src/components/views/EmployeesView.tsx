import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  User, 
  FileText, 
  Search, 
  Plus, 
  X, 
  CheckCircle2, 
  Building2, 
  Briefcase, 
  Calendar,
  Clock,
  Layers,
  ChevronRight,
  Eye,
  Filter,
  Check,
  Edit3,
  Trash2,
  AlertTriangle,
  GraduationCap,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Award,
  Sparkles
} from 'lucide-react';
import {
  Employee,
  Transaction,
  UserRole,
  NavigationTarget,
  EmployeeCategory,
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
  LEAVE_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
  TIME_PERMISSION_STATUS_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  PARTICIPATION_TYPE_LABELS,
  PARTICIPATION_STATUS_LABELS,
  TransactionEmployee,
  DailySituationRecord,
  DAILY_SITUATION_CATEGORY_LABELS,
  TimelineSourceType,
} from '../../types';
import {
  splitEmployeeNames,
  isEmployeeMatch,
  isEmployeeInTransaction,
  determineEmployeeCategory,
} from '../../utils/employeeUtils';
import { PersonnelService, TransactionEmployeeService, DailySituationService, TimelineService } from '../../services';
import { TimelineView } from './TimelineView';

interface EmployeesViewProps {
  employees: Employee[];
  transactions: Transaction[];
  /** PHASE 5 — علاقة الكتاب↔المنتسب (مصدر الربط المنطقي) */
  transactionEmployees: TransactionEmployee[];
  /** PHASE 3 — Employee Profile: مجموعات شؤون المنتسبين المرتبطة بـ employeeId (قراءة وعرض فقط) */
  employeeLeaves: EmployeeLeave[];
  employeeTimePermissions: EmployeeTimePermission[];
  employeeAssignments: EmployeeAssignment[];
  employeeCourses: EmployeeCourse[];
  /**
   * PHASE 6 — قيود الموقف اليومي المستقلة (الرابط الأساسي employeeId — Rule 7).
   * القراءة بالمعرّف أولاً، مع بقاء الرجوع الآمن للبيانات المدمجة المورثة.
   */
  dailySituations?: DailySituationRecord[];
  onSelectTransaction: (transaction: Transaction) => void;
  onAddEmployee?: (newEmp: Omit<Employee, 'id'>) => void;
  onUpdateEmployee?: (updatedEmp: Employee, oldName?: string) => void;
  onDeleteEmployee?: (empId: string) => void;
  userRole?: UserRole;
  onNavigate?: (target: NavigationTarget) => void;
  navigationTarget?: NavigationTarget | null;
  onViewAttachmentDirectly?: (transaction: Transaction, attachmentIndex: number) => void;
  onSaveTransaction?: (updatedTr: Transaction) => void;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  employees,
  transactions,
  transactionEmployees,
  employeeLeaves,
  employeeTimePermissions,
  employeeAssignments,
  employeeCourses,
  dailySituations = [],
  onSelectTransaction,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  userRole = 'director',
  onNavigate,
  navigationTarget,
  onViewAttachmentDirectly,
  onSaveTransaction,
}) => {
  // Main view mode: Individual Dossiers vs Complete Personnel Department Register
  const [activeTab, setActiveTab] = useState<'individual' | 'all-transactions'>('individual');
  
  // Category Tab: 'منتسب' (Staff/Admin) vs 'باحث' (Researchers/Professors)
  const [categoryTab, setCategoryTab] = useState<EmployeeCategory>('منتسب');
  
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [searchEmp, setSearchEmp] = useState('');
  const [searchTransactions, setSearchTransactions] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Employee Form State
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDept, setNewDept] = useState('شعبة الذاتية والإدارية');
  const [newBadge, setNewBadge] = useState('');
  const [newCategory, setNewCategory] = useState<EmployeeCategory>('منتسب');
  const [newAcademicDegree, setNewAcademicDegree] = useState('');
  const [newSpecialization, setNewSpecialization] = useState('');

  // Edit Employee State
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editBadge, setEditBadge] = useState('');
  const [editCategory, setEditCategory] = useState<EmployeeCategory>('منتسب');
  const [editAcademicDegree, setEditAcademicDegree] = useState('');
  const [editSpecialization, setEditSpecialization] = useState('');

  // Delete Confirmation State
  const [deleteConfirmEmployee, setDeleteConfirmEmployee] = useState<Employee | null>(null);

  // PHASE 7 — Timeline: إظهار/إخفاء الخط الزمني داخل ملف المنتسب
  const [showTimeline, setShowTimeline] = useState(false);

  // Split into Staff (المنتسبون) and Researchers (الباحثون والأساتذة)
  const staffEmployees = useMemo(() => {
    return employees.filter((e) => determineEmployeeCategory(e) === 'منتسب');
  }, [employees]);

  const researcherEmployees = useMemo(() => {
    return employees.filter((e) => determineEmployeeCategory(e) === 'باحث');
  }, [employees]);

  // Handle deep navigation target from other sections
  useEffect(() => {
    if (!navigationTarget) return;

    if (navigationTarget.employeeCategory) {
      setCategoryTab(navigationTarget.employeeCategory);
    }

    if (navigationTarget.employeeId) {
      const byId = employees.find((e) => e.id === navigationTarget.employeeId);
      if (byId) {
        setCategoryTab(determineEmployeeCategory(byId));
        setSelectedEmployeeId(byId.id);
        setActiveTab('individual');
        return;
      }
    }

    if (navigationTarget.employeeName) {
      const targetName = navigationTarget.employeeName;
      const found = employees.find((e) => isEmployeeMatch(e.name, targetName));
      if (found) {
        const cat = determineEmployeeCategory(found);
        setCategoryTab(cat);
        setSelectedEmployeeId(found.id);
        setActiveTab('individual');
      }
    }
  }, [navigationTarget, employees]);

  // Current category list based on active category tab
  const currentCategoryList = useMemo(() => {
    return categoryTab === 'باحث' ? researcherEmployees : staffEmployees;
  }, [categoryTab, researcherEmployees, staffEmployees]);

  // Filtered employees by search in current category
  const filteredEmployees = useMemo(() => {
    const q = searchEmp.trim().toLowerCase();
    if (!q) return currentCategoryList;

    return currentCategoryList.filter((emp) => {
      const matchName = emp.name.toLowerCase().includes(q);
      const matchTitle = (emp.title || '').toLowerCase().includes(q);
      const matchDept = (emp.department || '').toLowerCase().includes(q);
      const matchBadge = (emp.badgeNumber || '').toLowerCase().includes(q);
      const matchDegree = (emp.academicDegree || '').toLowerCase().includes(q);
      const matchSpec = (emp.specialization || '').toLowerCase().includes(q);
      return matchName || matchTitle || matchDept || matchBadge || matchDegree || matchSpec;
    });
  }, [currentCategoryList, searchEmp]);

  // Default selection if none selected or selected is not in current list
  useEffect(() => {
    if (currentCategoryList.length > 0) {
      const currentSelectedExists = currentCategoryList.some((e) => e.id === selectedEmployeeId);
      if (!selectedEmployeeId || !currentSelectedExists) {
        setSelectedEmployeeId(currentCategoryList[0].id);
      }
    } else {
      setSelectedEmployeeId(null);
    }
  }, [categoryTab, currentCategoryList, selectedEmployeeId]);

  const selectedEmployee = useMemo(() => {
    return (
      currentCategoryList.find((e) => e.id === selectedEmployeeId) ||
      employees.find((e) => e.id === selectedEmployeeId) ||
      currentCategoryList[0] ||
      null
    );
  }, [currentCategoryList, employees, selectedEmployeeId]);

  // ── PHASE 5: فهرس العلاقة domain — معرّفات المعاملات لكل منتسب (مصدر الربط) ──
  const relationTxIdsByEmployee = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rel of transactionEmployees) {
      let set = map.get(rel.employeeId);
      if (!set) {
        set = new Set();
        map.set(rel.employeeId, set);
      }
      set.add(rel.transactionId);
    }
    return map;
  }, [transactionEmployees]);

  /** معرّفات المعاملات المرتبطة بأي منتبس (لتصفية أقسام التقارير/السجل داخل العرض). */
  const relatedTransactionIds = useMemo(
    () => new Set(transactionEmployees.map((rel) => rel.transactionId)),
    [transactionEmployees]
  );

  // Find all transactions linked to this selected employee
  const linkedTransactions = useMemo(() => {
    if (!selectedEmployee) return [];
    // المصدر: العلاقة domain أولاً، مع fallback تراثي (اسم/موقف يومي/موضوع)
    // للروابط القديمة التي تعذّر تحويلها بأمان إلى معرّفات (Rule 3 — لا فقدان بيانات).
    const relationTxIds = relationTxIdsByEmployee.get(selectedEmployee.id);
    return transactions.filter(
      (t) => relationTxIds?.has(t.id) === true || isEmployeeInTransaction(t, selectedEmployee)
    );
  }, [transactions, selectedEmployee, relationTxIdsByEmployee]);

  // ── PHASE 3 — Employee Profile: تجميع سجلات شؤون المنتسبين بالمعرّف (Rule 7) ──
  // التصفية تتم عبر PersonnelService القائمة (لا منطق أعمال داخل المكوّن ولا في utils).
  const selectedProfileEmployeeId = selectedEmployee?.id ?? '';

  const selectedLeaves = useMemo(
    () => PersonnelService.getByEmployee(employeeLeaves, selectedProfileEmployeeId),
    [employeeLeaves, selectedProfileEmployeeId]
  );

  const selectedTimePermissions = useMemo(
    () => PersonnelService.getByEmployee(employeeTimePermissions, selectedProfileEmployeeId),
    [employeeTimePermissions, selectedProfileEmployeeId]
  );

  const selectedAssignments = useMemo(
    () => PersonnelService.getByEmployee(employeeAssignments, selectedProfileEmployeeId),
    [employeeAssignments, selectedProfileEmployeeId]
  );

  const selectedCourses = useMemo(
    () => PersonnelService.getByEmployee(employeeCourses, selectedProfileEmployeeId),
    [employeeCourses, selectedProfileEmployeeId]
  );

  // ── PHASE 6 — Daily Situation: القراءة بالمعرّف أولاً (Rule 7) مع رجوع آمن للموروث ──
  const selectedDailySituations = useMemo(
    () => DailySituationService.getByEmployee(dailySituations, selectedProfileEmployeeId),
    [dailySituations, selectedProfileEmployeeId]
  );

  // ── PHASE 7 — Timeline: طبقة تجميع وعرض مشتقة من المصادر الأصلية (BR-14) ──
  // لا تخزين مستقل للخط الزمني: تُحسب الأحداث عند الطلب من نفس بيانات المراحل 3/5/6.
  // نطاق المعاملات يُمرَّر صراحةً من linkedTransactions (علاقة TransactionEmployee + الروابط القديمة الآمنة).
  const employeeTimeline = useMemo(() => {
    if (!selectedProfileEmployeeId) return null;
    return TimelineService.buildForEmployee({
      employeeId: selectedProfileEmployeeId,
      leaves: employeeLeaves,
      timePermissions: employeeTimePermissions,
      assignments: employeeAssignments,
      courses: employeeCourses,
      transactions: linkedTransactions,
      transactionIds: linkedTransactions.map((tr) => tr.id),
      dailySituations,
    });
  }, [
    selectedProfileEmployeeId,
    employeeLeaves,
    employeeTimePermissions,
    employeeAssignments,
    employeeCourses,
    linkedTransactions,
    dailySituations,
  ]);

  // عند تغيير المنتسب المحدد يعود العرض إلى ملفّه (لا يبقى الخط الزمني لمنتسب آخر)
  useEffect(() => {
    setShowTimeline(false);
  }, [selectedProfileEmployeeId]);

  /**
   * PHASE 7 — التنقّل من الحدث الزمني إلى سجله الأصلي (لا نسخة مكررة من البيانات):
   * - الكتاب/المعاملة: فتح الملف من نفس بيانات المرحلة 5.
   * - الموقف اليومي/الإجازة/الإذن الزمني: الانتقال إلى قسم الموقف اليومي بالمعرّف (Rule 7).
   * - التكليف/الدورة: الانتقال إلى قسمهما داخل نفس ملف المنتسب (لا عرض مستقل لهما بعد).
   */
  const handleTimelineSourceNavigate = (sourceType: TimelineSourceType, sourceId: string) => {
    switch (sourceType) {
      case 'transaction': {
        const target = linkedTransactions.find((tr) => tr.id === sourceId);
        if (target) onSelectTransaction(target);
        return;
      }
      case 'dailySituation':
        onNavigate?.({ view: 'daily-situations', employeeId: selectedProfileEmployeeId, subType: 'موقف يومي' });
        return;
      case 'leave':
        onNavigate?.({ view: 'daily-situations', employeeId: selectedProfileEmployeeId, subType: 'إجازة' });
        return;
      case 'timePermission':
        onNavigate?.({ view: 'daily-situations', employeeId: selectedProfileEmployeeId, subType: 'زمنية' });
        return;
      case 'assignment':
        document.getElementById('profile-section-assignment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      case 'course':
        document.getElementById('profile-section-course')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      default:
        return;
    }
  };

  /** استمارات الموقف المورثة المرتبطة بالمنتسب — عرض فقط عند غياب قيود مستقلة */
  const legacyDailySituationTransactions = useMemo(
    () => linkedTransactions.filter((t) => t.isDailySituation || t.subType === 'موقف يومي'),
    [linkedTransactions]
  );

  // All transactions belonging to Personnel Department
  const personnelTransactions = useMemo(() => {
    return transactions.filter(
      (t) =>
        t.category === 'منتسبين' ||
        t.category === 'الأساتذة' ||
        Boolean(t.employeeName && t.employeeName.trim()) ||
        relatedTransactionIds.has(t.id) ||
        Boolean(t.dailySituationData)
    );
  }, [transactions, relatedTransactionIds]);

  // Filtered personnel transactions for Tab 2
  const filteredPersonnelTransactions = useMemo(() => {
    const q = searchTransactions.trim().toLowerCase();
    if (!q) return personnelTransactions;

    return personnelTransactions.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q) ||
        (t.employeeName && t.employeeName.toLowerCase().includes(q)) ||
        t.entity.toLowerCase().includes(q) ||
        t.subType.toLowerCase().includes(q)
    );
  }, [personnelTransactions, searchTransactions]);

  // Open add modal
  const handleOpenAddModal = (initialCategory?: EmployeeCategory) => {
    setNewName('');
    setNewBadge(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
    const cat = initialCategory || categoryTab;
    setNewCategory(cat);
    if (cat === 'باحث') {
      setNewTitle('باحث / أستاذ');
      setNewDept('مركز الدراسات الافريقية - قسم الأساتذة والبحوث');
      setNewAcademicDegree('أستاذ مساعد دكتور');
      setNewSpecialization('دراسات إقليمية وتاريخية');
    } else {
      setNewTitle('معاون إداري');
      setNewDept('شعبة الذاتية والإدارية');
      setNewAcademicDegree('');
      setNewSpecialization('');
    }
    setIsAddModalOpen(true);
  };

  // Submit new employee
  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const names = splitEmployeeNames(newName);
    if (names.length === 0) return;

    names.forEach((name, idx) => {
      onAddEmployee?.({
        name,
        title: newTitle.trim() || (newCategory === 'باحث' ? 'باحث / أستاذ' : 'منتسب'),
        department: newDept.trim() || (newCategory === 'باحث' ? 'قسم الأساتذة والبحوث' : 'شعبة الذاتية والإدارية'),
        badgeNumber: names.length > 1 
          ? `${newCategory === 'باحث' ? 'RES' : 'EMP'}-${Math.floor(1000 + Math.random() * 9000)}` 
          : newBadge.trim() || `${newCategory === 'باحث' ? 'RES' : 'EMP'}-${Math.floor(1000 + Math.random() * 9000)}`,
        category: newCategory,
        academicDegree: newCategory === 'باحث' ? newAcademicDegree.trim() : undefined,
        specialization: newCategory === 'باحث' ? newSpecialization.trim() : undefined,
        joinedDate: new Date().toISOString().split('T')[0],
      });
    });

    setIsAddModalOpen(false);
    setCategoryTab(newCategory);
  };

  // Open edit modal
  const handleStartEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditName(emp.name);
    setEditTitle(emp.title);
    setEditDept(emp.department);
    setEditBadge(emp.badgeNumber || '');
    const cat = determineEmployeeCategory(emp);
    setEditCategory(cat);
    setEditAcademicDegree(emp.academicDegree || '');
    setEditSpecialization(emp.specialization || '');
  };

  // Save edited employee
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !editName.trim()) return;

    const updated: Employee = {
      ...editingEmployee,
      name: editName.trim(),
      title: editTitle.trim() || (editCategory === 'باحث' ? 'باحث / أستاذ' : 'منتسب'),
      department: editDept.trim() || 'شعبة الذاتية والإدارية',
      badgeNumber: editBadge.trim() || undefined,
      category: editCategory,
      academicDegree: editCategory === 'باحث' ? editAcademicDegree.trim() : undefined,
      specialization: editCategory === 'باحث' ? editSpecialization.trim() : undefined,
    };

    onUpdateEmployee?.(updated, editingEmployee.name);
    setEditingEmployee(null);
  };

  // Delete employee
  const handleConfirmDelete = () => {
    if (!deleteConfirmEmployee) return;
    onDeleteEmployee?.(deleteConfirmEmployee.id);
    if (selectedEmployeeId === deleteConfirmEmployee.id) {
      setSelectedEmployeeId(null);
    }
    setDeleteConfirmEmployee(null);
  };

  // Unlink transaction from employee dossier
  const handleUnlinkTransaction = (tr: Transaction, emp: Employee, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSaveTransaction) return;

    // PHASE 5: نُعدّل مدخل التوافق employeeIds هنا، وحذف العلاقة domain الفعلي
    // يتم عبر TransactionEmployeeService.syncForTransaction داخل App عند الحفظ.

    // 1. Remove employee ID from compatibility mirror employeeIds
    const newEmployeeIds = tr.employeeIds ? tr.employeeIds.filter((id) => id !== emp.id) : undefined;

    // 2. Remove employee name from employeeName string
    const remaining = tr.employeeName
      ? splitEmployeeNames(tr.employeeName).filter((n) => !isEmployeeMatch(n, emp.name))
      : [];

    const updated: Transaction = {
      ...tr,
      employeeIds: newEmployeeIds && newEmployeeIds.length > 0 ? newEmployeeIds : undefined,
      employeeName: remaining.length > 0 ? remaining.join(' ، ') : undefined,
    };

    onSaveTransaction(updated);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Main View Switcher */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold shadow-xs shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">
                  سجل المنتسبين والباحثين
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  إجمالي الكادر: {employees.length}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                إدارة ملفات الكادر الإداري والفني، وهيئة الأساتذة والباحثين، ومتابعة كافة المعاملات والكتب الصادرة والواردة والموقف اليومي
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {onNavigate && (
              <button
                type="button"
                id="btn-nav-daily-report"
                onClick={() => onNavigate({ view: 'daily-situations' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition-all border border-emerald-300 dark:border-emerald-800 shadow-2xs cursor-pointer"
                title="الانتقال المباشر إلى سجل الموقف والتقرير اليومي"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>الموقف والتقرير اليومي ↗</span>
              </button>
            )}

            {userRole === 'archivist' && (
              <button
                type="button"
                id="btn-add-employee-trigger"
                onClick={() => handleOpenAddModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة كادر جديد</span>
              </button>
            )}
          </div>
        </div>

        {/* View Mode Tabs (Dossiers vs Complete Register) */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 text-xs">
          <button
            type="button"
            id="tab-view-individual"
            onClick={() => setActiveTab('individual')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'individual'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 bg-stone-100 dark:bg-stone-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>الأضابير الفردية للمنتسبين والباحثين</span>
          </button>

          <button
            type="button"
            id="tab-view-all-transactions"
            onClick={() => setActiveTab('all-transactions')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'all-transactions'
                ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 bg-stone-100 dark:bg-stone-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>سجل المعاملات الشامل لشؤون الذاتية ({personnelTransactions.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: INDIVIDUAL DOSSIERS WITH TWO SEPARATE LISTS */}
      {activeTab === 'individual' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Left Column (4 cols): Category Tabs & Filtered Employees List */}
          <div className="md:col-span-4 space-y-3">
            {/* TWO DEDICATED CATEGORY TABS AS REQUESTED BY USER */}
            <div className="bg-white dark:bg-stone-900 p-1.5 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xs">
              <div className="grid grid-cols-2 gap-1 text-xs">
                {/* 1. المنتسبون (كادر إداري وفني) */}
                <button
                  type="button"
                  id="tab-category-staff"
                  onClick={() => setCategoryTab('منتسب')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition-all cursor-pointer ${
                    categoryTab === 'منتسب'
                      ? 'bg-stone-900 dark:bg-stone-800 text-amber-300 shadow-xs ring-1 ring-amber-400/40'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>المنتسبون</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                    {staffEmployees.length}
                  </span>
                </button>

                {/* 2. الباحثون والأساتذة (كادر بحثي وأكاديمي) */}
                <button
                  type="button"
                  id="tab-category-researchers"
                  onClick={() => setCategoryTab('باحث')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold transition-all cursor-pointer ${
                    categoryTab === 'باحث'
                      ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-stone-950 shadow-xs ring-1 ring-amber-400/50'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>الباحثون والأساتذة</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-stone-700 text-amber-900 dark:text-amber-300 font-bold">
                    {researcherEmployees.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Search Input for Employees */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchEmp}
                onChange={(e) => setSearchEmp(e.target.value)}
                placeholder={
                  categoryTab === 'باحث'
                    ? 'ابحث باسم الأستاذ، اللقب العلمي، التخصص...'
                    : 'ابحث باسم المنتسب، العنوان، القسم...'
                }
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 outline-hidden"
              />
              {searchEmp && (
                <button
                  type="button"
                  onClick={() => setSearchEmp('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List of Persons in Selected Category */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-0.5">
              {filteredEmployees.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-400 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-dashed border-stone-200 dark:border-stone-800">
                  لا توجد أسماء مطابقة لنتائج البحث في {categoryTab === 'باحث' ? 'قائمة الباحثين والأساتذة' : 'قائمة المنتسبين'}
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  // PHASE 5: العلاقة domain أولاً (Rule 7 — بالـid)، مع بقاء مطابقة الاسم التراثية
                  const relationTxIds = relationTxIdsByEmployee.get(emp.id);
                  const count = transactions.filter(
                    (t) => relationTxIds?.has(t.id) === true || isEmployeeInTransaction(t, emp.name)
                  ).length;
                  const isSelected = emp.id === selectedEmployee?.id;
                  const isResearcher = determineEmployeeCategory(emp) === 'باحث';

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      id={`emp-card-${emp.id}`}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className={`w-full text-right p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? isResearcher
                            ? 'bg-amber-950 dark:bg-amber-900/60 text-white border-amber-500 ring-2 ring-amber-400/40 shadow-sm'
                            : 'bg-stone-900 dark:bg-stone-800 text-white border-stone-900 dark:border-amber-400 shadow-sm'
                          : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/60 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isResearcher
                              ? isSelected ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                              : isSelected ? 'bg-stone-800 text-amber-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          {isResearcher ? <GraduationCap className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>

                        <div className="space-y-0.5 truncate">
                          <p className="font-bold text-xs truncate flex items-center gap-1.5">
                            <span>{emp.name}</span>
                            {isResearcher && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-normal">
                                باحث
                              </span>
                            )}
                          </p>
                          <p className={`text-[11px] truncate ${isSelected ? 'text-stone-300 dark:text-stone-300' : 'text-stone-500 dark:text-stone-400'}`}>
                            {emp.academicDegree ? `${emp.academicDegree} • ` : ''}
                            {emp.title} • {emp.department}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mr-1.5 ${
                          isSelected
                            ? 'bg-amber-400 text-stone-950'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {count} كتب
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column (8 cols): Selected Employee Detailed Dossier */}
          <div className="md:col-span-8 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 shadow-xs space-y-4">
            {selectedEmployee ? (
              <>
                {/* Header Info Banner for Selected Person */}
                <div className="border-b border-stone-100 dark:border-stone-800 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg shadow-xs shrink-0 ${
                        determineEmployeeCategory(selectedEmployee) === 'باحث'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700'
                      }`}
                    >
                      {determineEmployeeCategory(selectedEmployee) === 'باحث' ? (
                        <GraduationCap className="w-7 h-7 text-amber-700 dark:text-amber-400" />
                      ) : (
                        <User className="w-7 h-7 text-stone-700 dark:text-stone-300" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">
                          {selectedEmployee.name}
                        </h3>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                            determineEmployeeCategory(selectedEmployee) === 'باحث'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                          }`}
                        >
                          {determineEmployeeCategory(selectedEmployee) === 'باحث' ? '🎓 كادر بحثي وأستاذ' : '🏢 كادر إداري وفني'}
                        </span>
                      </div>

                      <p className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2 flex-wrap mt-1">
                        {selectedEmployee.academicDegree && (
                          <>
                            <span className="text-amber-700 dark:text-amber-400 font-semibold">
                              {selectedEmployee.academicDegree}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>العنوان: <strong>{selectedEmployee.title}</strong></span>
                        <span>•</span>
                        <span>الجهة: <strong>{selectedEmployee.department}</strong></span>
                        {selectedEmployee.specialization && (
                          <>
                            <span>•</span>
                            <span>التخصص: <strong>{selectedEmployee.specialization}</strong></span>
                          </>
                        )}
                        {selectedEmployee.badgeNumber && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.2 rounded text-[11px]">
                              {selectedEmployee.badgeNumber}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions: Edit & Delete Dossier (available for Director and Archivist) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* PHASE 7 — Timeline: عرض زمني مشتق من المصادر الأصلية (BR-14) */}
                    <button
                      type="button"
                      id="btn-toggle-timeline"
                      onClick={() => setShowTimeline((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shadow-2xs ${
                        showTimeline
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                          : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200'
                      }`}
                      title="الخط الزمني: تجميع الإجازات والأذونات والتكليفات والدورات والكتب والمواقف اليومية"
                    >
                      <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>{showTimeline ? 'إخفاء الخط الزمني' : 'الخط الزمني'}</span>
                      {employeeTimeline && employeeTimeline.totalCount > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                          {employeeTimeline.totalCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      id="btn-edit-employee"
                      onClick={() => handleStartEdit(selectedEmployee)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                      title="تعديل بيانات القيد"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>تعديل</span>
                    </button>

                    <button
                      type="button"
                      id="btn-delete-employee"
                      onClick={() => setDeleteConfirmEmployee(selectedEmployee)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                      title="حذف هذا الملف/القيد بشكل نهائي وفك ارتباطه"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>حذف الملف</span>
                    </button>
                  </div>
                </div>

                {/* Quick Dossier Stats & Shortcuts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700 text-center">
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block">إجمالي الكتب والمعاملات</span>
                    <span className="text-base font-bold text-stone-900 dark:text-stone-100">
                      {linkedTransactions.length}
                    </span>
                  </div>

                  <div className="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700 text-center">
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block">الكتب الصادرة</span>
                    <span className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                      {linkedTransactions.filter((t) => t.direction === 'صادر').length}
                    </span>
                  </div>

                  <div className="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700 text-center">
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block">الكتب الواردة</span>
                    <span className="text-base font-bold text-amber-700 dark:text-amber-400">
                      {linkedTransactions.filter((t) => t.direction === 'وارد').length}
                    </span>
                  </div>

                  <div
                    className="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700 text-center"
                    title="قيود الموقف اليومي بالمعرّف (مع الرجوع الآمن للاستمارات المورثة)"
                  >
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block">المواقف والإجازات</span>
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {selectedDailySituations.length > 0
                        ? selectedDailySituations.length
                        : legacyDailySituationTransactions.length}
                    </span>
                  </div>
                </div>

                {/* PHASE 7 — Timeline: عرض زمني مشتق من المصادر الأصلية (لا تخزين مستقل) */}
                {showTimeline && employeeTimeline && (
                  <div
                    id="employee-timeline-panel"
                    className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/30 p-3.5"
                  >
                    <TimelineView
                      employeeName={selectedEmployee.name}
                      entries={employeeTimeline.entries}
                      totalCount={employeeTimeline.totalCount}
                      countsBySource={employeeTimeline.countsBySource}
                      onNavigateToSource={handleTimelineSourceNavigate}
                      onBack={() => setShowTimeline(false)}
                    />
                  </div>
                )}

                {/* PHASE 3 — Employee Profile: عرض سجلات شؤون المنتسبين المستقلة (قراءة فقط) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-2">
                  <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/40 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        الإجازات
                      </h4>
                      <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">{selectedLeaves.length}</span>
                    </div>
                    {selectedLeaves.length === 0 ? (
                      <p className="text-[11px] text-stone-400 dark:text-stone-500">لا توجد إجازات مسجلة لهذا المنتسب.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {selectedLeaves.map((leave) => (
                          <div key={leave.id} className="rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 text-[11px] text-stone-600 dark:text-stone-300 space-y-1">
                            <div className="flex items-center justify-between gap-2 font-bold text-stone-800 dark:text-stone-100">
                              <span>{LEAVE_TYPE_LABELS[leave.type]}</span>
                              <span className="text-emerald-700 dark:text-emerald-400">{LEAVE_STATUS_LABELS[leave.status]}</span>
                            </div>
                            <p>{leave.startDate} — {leave.endDate}{leave.days !== undefined ? ` • ${leave.days} يوم` : ''}</p>
                            <p>{leave.isPaid === false ? 'بدون راتب' : 'براتب'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/40 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        الأذونات الزمنية
                      </h4>
                      <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">{selectedTimePermissions.length}</span>
                    </div>
                    {selectedTimePermissions.length === 0 ? (
                      <p className="text-[11px] text-stone-400 dark:text-stone-500">لا توجد أذونات زمنية مسجلة لهذا المنتسب.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {selectedTimePermissions.map((permission) => (
                          <div key={permission.id} className="rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 text-[11px] text-stone-600 dark:text-stone-300 space-y-1">
                            <div className="flex items-center justify-between gap-2 font-bold text-stone-800 dark:text-stone-100">
                              <span>{permission.date}</span>
                              <span className="text-sky-700 dark:text-sky-400">{TIME_PERMISSION_STATUS_LABELS[permission.status]}</span>
                            </div>
                            <p>الخروج: {permission.timeOut}{permission.timeIn ? ` • العودة: ${permission.timeIn}` : ''}</p>
                            {permission.reason && <p>{permission.reason}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section id="profile-section-assignment" className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/40 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                        التكليفات
                      </h4>
                      <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">{selectedAssignments.length}</span>
                    </div>
                    {selectedAssignments.length === 0 ? (
                      <p className="text-[11px] text-stone-400 dark:text-stone-500">لا توجد تكليفات مسجلة لهذا المنتسب.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {selectedAssignments.map((assignment) => (
                          <div key={assignment.id} className="rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 text-[11px] text-stone-600 dark:text-stone-300 space-y-1">
                            <div className="flex items-center justify-between gap-2 font-bold text-stone-800 dark:text-stone-100">
                              <span>{ASSIGNMENT_TYPE_LABELS[assignment.type]}</span>
                              <span className="text-violet-700 dark:text-violet-400">{ASSIGNMENT_STATUS_LABELS[assignment.status]}</span>
                            </div>
                            <p>{assignment.entity}{assignment.place ? ` • ${assignment.place}` : ''}</p>
                            <p>{assignment.startDate} — {assignment.endDate}</p>
                            {assignment.purpose && <p>{assignment.purpose}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section id="profile-section-course" className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/40 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        الدورات والمشاركات
                      </h4>
                      <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">{selectedCourses.length}</span>
                    </div>
                    {selectedCourses.length === 0 ? (
                      <p className="text-[11px] text-stone-400 dark:text-stone-500">لا توجد دورات أو مشاركات مسجلة لهذا المنتسب.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {selectedCourses.map((course) => (
                          <div key={course.id} className="rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 text-[11px] text-stone-600 dark:text-stone-300 space-y-1">
                            <div className="flex items-center justify-between gap-2 font-bold text-stone-800 dark:text-stone-100">
                              <span>{course.name}</span>
                              <span className="text-amber-700 dark:text-amber-400">{PARTICIPATION_STATUS_LABELS[course.participationStatus]}</span>
                            </div>
                            <p>{course.organizer}{course.place ? ` • ${course.place}` : ''}</p>
                            <p>{PARTICIPATION_TYPE_LABELS[course.participationType]}{course.startDate ? ` • ${course.startDate}${course.endDate ? ` — ${course.endDate}` : ''}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* PHASE 6 — الموقف اليومي كيان مستقل مرتبط بالمنتسب عبر employeeId */}
                  <section className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/40 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        الموقف اليومي
                      </h4>
                      <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                        {selectedDailySituations.length}
                      </span>
                    </div>
                    {selectedDailySituations.length === 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-stone-400 dark:text-stone-500">
                          لا توجد قيود موقف يومي مستقلة مرتبطة بمعرّف هذا المنتسب.
                        </p>
                        {legacyDailySituationTransactions.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate?.({
                                view: 'daily-situations',
                                employeeId: selectedProfileEmployeeId,
                                employeeName: selectedEmployee?.name,
                              })
                            }
                            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            title="استمارات الموقف اليومية المورثة المرتبطة بهذا المنتسب"
                          >
                            استمارات مورثة مرتبطة: {legacyDailySituationTransactions.length} ↗
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {selectedDailySituations.map((record) => (
                          <div
                            key={record.id}
                            className="rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 text-[11px] text-stone-600 dark:text-stone-300 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 font-bold text-stone-800 dark:text-stone-100">
                              <span>{DAILY_SITUATION_CATEGORY_LABELS[record.category]}</span>
                              <span className="text-teal-700 dark:text-teal-400 font-mono">
                                {record.date}
                              </span>
                            </div>
                            {record.timeOrDuration && <p>{record.timeOrDuration}</p>}
                            {record.reason && <p>السبب: {record.reason}</p>}
                            {record.notes && <p>{record.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* List of Linked Transactions */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                      <span>قائمة الكتب والوثائق الخاصة بـ ({selectedEmployee.name}):</span>
                    </h4>
                    <span className="text-xs text-stone-400 font-mono">
                      {linkedTransactions.length} وثيقة
                    </span>
                  </div>

                  {linkedTransactions.length === 0 ? (
                    <div className="p-8 text-center bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 space-y-3">
                      <FileText className="w-8 h-8 text-stone-300 dark:text-stone-600 mx-auto" />
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        لا توجد كتب أو معاملات مسجلة باسم هذا {determineEmployeeCategory(selectedEmployee) === 'باحث' ? 'الأستاذ' : 'المنتسب'} حالياً
                      </p>
                      <p className="text-[11px] text-stone-400 dark:text-stone-500">
                        إذا كان هذا السجل أضيف عن طريق الخطأ أو ترغب بحذفه لعدم ارتباطه بأي معاملات، يمكنك إزالته فوراً:
                      </p>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmEmployee(selectedEmployee)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs font-bold transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>حذف هذا الملف / القيد غير المرتبط 🗑️</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-0.5">
                      {linkedTransactions.map((tr) => (
                        <div
                          key={tr.id}
                          onClick={() => onSelectTransaction(tr)}
                          className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-white dark:bg-stone-800/70 hover:border-amber-400 dark:hover:border-amber-500 transition-all cursor-pointer shadow-2xs space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-stone-900 text-amber-300 dark:bg-amber-400 dark:text-stone-950">
                                العدد: {tr.number}
                              </span>

                              {/* Interactive Clickable Badges for Direct Navigation */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigate?.({ view: 'transactions', direction: tr.direction });
                                }}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                                  tr.direction === 'صادر'
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                    : tr.direction === 'وارد'
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                                }`}
                                title={`الانتقال وتصفية كتب ال${tr.direction}`}
                              >
                                {tr.direction} ↗
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (tr.isDailySituation || tr.subType === 'موقف يومي') {
                                    onNavigate?.({ view: 'daily-situations' });
                                  } else {
                                    onNavigate?.({ view: 'transactions', subType: tr.subType });
                                  }
                                }}
                                className="text-[11px] font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                                title="الانتقال إلى هذا النوع من المعاملات"
                              >
                                {tr.subType} ↗
                              </button>
                            </div>

                            <span className="text-xs text-stone-400 font-medium flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {tr.date}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">
                            {tr.subject}
                          </p>

                          {/* Direct Attachment Viewers in Researcher / Employee Dossier */}
                          {tr.attachments && tr.attachments.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-stone-100 dark:border-stone-700/60">
                              <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                                المرفقات الممسوحة ({tr.attachments.length}):
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
                                  title={`فتح ${att.name} مباشرة ومطالعته بدقة عالية`}
                                >
                                  <Eye className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span className="max-w-[130px] truncate">{att.name}</span>
                                  <span className="text-[9px] text-stone-400 font-mono">({att.type})</span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1.5 border-t border-stone-100 dark:border-stone-700/60">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-stone-400" />
                              الجهة: <strong>{tr.entity}</strong>
                            </span>

                            <div className="flex items-center gap-3">
                              {/* Option to unlink this transaction from this employee */}
                              <button
                                type="button"
                                onClick={(e) => handleUnlinkTransaction(tr, selectedEmployee, e)}
                                className="text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                                title="فك ارتباط هذا الكتاب عن هذا الملف وإزالته من الإضبارة"
                              >
                                <X className="w-3 h-3" />
                                <span>فك ارتباط الكتاب</span>
                              </button>

                              <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                                عرض المعاملة
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-stone-400 space-y-2">
                <Users className="w-12 h-12 mx-auto text-stone-300 dark:text-stone-700" />
                <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">
                  يرجى اختيار شخص من القائمة الجانبية لعرض إضبارته
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPLETE PERSONNEL REGISTER (ALL TRANSACTIONS) */}
      {activeTab === 'all-transactions' && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                سجل القيود والمعاملات الشامل لشؤون الذاتية والأساتذة
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                يعرض كافة الكتب الرسمية والموافقات والإجازات والمواقف المرتبطة بالكوادر
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchTransactions}
                onChange={(e) => setSearchTransactions(e.target.value)}
                placeholder="ابحث في السجل أو باسم المنتسب..."
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-500 outline-hidden"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredPersonnelTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-400 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
                لا توجد معاملات مطابقة للبحث في السجل الشامل
              </div>
            ) : (
              filteredPersonnelTransactions.map((tr) => (
                <div
                  key={tr.id}
                  onClick={() => onSelectTransaction(tr)}
                  className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700/80 bg-white dark:bg-stone-800/70 hover:border-amber-400 transition-all cursor-pointer shadow-2xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-stone-900 text-amber-300 dark:bg-amber-400 dark:text-stone-950">
                        العدد: {tr.number}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          tr.direction === 'صادر'
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {tr.direction}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {tr.subType}
                      </span>
                      {tr.employeeName && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          👤 {tr.employeeName}
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-stone-400">{tr.date}</span>
                  </div>

                  <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    {tr.subject}
                  </p>

                  {/* Direct Attachment Viewers in Complete Register */}
                  {tr.attachments && tr.attachments.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-stone-100 dark:border-stone-700/60">
                      <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                        معاينة المرفقات:
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
                          title={`فتح ومطالعة ${att.name} بدقة عالية`}
                        >
                          <Eye className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span className="max-w-[130px] truncate">{att.name}</span>
                          <span className="text-[9px] text-stone-400 font-mono">({att.type})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW EMPLOYEE / RESEARCHER */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-stone-950 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                  إضافة كادر جديد إلى السجل
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4">
              {/* Category Selector (منتسب vs باحث/أستاذ) */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  نوع القائمة والتصنيف *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCategory('منتسب')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newCategory === 'منتسب'
                        ? 'bg-stone-900 text-amber-300 border-stone-900 shadow-xs ring-1 ring-amber-400/40'
                        : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>قائمة المنتسبين (إداري/فني)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCategory('باحث')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newCategory === 'باحث'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-1 ring-amber-400/50'
                        : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>قائمة الباحثين والأساتذة</span>
                  </button>
                </div>
              </div>

              {/* Name Field (supports multiple comma-separated names) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    الاسم الثلاثي أو الرباعي *
                  </label>
                  <span className="text-[10px] text-stone-500">
                    (يمكن كتابة أكثر من اسم مفصولاً بفارزة "،")
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={
                    newCategory === 'باحث'
                      ? 'مثال: أ.د. أستاذ-تجريبي-1، د. باحث-تجريبي-2...'
                      : 'مثال: موظف-تجريبي-1، موظف-تجريبي-2...'
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                />

                {/* Live parsed names preview */}
                {newName.includes('،') || newName.includes(',') || newName.includes('\n') ? (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-stone-400">سيتم إنشاء قيود منفصلة لـ:</span>
                    {splitEmployeeNames(newName).map((n, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.2 rounded-full bg-amber-100 text-amber-900 font-bold">
                        {n}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Specific fields if Researcher */}
              {newCategory === 'باحث' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
                      اللقب العلمي / الرتبة
                    </label>
                    <input
                      type="text"
                      value={newAcademicDegree}
                      onChange={(e) => setNewAcademicDegree(e.target.value)}
                      placeholder="أستاذ دكتور، باحث، ماجستير..."
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
                      الاختصاص / المجال البحثي
                    </label>
                    <input
                      type="text"
                      value={newSpecialization}
                      onChange={(e) => setNewSpecialization(e.target.value)}
                      placeholder="دراسات إقليمية، لغات، تاريخ..."
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                </div>
              )}

              {/* Title & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    العنوان الوظيفي
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="معاون إداري، باحث، سائق..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    الجهة / الشعبة / المركز
                  </label>
                  <input
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    placeholder="مركز الدراسات الافريقية، شعبة الذاتية..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Badge Number */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  رقم الباج الوظيفي / المعرف
                </label>
                <input
                  type="text"
                  value={newBadge}
                  onChange={(e) => setNewBadge(e.target.value)}
                  placeholder="EMP-1025"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden font-mono"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  حفظ وتسجيل في القائمة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT EMPLOYEE */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  تعديل بيانات القيد الوظيفي
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  التصنيف والقائمة
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditCategory('منتسب')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      editCategory === 'منتسب'
                        ? 'bg-stone-900 text-amber-300 border-stone-900 shadow-xs'
                        : 'bg-stone-50 text-stone-600 border-stone-200'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>قائمة المنتسبين</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditCategory('باحث')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      editCategory === 'باحث'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-stone-50 text-stone-600 border-stone-200'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>قائمة الباحثين والأساتذة</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  الاسم الكامل *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>

              {editCategory === 'باحث' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
                      اللقب العلمي
                    </label>
                    <input
                      type="text"
                      value={editAcademicDegree}
                      onChange={(e) => setEditAcademicDegree(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
                      الاختصاص
                    </label>
                    <input
                      type="text"
                      value={editSpecialization}
                      onChange={(e) => setEditSpecialization(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    العنوان الوظيفي
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    القسم / الشعبة
                  </label>
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  رقم الباج الوظيفي
                </label>
                <input
                  type="text"
                  value={editBadge}
                  onChange={(e) => setEditBadge(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteConfirmEmployee && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-rose-200 dark:border-rose-900 max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  تأكيد حذف القيد بشكل نهائي
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  هل أنت متأكد من حذف ({deleteConfirmEmployee.name})؟
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl text-xs text-rose-800 dark:text-rose-300 leading-relaxed border border-rose-200 dark:border-rose-900/60">
              سيتم حذف القيد نهائياً من سجل {determineEmployeeCategory(deleteConfirmEmployee) === 'باحث' ? 'الباحثين والأساتذة' : 'المنتسبين'}، وفك ارتباط اسمه من المعاملات المرتبطة حتى لا يظهر مجدداً.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmEmployee(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-confirm-delete-employee"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                نعم، احذف القيد نهائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
