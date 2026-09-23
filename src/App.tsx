import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/layout';
import { 
  TransactionsList, 
  MonthlyReportView, 
  EmployeesView, 
  DailySituationsView, 
  ArchivistStudioView 
} from './components/views';
import { 
  TransactionDetailModal, 
  NewTransactionModal, 
  ImageLightboxModal, 
  ArchivistEditorModal 
} from './components/modals';
import { INITIAL_TRANSACTIONS, INITIAL_EMPLOYEES } from './data/mockData';
import { Transaction, TransactionStatus, Employee, UserRole, Attachment, NavigationTarget, User, TransactionEmployee, DailySituationRecord } from './types';
import { StorageService, AuthService, TransactionService, TransactionEmployeeService, DailySituationService } from './services';
import { splitEmployeeNames, isEntityOrDepartmentName, determineEmployeeCategory, isEmployeeMatch } from './utils/employeeUtils';
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = StorageService.loadDarkMode();
    if (saved !== null) {
      return saved;
    }
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    StorageService.saveDarkMode(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [isDarkMode]);

  const [employees, setEmployees] = useState<Employee[]>(() => {
    return StorageService.loadEmployees();
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    return StorageService.loadTransactions(employees);
  });

  // ── PHASE 5 — Transaction↔Employee: العلاقة domain هي مصدر الربط المنطقي ──
  // التحميل يدمج العلاقات المخزّنة مع المشتقة من employeeIds (ترحيل idempotent مطابق
  // للبيانات الحالية)، وemployeeIds بقي على Transaction كـ compatibility mirror فقط.
  const [transactionEmployees, setTransactionEmployees] = useState<TransactionEmployee[]>(() =>
    TransactionEmployeeService.seedFromTransactions(
      StorageService.loadTransactionEmployees(),
      transactions,
      employees
    )
  );

  // ── PHASE 6 — Daily Situation: الموقف اليومي كيان مستقل مرتبط بالمنتسب عبر employeeId ──
  // المصدر المنطقي هو DailySituationRecord. البيانات المدمجة القديمة (isDailySituation +
  // dailySituationData) تبقى كما هي للتوافق (Rule 3).
  // - إن كان مفتاح المجموعة غائباً (بيانات ما قبل PHASE 6) ⇒ تُشتق القيود من النماذج
  //   المدمجة الحالية بترحيل idempotent لا يُنشئ تكراراً (DailySituationService).
  // - إن كان محفوظاً (ولو فارغاً صراحةً) ⇒ يُحترم كما هو ولا يُعاد اشتقاقه.
  const [dailySituations, setDailySituations] = useState<DailySituationRecord[]>(() => {
    if (StorageService.hasDailySituations()) {
      return DailySituationService.normalizeRecords(StorageService.loadDailySituations());
    }
    return DailySituationService.seedFromTransactions([], transactions, employees);
  });

  // Sync to storage on state change
  useEffect(() => {
    StorageService.saveTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    StorageService.saveDailySituations(dailySituations);
  }, [dailySituations]);

  useEffect(() => {
    StorageService.saveTransactionEmployees(transactionEmployees);
  }, [transactionEmployees]);

  useEffect(() => {
    StorageService.saveEmployees(employees);
  }, [employees]);

  // ── PHASE 3 — Employee Profile: مجموعات شؤون المنتسبين (قراءة فقط في هذه المرحلة) ──
  const employeeLeaves = useMemo(() => StorageService.loadLeaves(), []);
  const employeeTimePermissions = useMemo(() => StorageService.loadTimePermissions(), []);
  const employeeAssignments = useMemo(() => StorageService.loadAssignments(), []);
  const employeeCourses = useMemo(() => StorageService.loadCourses(), []);

  const [userRole, setUserRole] = useState<UserRole>('director'); // Default to Director
  const [currentView, setCurrentView] = useState<'transactions' | 'daily-situations' | 'report' | 'employees' | 'archivist-studio'>('transactions');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newModalDefaultMode, setNewModalDefaultMode] = useState<'normal' | 'daily-situation'>('normal');
  const [directAttachmentView, setDirectAttachmentView] = useState<{
    transaction: Transaction;
    attachmentIndex: number;
  } | null>(null);

  // Compute current User object & accessible transactions strictly per RBAC and Access Scope
  const currentUser: User = useMemo(() => AuthService.getUserForRole(userRole), [userRole]);

  const visibleTransactions = useMemo(() => {
    return AuthService.filterTransactionsForUser(currentUser, transactions);
  }, [currentUser, transactions]);

  // If user role switches to employee while in archivist-studio, redirect to transactions
  useEffect(() => {
    if (userRole === 'employee' && currentView === 'archivist-studio') {
      setCurrentView('transactions');
    }
  }, [userRole, currentView]);

  const handleNavigate = (target: NavigationTarget) => {
    setNavigationTarget(target);
    if (target.view) {
      setCurrentView(target.view);
    }
  };

  // Detect direct link URL params (e.g. ?role=director)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role') || params.get('user');
      if (roleParam === 'director') {
        setUserRole('director');
      } else if (roleParam === 'archivist') {
        setUserRole('archivist');
      }
    } catch {
      // ignore
    }
  }, []);

  // Helper to ensure any employee mentioned in a transaction exists in the employees registry as separate individuals
  const registerEmployeeIfNew = (
    employeeName?: string,
    department?: string,
    date?: string,
    transactionCategory?: string
  ) => {
    if (!employeeName || !employeeName.trim()) return;
    const individualNames = splitEmployeeNames(employeeName);

    setEmployees((prev) => {
      let updated = [...prev];
      individualNames.forEach((cleanName) => {
        const trimmed = cleanName.trim();
        if (!trimmed || isEntityOrDepartmentName(trimmed)) return;
        const exists = updated.some(
          (emp) => isEmployeeMatch(emp.name, trimmed)
        );
        if (!exists) {
          const isResearcher =
            transactionCategory === 'الأساتذة' ||
            determineEmployeeCategory({ name: trimmed, department }) === 'باحث';

          const newEmp: Employee = {
            id: `emp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            name: trimmed,
            title: isResearcher ? 'باحث / أستاذ' : 'منتسب',
            category: isResearcher ? 'باحث' : 'منتسب',
            department: department && !isEntityOrDepartmentName(department)
              ? department
              : isResearcher
              ? 'مركز الدراسات الافريقية - قسم الأساتذة والبحوث'
              : 'شعبة الذاتية والإدارية',
            academicDegree: isResearcher ? 'أستاذ مساعد دكتور' : undefined,
            specialization: isResearcher ? 'دراسات وبحوث تخصصية' : undefined,
            badgeNumber: `${isResearcher ? 'RES' : 'EMP'}-${Math.floor(1000 + Math.random() * 9000)}`,
            joinedDate: date || new Date().toISOString().split('T')[0],
          };
          updated = [newEmp, ...updated];
        }
      });
      return updated;
    });
  };

  // Add new employee directly from Employees View
  const handleAddEmployee = (newEmp: Omit<Employee, 'id'>) => {
    const fullEmp: Employee = {
      ...newEmp,
      id: `emp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    setEmployees((prev) => [fullEmp, ...prev]);
  };

  // Update existing employee in registry & sync to transactions if name changed
  const handleUpdateEmployee = (updatedEmp: Employee, oldName?: string) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === updatedEmp.id ? updatedEmp : emp))
    );
    if (oldName && oldName.trim() !== updatedEmp.name.trim()) {
      // Sync any transactions that referenced the old name or have the employee ID
      setTransactions((prev) =>
        prev.map((t) => {
          const hasIdMatch = t.employeeIds?.includes(updatedEmp.id);
          const hasNameMatch = t.employeeName?.trim() === oldName.trim();
          if (hasIdMatch || hasNameMatch) {
            return { ...t, employeeName: updatedEmp.name.trim() };
          }
          return t;
        })
      );
    }
  };

  // Delete employee from registry and unlink from transactions
  const handleDeleteEmployee = (empId: string) => {
    const target = employees.find((e) => e.id === empId);
    setEmployees((prev) => prev.filter((emp) => emp.id !== empId));
    // PHASE 5: حذف علاقات المنتسب وحدها — لا يحذف أي معاملة (إزالة العلاقة فقط)
    setTransactionEmployees((prev) => TransactionEmployeeService.removeForEmployee(prev, empId));
    setTransactions((prev) =>
      prev.map((t) => {
        const hasIdMatch = t.employeeIds?.includes(empId);
        const hasNameMatch = Boolean(target && t.employeeName && isEmployeeMatch(t.employeeName, target.name));
        if (hasIdMatch || hasNameMatch) {
          const newIds = t.employeeIds ? t.employeeIds.filter((id) => id !== empId) : undefined;
          const remainingNames = target && t.employeeName
            ? splitEmployeeNames(t.employeeName).filter((n) => !isEmployeeMatch(n, target.name))
            : [];
          return {
            ...t,
            employeeIds: newIds && newIds.length > 0 ? newIds : undefined,
            employeeName: remainingNames.length > 0 ? remainingNames.join(' ، ') : undefined,
          };
        }
        return t;
      })
    );
  };

  // Unread count
  const unreadCount = transactions.filter((t) => !t.isRead).length;

  // Format current time in Arabic
  const getCurrentTimeFormatted = () => {
    return new Intl.DateTimeFormat('ar-IQ', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  };

  // Open & Read Handler: when transaction is opened / clicked
  const handleSelectTransaction = (tr: Transaction) => {
    const nowTime = getCurrentTimeFormatted();
    if (!tr.isRead) {
      const updatedTr: Transaction = {
        ...tr,
        isRead: true,
        readAt: nowTime,
      };
      setTransactions((prev) =>
        prev.map((item) => (item.id === tr.id ? updatedTr : item))
      );
      setSelectedTransaction(updatedTr);
    } else {
      setSelectedTransaction(tr);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = () => {
    const nowTime = getCurrentTimeFormatted();
    setTransactions((prev) =>
      prev.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt || nowTime,
      }))
    );
    if (selectedTransaction) {
      setSelectedTransaction((prev) =>
        prev ? { ...prev, isRead: true, readAt: prev.readAt || nowTime } : null
      );
    }
  };

  // Toggle single read status
  const handleToggleReadStatus = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nowTime = getCurrentTimeFormatted();
    setTransactions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextRead = !item.isRead;
          return {
            ...item,
            isRead: nextRead,
            readAt: nextRead ? nowTime : undefined,
          };
        }
        return item;
      })
    );
    if (selectedTransaction && selectedTransaction.id === id) {
      setSelectedTransaction((prev) =>
        prev ? { ...prev, isRead: !prev.isRead, readAt: !prev.isRead ? nowTime : undefined } : null
      );
    }
  };

  // Directly open attachment full screen in lightbox & mark as read
  const handleViewAttachmentDirectly = (tr: Transaction, attachmentIndex: number = 0) => {
    // Ensure there is at least one previewable document attachment
    const attachmentsToView = (tr.attachments && tr.attachments.length > 0)
      ? tr.attachments
      : [
          {
            id: `att-doc-${tr.id}`,
            name: `كتاب_${tr.number.replace(/[\/\\]/g, '_')}.jpg`,
            type: 'كتاب رئيسي',
            fileSize: '1.2 MB',
            uploadDate: tr.date,
            isImage: true,
          }
        ];

    const safeTr = {
      ...tr,
      attachments: attachmentsToView,
    };

    const targetIdx = Math.max(0, Math.min(attachmentIndex, attachmentsToView.length - 1));

    if (!tr.isRead) {
      const nowTime = getCurrentTimeFormatted();
      const updatedTr: Transaction = {
        ...safeTr,
        isRead: true,
        readAt: nowTime,
      };
      setTransactions((prev) =>
        prev.map((item) => (item.id === tr.id ? updatedTr : item))
      );
      if (selectedTransaction?.id === tr.id) {
        setSelectedTransaction(updatedTr);
      }
      setDirectAttachmentView({ transaction: updatedTr, attachmentIndex: targetIdx });
    } else {
      setDirectAttachmentView({ transaction: safeTr, attachmentIndex: targetIdx });
    }
  };

  // Update Status handler (قيد المراجعة / مكتمل) — BR-03
  const handleUpdateStatus = (id: string, newStatus: TransactionStatus) => {
    setTransactions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    if (selectedTransaction && selectedTransaction.id === id) {
      setSelectedTransaction((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // Add new transaction (by archivist)
  const handleAddTransaction = (newTr: Transaction) => {
    const prepared = TransactionService.prepare(newTr);
    if (prepared.ok === false) {
      console.error('رفض حفظ معاملة غير صالحة:', prepared.errors);
      return;
    }
    const normalized = AuthService.normalizeTransaction(prepared.value, employees);
    // PHASE 5: العلاقة domain هي المصدر — المزامنة من employeeIds المحرَّرة ثم اشتقاق المرآة منها
    const syncedRelations = TransactionEmployeeService.syncForTransaction(
      transactionEmployees,
      normalized.id,
      normalized.employeeIds ?? []
    );
    setTransactionEmployees(syncedRelations);
    const mirrored: Transaction = {
      ...normalized,
      employeeIds: TransactionEmployeeService.employeeIdsForTransaction(syncedRelations, normalized.id),
    };
    const withMirror = mirrored.employeeIds && mirrored.employeeIds.length > 0 ? mirrored : { ...mirrored, employeeIds: undefined };
    setTransactions((prev) => [withMirror, ...prev]);
    if (withMirror.employeeName) {
      registerEmployeeIfNew(withMirror.employeeName, withMirror.entity, withMirror.date, withMirror.category);
    }
  };

  /**
   * PHASE 6 — إضافة قيود الموقف اليومي المستقلة القادمة من نموذج الإنشاء.
   * الدمج idempotent بالمعرّف: لا تكرار ولا استبدال لأي قيد موجود (Rule 3).
   */
  const handleAddDailySituationRecords = (records: DailySituationRecord[]) => {
    if (!records || records.length === 0) return;
    setDailySituations((prev) => DailySituationService.mergeRecords(prev, records));
  };

  // Save entire transaction updates (fields, attachments, edits)
  const handleSaveTransaction = (updatedTr: Transaction) => {
    const prepared = TransactionService.prepare(updatedTr);
    if (prepared.ok === false) {
      console.error('رفض حفظ معاملة غير صالحة:', prepared.errors);
      return;
    }
    const normalized = AuthService.normalizeTransaction(prepared.value, employees);
    // PHASE 5: العلاقة domain هي المصدر — المزامنة ثم اشتقاق employeeIds كمرآة توافق
    const syncedRelations = TransactionEmployeeService.syncForTransaction(
      transactionEmployees,
      normalized.id,
      normalized.employeeIds ?? []
    );
    setTransactionEmployees(syncedRelations);
    const mirrored: Transaction = {
      ...normalized,
      employeeIds: TransactionEmployeeService.employeeIdsForTransaction(syncedRelations, normalized.id),
    };
    const withMirror = mirrored.employeeIds && mirrored.employeeIds.length > 0 ? mirrored : { ...mirrored, employeeIds: undefined };
    setTransactions((prev) =>
      prev.map((item) => (item.id === withMirror.id ? withMirror : item))
    );
    if (withMirror.employeeName) {
      registerEmployeeIfNew(withMirror.employeeName, withMirror.entity, withMirror.date, withMirror.category);
    }
    if (selectedTransaction && selectedTransaction.id === withMirror.id) {
      setSelectedTransaction(withMirror);
    }
    if (editingTransaction && editingTransaction.id === withMirror.id) {
      setEditingTransaction(withMirror);
    }
  };

  // Delete transaction permanently
  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((item) => item.id !== id));
    // PHASE 5: حذف علاقات المعاملة وحدها — لا يحذف أي منتسب
    setTransactionEmployees((prev) => TransactionEmployeeService.removeForTransaction(prev, id));
    // PHASE 6: حذف قيود الموقف اليومي التابعة للمعاملة وحدها — لا يحذف أي منتسب ولا أي قيد آخر
    setDailySituations((prev) => DailySituationService.removeForTransaction(prev, id));
    if (selectedTransaction?.id === id) {
      setSelectedTransaction(null);
    }
    if (editingTransaction?.id === id) {
      setEditingTransaction(null);
    }
  };

  // Update attachments for any transaction (add photos, edit name/type, delete)
  const handleUpdateAttachments = (transactionId: string, updatedAttachments: Attachment[]) => {
    setTransactions((prev) =>
      prev.map((item) =>
        item.id === transactionId ? { ...item, attachments: updatedAttachments } : item
      )
    );
    if (selectedTransaction && selectedTransaction.id === transactionId) {
      setSelectedTransaction((prev) =>
        prev ? { ...prev, attachments: updatedAttachments } : null
      );
    }
  };

  // Save Director's Directive handler
  const handleSaveDirective = (transactionId: string, directiveText: string, actionRequired: boolean) => {
    const nowTime = getCurrentTimeFormatted();
    setTransactions((prev) =>
      prev.map((item) =>
        item.id === transactionId
          ? {
              ...item,
              directorDirective: {
                text: directiveText,
                date: nowTime,
                actionRequired,
              },
            }
          : item
      )
    );
    if (selectedTransaction && selectedTransaction.id === transactionId) {
      setSelectedTransaction((prev) =>
        prev
          ? {
              ...prev,
              directorDirective: {
                text: directiveText,
                date: nowTime,
                actionRequired,
              },
            }
          : null
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-stone-950 text-[#1c1917] dark:text-stone-100 flex flex-col font-['Tajawal',sans-serif] transition-colors">
      {/* App Header */}
      <Header
        currentView={currentView}
        setCurrentView={setCurrentView}
        onOpenNewModal={() => {
          setNewModalDefaultMode('normal');
          setIsNewModalOpen(true);
        }}
        transactions={visibleTransactions}
        userRole={userRole}
        setUserRole={setUserRole}
        onMarkAllAsRead={handleMarkAllAsRead}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Dynamic Views */}
        {currentView === 'transactions' && (
          <TransactionsList
            transactions={visibleTransactions}
            onSelectTransaction={handleSelectTransaction}
            onToggleReadStatus={handleToggleReadStatus}
            onMarkAllAsRead={handleMarkAllAsRead}
            onUpdateStatus={handleUpdateStatus}
            onOpenNewModal={() => {
              setNewModalDefaultMode('normal');
              setIsNewModalOpen(true);
            }}
            userRole={userRole}
            onViewAttachmentDirectly={handleViewAttachmentDirectly}
            onSaveDirective={handleSaveDirective}
            onEditTransaction={(tr) => setEditingTransaction(tr)}
            onDeleteTransaction={handleDeleteTransaction}
            onNavigateToStudio={() => setCurrentView('archivist-studio')}
            onNavigate={handleNavigate}
            navigationTarget={navigationTarget}
          />
        )}

        {currentView === 'daily-situations' && (
          <DailySituationsView
            transactions={visibleTransactions}
            dailySituations={dailySituations}
            employees={employees}
            onSelectTransaction={handleSelectTransaction}
            onOpenNewDailySituation={() => {
              setNewModalDefaultMode('daily-situation');
              setIsNewModalOpen(true);
            }}
            onEditTransaction={(tr) => setEditingTransaction(tr)}
            onDeleteTransaction={handleDeleteTransaction}
            onViewAttachment={handleViewAttachmentDirectly}
            onNavigate={handleNavigate}
            navigationTarget={navigationTarget}
          />
        )}

        {currentView === 'archivist-studio' && (
          <ArchivistStudioView
            transactions={transactions}
            employees={employees}
            onSaveTransaction={handleSaveTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onOpenNewModal={() => {
              setNewModalDefaultMode('normal');
              setIsNewModalOpen(true);
            }}
            onViewAttachmentDirectly={handleViewAttachmentDirectly}
          />
        )}

        {currentView === 'report' && (
          <MonthlyReportView
            transactions={visibleTransactions}
            transactionEmployees={transactionEmployees}
            onSelectTransaction={handleSelectTransaction}
            onNavigate={handleNavigate}
            onViewAttachmentDirectly={handleViewAttachmentDirectly}
          />
        )}

        {currentView === 'employees' && (
          <EmployeesView
            employees={employees}
            transactions={visibleTransactions}
            transactionEmployees={transactionEmployees}
            employeeLeaves={employeeLeaves}
            employeeTimePermissions={employeeTimePermissions}
            employeeAssignments={employeeAssignments}
            employeeCourses={employeeCourses}
            dailySituations={dailySituations}
            onSelectTransaction={handleSelectTransaction}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            userRole={userRole}
            onNavigate={handleNavigate}
            navigationTarget={navigationTarget}
            onViewAttachmentDirectly={handleViewAttachmentDirectly}
            onSaveTransaction={handleSaveTransaction}
          />
        )}
      </main>

      {/* Modals */}
      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onUpdateStatus={handleUpdateStatus}
          onToggleReadStatus={() => handleToggleReadStatus(selectedTransaction.id)}
          onUpdateAttachments={handleUpdateAttachments}
        />
      )}

      {/* Full Comprehensive Archivist Editor Modal */}
      {editingTransaction && (
        <ArchivistEditorModal
          isOpen={true}
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaveTransaction={handleSaveTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          employees={employees.map((e) => e.name)}
          allEmployees={employees}
          transactionEmployees={transactionEmployees}
          onOpenLightbox={(att, atts, idx) => {
            if (editingTransaction) {
              setDirectAttachmentView({
                transaction: { ...editingTransaction, attachments: atts },
                attachmentIndex: idx,
              });
            }
          }}
        />
      )}

      {isNewModalOpen && (
        <NewTransactionModal
          isOpen={true}
          onClose={() => setIsNewModalOpen(false)}
          onAddTransaction={handleAddTransaction}
          onAddDailySituationRecords={handleAddDailySituationRecords}
          employees={employees.map((e) => e.name)}
          allEmployees={employees}
          defaultMode={newModalDefaultMode}
        />
      )}

      {/* Direct Full-Screen Image & Document Lightbox with Fixed Exit Button */}
      {directAttachmentView && directAttachmentView.transaction.attachments && directAttachmentView.transaction.attachments.length > 0 && (
        <ImageLightboxModal
          attachment={
            directAttachmentView.transaction.attachments[directAttachmentView.attachmentIndex] ||
            directAttachmentView.transaction.attachments[0]
          }
          attachments={directAttachmentView.transaction.attachments}
          currentIndex={directAttachmentView.attachmentIndex}
          onIndexChange={(idx) => setDirectAttachmentView((prev) => prev ? { ...prev, attachmentIndex: idx } : null)}
          transactionTitle={directAttachmentView.transaction.subject}
          transactionNumber={directAttachmentView.transaction.number}
          onClose={() => setDirectAttachmentView(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 py-4 px-6 text-center text-xs text-stone-500 dark:text-stone-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>منظومة متابعة الذاتية والتقارير • الإصدار التجريبي 0.1 • رابط مباشر لمدير المركز</span>
          <span className="flex items-center gap-1.5 text-stone-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> اتصال محمي ومباشر
          </span>
        </div>
      </footer>
    </div>
  );
}
