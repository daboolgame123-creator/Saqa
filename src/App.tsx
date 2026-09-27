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
import { Transaction, TransactionStatus, Employee, UserRole, Attachment, NavigationTarget, User, TransactionEmployee, DailySituationRecord, EmployeeLeave, EmployeeTimePermission, EmployeeAssignment, EmployeeCourse } from './types';
import { StorageService, AuthService, TransactionService, TransactionEmployeeService, DailySituationService } from './services';
import { getDataAdapter, primeDataSource } from './api';
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

  // ── PHASE 10 — API Data Layer ────────────────────────────────────────────
  // البيانات تُقرأ وتُكتب عبر `IDataAdapter` غير المتزامن (API افتراضياً،
  // localStorage كـfallback للتطوير). الوضع الليلي يبقى على localStorage:
  // تفضيل جهاز لا بيانات نطاق المرحلة.
  //
  // الحالة تبدأ فارغة مع `isDataLoading`، لأن القراءة صارت غير متزامنة.
  // لا نكتب أي حالة قبل نجاح القراءة — حالة جزئية كانت ستُفقد بيانات.
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionEmployees, setTransactionEmployees] = useState<TransactionEmployee[]>([]);
  const [dailySituations, setDailySituations] = useState<DailySituationRecord[]>([]);
  const [employeeLeaves, setEmployeeLeaves] = useState<EmployeeLeave[]>([]);
  const [employeeTimePermissions, setEmployeeTimePermissions] = useState<EmployeeTimePermission[]>([]);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [employeeCourses, setEmployeeCourses] = useState<EmployeeCourse[]>([]);

  // التحميل الافتتاحي: مصدر واحد يُختار مرة واحدة (api أو local).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dataSource = await primeDataSource();
      const [loadedEmployees, loadedTransactions, loadedSituations] = await Promise.all([
        dataSource.loadEmployees({}),
        dataSource.loadTransactions(),
        dataSource.loadDailySituations(),
      ]);
      // الروابط تُقرأ لكل كتاب على حدة: لا يوجد مسار «كل الروابط»
      // عمداً، لأن الروابط بلا كتاب أو منتسب بلا نطاق لا معنى لها (القاعدة 7).
      const linksPerTransaction = await Promise.all(
        loadedTransactions.map((transaction) => dataSource.loadLinksByTransaction(transaction.id)),
      );
      // مجموعات شؤون المنتسبين تُقرأ بلا تصفية: العرض يفلتر بنفسه.
      const [leaves, timePermissions, assignments, courses] = await Promise.all([
        dataSource.loadLeaves(),
        dataSource.loadTimePermissions(),
        dataSource.loadAssignments(),
        dataSource.loadCourses(),
      ]);
      if (cancelled) {
        return;
      }
      setEmployees(loadedEmployees);
      setTransactions(loadedTransactions);
      setTransactionEmployees(linksPerTransaction.flat());
      setDailySituations(DailySituationService.normalizeRecords(loadedSituations));
      setEmployeeLeaves(leaves);
      setEmployeeTimePermissions(timePermissions);
      setEmployeeAssignments(assignments);
      setEmployeeCourses(courses);
      setIsDataLoading(false);
    })().catch((error: unknown) => {
      if (!cancelled) {
        console.error('[alsqaya] فشل تحميل البيانات الأولية:', error);
        setIsDataLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // ── PHASE 10: الكتابة عبر المصدر الفعّال ─────────────────────────────────
  // المعالجات تُحدّث الحالة (لسرعة الاستجابة) وتكتب عبر `IDataAdapter` في
  // الخلفية. عند فشل الكتابة نُعيد القراءة من المصدر بدل ترك الحالة
  // محلياً متعارضة مع الخادم — مصدر حقيقة واحد لا نسختان متفرقتان.
  //
  // ملاحظة: نستخدم `function` لا دالة سهمية عامة لأن `<T>` في ملف
  // `.tsx` يُفسَّر كـJSX.
  function persist<T>(operation: () => Promise<T>): void {
    void operation().catch(async (error: unknown) => {
      console.error('[alsqaya] فشل الحفظ عبر مصدر البيانات:', error);
      const dataSource = getDataAdapter();
      const [freshEmployees, freshTransactions] = await Promise.all([
        dataSource.loadEmployees({}),
        dataSource.loadTransactions(),
      ]);
      setEmployees(freshEmployees);
      setTransactions(freshTransactions);
    });
  }

  // Add new employee directly from Employees View
  const handleAddEmployee = (newEmp: Omit<Employee, 'id'>) => {
    // المعرّف يولّده المصدر (uuid في الـAPI) ويُعاد البناء بالحقيقي.
    persist(async () => {
      const created = await getDataAdapter().createEmployee(newEmp);
      setEmployees((prev) => [created, ...prev.filter((emp) => emp.name !== created.name)]);
      return created;
    });
  };

  // Update existing employee in registry & sync to transactions if name changed
  const handleUpdateEmployee = (updatedEmp: Employee, oldName?: string) => {
    persist(async () => {
      const saved = await getDataAdapter().updateEmployee(updatedEmp.id, updatedEmp);
      setEmployees((prev) => prev.map((emp) => (emp.id === saved.id ? saved : emp)));
      if (oldName && oldName.trim() !== saved.name.trim()) {
        // اسم الموظف مرآة للعرض داخل الكتاب؛ الربط نفسه يبقى بالمعرّف.
        setTransactions((prev) =>
          prev.map((transaction) => {
            const hasIdMatch = transaction.employeeIds?.includes(saved.id);
            const hasNameMatch = transaction.employeeName?.trim() === oldName.trim();
            return hasIdMatch || hasNameMatch
              ? { ...transaction, employeeName: saved.name.trim() }
              : transaction;
          }),
        );
      }
      return saved;
    });
  };

  /**
   * حذف الموظف: الخطة §32 تمنعه، والخادم لا يوفّر له مساراً.
   * لذلك نطبّق القاعدة المعتمدة: نقله إلى «موظف سابق» لا حذف.
   * سبب انتهاء الخدمة إلزامي عند النقل، فيختاره المستخدم — لا نخترعه.
   */
  const handleDeleteEmployee = (empId: string, serviceEndReason: string) => {
    persist(async () => {
      const moved = await getDataAdapter().changeEmployeeStatus(empId, {
        status: 'former',
        serviceEndReason,
      });
      setEmployees((prev) => prev.map((emp) => (emp.id === moved.id ? moved : emp)));
      // فك ارتباطه من الكتب مع بقاء اسمه فيها للعرض والأرشيف (§13).
      setTransactionEmployees((prev) =>
        TransactionEmployeeService.removeForEmployee(prev, empId),
      );
      setTransactions((prev) =>
        prev.map((transaction) => {
          if (transaction.employeeIds?.includes(empId) !== true) {
            return transaction;
          }
          return {
            ...transaction,
            employeeIds: transaction.employeeIds.filter((id) => id !== empId),
          };
        }),
      );
      return moved;
    });
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
    const unread = transactions.filter((item) => !item.isRead);
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
    // كل الكتب غير المقروءة تُعلَّم في القاعدة بمسمار واحد لكل كتاب.
    for (const item of unread) {
      persist(async () => {
        const saved = await getDataAdapter().updateTransaction(item.id, {
          isRead: true,
          readAt: nowTime,
        });
        setTransactions((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)));
        return saved;
      });
    }
  };

  // Toggle single read status
  const handleToggleReadStatus = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nowTime = getCurrentTimeFormatted();
    const current = transactions.find((item) => item.id === id);
    const nextRead = !(current?.isRead ?? false);
    setTransactions((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, isRead: nextRead, readAt: nextRead ? nowTime : undefined }
          : item
      )
    );
    if (selectedTransaction && selectedTransaction.id === id) {
      setSelectedTransaction((prev) =>
        prev
          ? { ...prev, isRead: nextRead, readAt: nextRead ? nowTime : undefined }
          : null
      );
    }
    persist(async () => {
      const saved = await getDataAdapter().updateTransaction(id, {
        isRead: nextRead,
        readAt: nextRead ? nowTime : undefined,
      });
      setTransactions((prev) => prev.map((item) => (item.id === id ? saved : item)));
      return saved;
    });
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
    // PHASE 5: الروابط تُنشأ مع الكتاب داخل معاملة واحدة؛ employeeIds
    // مرآة توافق مشتقة منها، والخادم يعيد الروابط بالمعرّفات الحقيقية.
    persist(async () => {
      const created = await getDataAdapter().createTransaction({
        ...normalized,
        employeeLinks: (normalized.employeeIds ?? []).map((employeeId) => ({ employeeId })),
        attachments: normalized.attachments.map((attachment) => ({
          name: attachment.name,
          type: String(attachment.type),
          fileSize: attachment.fileSize,
          uploadDate: attachment.uploadDate,
        })),
      });
      setTransactions((prev) => [created, ...prev]);
      setTransactionEmployees((prev) => [
        ...prev,
        ...(created.employeeIds ?? []).map((employeeId) => ({
          id: `link-${created.id}-${employeeId}`,
          transactionId: created.id,
          employeeId,
        })),
      ]);
      return created;
    });
  };

  /**
   * PHASE 6 — إضافة قيود الموقف اليومي المستقلة القادمة من نموذج الإنشاء.
   * الدمج idempotent بالمعرّف: لا تكرار ولا استبدال لأي قيد موجود (Rule 3).
   */
  const handleAddDailySituationRecords = (records: DailySituationRecord[]) => {
    if (!records || records.length === 0) return;
    persist(async () => {
      const created = await Promise.all(
        records.map((record) => getDataAdapter().createDailySituation(record)),
      );
      setDailySituations((prev) => DailySituationService.mergeRecords(prev, created));
      return created;
    });
  };

  // Save entire transaction updates (fields, attachments, edits)
  const handleSaveTransaction = (updatedTr: Transaction) => {
    const prepared = TransactionService.prepare(updatedTr);
    if (prepared.ok === false) {
      console.error('رفض حفظ معاملة غير صالحة:', prepared.errors);
      return;
    }
    const normalized = AuthService.normalizeTransaction(prepared.value, employees);
    persist(async () => {
      const saved = await getDataAdapter().updateTransaction(normalized.id, normalized);
      setTransactions((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      if (selectedTransaction && selectedTransaction.id === saved.id) {
        setSelectedTransaction(saved);
      }
      if (editingTransaction && editingTransaction.id === saved.id) {
        setEditingTransaction(saved);
      }
      return saved;
    });
  };

  /**
   * حذف الكتاب: الخطة §13/§32 لا تحذفه، والخادم لا يوفّر له مساراً
   * (الحذف الناعم مرحلة لاحقة بأعمدة لم تُخترع هنا).
   * لذلك نكتفي بفكّ ارتباطه محلياً ولا نُرسل أي حذف.
   */
  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((item) => item.id !== id));
    setTransactionEmployees((prev) => TransactionEmployeeService.removeForTransaction(prev, id));
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
    // المرفقات بيانات وصفية فقط: بلا بايتات (التخزين المركزي Phase 14).
    persist(async () => {
      const saved = await getDataAdapter().updateTransaction(transactionId, {
        attachments: updatedAttachments.map((attachment) => ({
          name: attachment.name,
          type: String(attachment.type),
          fileSize: attachment.fileSize,
          uploadDate: attachment.uploadDate,
        })),
      });
      setTransactions((prev) =>
        prev.map((item) => (item.id === transactionId ? saved : item)),
      );
      return saved;
    });
  };

  // Save Director's Directive handler
  const handleSaveDirective = (transactionId: string, directiveText: string, actionRequired: boolean) => {
    const nowTime = getCurrentTimeFormatted();
    const directive = { text: directiveText, date: nowTime, actionRequired };
    setTransactions((prev) =>
      prev.map((item) =>
        item.id === transactionId ? { ...item, directorDirective: directive } : item
      )
    );
    if (selectedTransaction && selectedTransaction.id === transactionId) {
      setSelectedTransaction((prev) => (prev ? { ...prev, directorDirective: directive } : null));
    }
    persist(async () => {
      const saved = await getDataAdapter().updateTransaction(transactionId, {
        directorDirective: directive,
      });
      setTransactions((prev) =>
        prev.map((item) => (item.id === transactionId ? saved : item)),
      );
      return saved;
    });
  };

  // PHASE 10: القراءة الأولية غير متزامنة. نعرض مؤشر تحميل بدل واجهة
  // فارغة — القائمة الفارغة قد تعني «لا بيانات» لا «لم تُحمَّل بعد».
  if (isDataLoading) {
    return (
      <div className="min-h-screen bg-[#faf9f6] dark:bg-stone-950 text-[#1c1917] dark:text-stone-100 flex items-center justify-center font-['Tajawal',sans-serif]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-stone-300 dark:border-stone-700 border-t-stone-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-stone-500 dark:text-stone-400">جارٍ تحميل البيانات…</p>
        </div>
      </div>
    );
  }

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
