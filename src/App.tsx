import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/layout';
import {
  TransactionsList,
  MonthlyReportView,
  EmployeesView,
  DailySituationsView,
  ArchivistStudioView,
  UnifiedSearchView
} from './components/views';
import { 
  TransactionDetailModal, 
  NewTransactionModal, 
  ImageLightboxModal, 
  ArchivistEditorModal 
} from './components/modals';
import { INITIAL_TRANSACTIONS, INITIAL_EMPLOYEES } from './data/mockData';
import { Transaction, TransactionStatus, Employee, UserRole, Attachment, NavigationTarget, User, TransactionEmployee, DailySituationRecord, EmployeeLeave, EmployeeTimePermission, EmployeeAssignment, EmployeeCourse } from './types';
import { StorageService, AuthService, TransactionService, TransactionEmployeeService, DailySituationService, buildTransactionUpdatePatch } from './services';
import { getDataAdapter } from './api';
import { loadPilotStartupData } from './api/pilotBootstrap';
import { archivePilotTransaction, transitionPilotTransactionStatus, savePilotTransactionDirective } from './api/pilotTransactionActions';
import { ArchivedTransactionsPanel } from './components/views/ArchivedTransactionsPanel';
import { buildPilotTransactionCreatePayload } from './services/pilotTransactionCreatePayload';
import { buildPilotEmployeeBody } from './services/pilotEmployeePayload';
import { ApiError } from './api/apiError';
import { acknowledgeTransactionOfficial } from './api/acknowledgement';
import { loginWithServer, logoutFromServer, changeSecretWithServer, userFromServerAccount, type ServerAccount } from './api/pilotAuth';
import { getBearerToken, onBearerInvalidated } from './api/sessionToken';
import { PilotLoginScreen, PilotChangeSecretScreen } from './components/views/PilotAuthScreens';
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
  // localStorage فقط عند اختيار الوضع التجريبي). الوضع الليلي يبقى على localStorage:
  // تفضيل جهاز لا بيانات نطاق المرحلة.
  //
  // الحالة تبدأ فارغة مع `isDataLoading`، لأن القراءة صارت غير متزامنة.
  // لا نكتب أي حالة قبل نجاح القراءة — حالة جزئية كانت ستُفقد بيانات.
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  // API mode never uses a mock account, and no session survives a page reload.
  const isLocalDemo = getDataAdapter().kind === 'local';
  const [serverAccount, setServerAccount] = useState<ServerAccount | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionEmployees, setTransactionEmployees] = useState<TransactionEmployee[]>([]);
  const [dailySituations, setDailySituations] = useState<DailySituationRecord[]>([]);
  const [employeeLeaves, setEmployeeLeaves] = useState<EmployeeLeave[]>([]);
  const [employeeTimePermissions, setEmployeeTimePermissions] = useState<EmployeeTimePermission[]>([]);
  const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeAssignment[]>([]);
  const [employeeCourses, setEmployeeCourses] = useState<EmployeeCourse[]>([]);
  // Official API mutations are confirmed by server responses, never optimistic.
  const [transactionActionBusy, setTransactionActionBusy] = useState(false);
  const [transactionActionError, setTransactionActionError] = useState<string | null>(null);
  const [showArchivedTransactions, setShowArchivedTransactions] = useState(false);
  const transactionMutationLock = useRef(false);
  const sessionGeneration = useRef(0);

  // Session invalidation (server 401 / logout / secret change) immediately
  // removes the authenticated UI and any previously loaded resource data.
  useEffect(() => onBearerInvalidated(() => {
    sessionGeneration.current++;
    transactionMutationLock.current = false;
    setTransactionActionBusy(false);
    setTransactionActionError(null);
    setShowArchivedTransactions(false);
    setServerAccount(null);
    setIsDataLoading(true);
    setStartupError(null);
    setEmployees([]);
    setTransactions([]);
    setTransactionEmployees([]);
    setDailySituations([]);
    setEmployeeLeaves([]);
    setEmployeeTimePermissions([]);
    setEmployeeAssignments([]);
    setEmployeeCourses([]);
    setSelectedTransaction(null);
    setEditingTransaction(null);
    setDirectAttachmentView(null);
  }), []);

  // Load data only after login+identity validation (or explicit local demo).
  useEffect(() => {
    if (!isLocalDemo && (serverAccount === null || serverAccount.mustChangeSecret)) return;
    let cancelled = false;
    const generation = sessionGeneration.current;
    const token = isLocalDemo ? null : getBearerToken();
    const isCurrent = () => !cancelled && generation === sessionGeneration.current &&
      (isLocalDemo || (token !== null && getBearerToken() === token));

    setIsDataLoading(true);
    setStartupError(null);
    if (!isLocalDemo && token === null) {
      // A stale React account cannot grant read access after token removal.
      setStartupError('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      setIsDataLoading(false);
      return;
    }
    void (async () => {
      const loaded = await loadPilotStartupData(
        getDataAdapter(),
        serverAccount?.role ?? 'director', // explicit local demo has no server account
        isCurrent, // never process data from an expired/replaced Bearer session
      );
      if (!isCurrent()) return;
      setEmployees(loaded.employees);
      setTransactions(loaded.transactions);
      setTransactionEmployees(loaded.transactionEmployees);
      setDailySituations(DailySituationService.normalizeRecords(loaded.dailySituations));
      setEmployeeLeaves(loaded.employeeLeaves);
      setEmployeeTimePermissions(loaded.employeeTimePermissions);
      setEmployeeAssignments(loaded.employeeAssignments);
      setEmployeeCourses(loaded.employeeCourses);
      setIsDataLoading(false);
    })().catch((error: unknown) => {
      if (isCurrent()) {
        console.error('[alsqaya] فشل تحميل البيانات الأولية:', error);
        // Phase23 pilot: never render empty or local data as successful API output.
        // No sensitive backend details are echoed to the UI.
        const message = error instanceof ApiError && error.status === 401
          ? 'انتهت جلسة الدخول أو تعذّر التحقق منها. يرجى تسجيل الدخول مجددًا.'
          : error instanceof ApiError && error.status === 403
            ? 'لا تملك صلاحية قراءة هذه البيانات.'
            : 'تعذّر تحميل بيانات السقاية من الخادم. لم يتم الانتقال إلى التخزين المحلي.';
        setStartupError(message);
        setIsDataLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLocalDemo, serverAccount]);

  const [demoUserRole, setDemoUserRole] = useState<UserRole>('director');
  // This value is display-only; the backend determines actual permissions.
  const userRole: UserRole = isLocalDemo ? demoUserRole : (serverAccount?.role ?? 'employee');
  // API mode: use the session role and the server's admin-only mutation policy.
  const canManageRecords = isLocalDemo || serverAccount?.role === 'admin';
  const canViewDailySituations = isLocalDemo || serverAccount?.role === 'admin' || serverAccount?.role === 'director';

  async function handleLogin(identifier: string, secret: string): Promise<void> {
    const generation = sessionGeneration.current;
    const account = await loginWithServer(identifier, secret);
    if (generation !== sessionGeneration.current || getBearerToken() === null) {
      throw new Error('Session changed during login');
    }
    setServerAccount(account);
    setStartupError(null);
    setIsDataLoading(true);
  }

  async function handleSecretChange(currentSecret: string, newSecret: string): Promise<void> {
    await changeSecretWithServer(currentSecret, newSecret);
    // Server revokes the old session. The invalidation listener returns to login.
  }

  function handleLogout(): void {
    void logoutFromServer().catch(() => {
      // Server may be offline. The volatile session is still destroyed.
    });
  }
  const [currentView, setCurrentView] = useState<'transactions' | 'daily-situations' | 'report' | 'employees' | 'archivist-studio'>('transactions');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);
  // Phase 22 — UI-09: فتح/إغلاق لوحة البحث الموحّد.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newModalDefaultMode, setNewModalDefaultMode] = useState<'normal' | 'daily-situation'>('normal');
  const [directAttachmentView, setDirectAttachmentView] = useState<{
    transaction: Transaction;
    attachmentIndex: number;
  } | null>(null);

  // Compute current User object & accessible transactions strictly per RBAC and Access Scope
  const currentUser: User | null = useMemo(
    () => isLocalDemo ? AuthService.getUserForRole(userRole)
      : serverAccount === null ? null : userFromServerAccount(serverAccount),
    [isLocalDemo, serverAccount, userRole],
  );

  const visibleTransactions = useMemo(() => {
    // API rows were already authorized and filtered in SQL by the server.
    // Reapplying mock client visibility could hide valid personal grants.
    return isLocalDemo && currentUser !== null
      ? AuthService.filterTransactionsForUser(currentUser, transactions)
      : currentUser !== null ? transactions : [];
  }, [currentUser, transactions, isLocalDemo]);

  // The legacy studio contains local-only writes; the real API pilot never opens it.
  useEffect(() => {
    if ((currentView === 'archivist-studio' && (!isLocalDemo || userRole === 'employee')) ||
        (currentView === 'daily-situations' && !canViewDailySituations)) {
      setCurrentView('transactions');
    }
  }, [userRole, currentView, isLocalDemo, canViewDailySituations]);

  const handleNavigate = (target: NavigationTarget) => {
    if (!isLocalDemo && target.view === 'archivist-studio') return;
    if (target.view === 'daily-situations' && !canViewDailySituations) return;
    setNavigationTarget(target);
    if (target.view) {
      setCurrentView(target.view);
    }
  };

  // Legacy URL role override is restricted to explicitly selected LOCAL DEMO.
  // A query parameter must never change a server-authenticated identity.
  useEffect(() => {
    if (!isLocalDemo) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role') || params.get('user');
      if (roleParam === 'director') {
        setDemoUserRole('director');
      } else if (roleParam === 'archivist') {
        setDemoUserRole('archivist');
      }
    } catch {
      // ignore
    }
  }, [isLocalDemo]);

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

  // Admin personnel operations in API mode are confirmed by the server before
  // the UI changes. The demo adapter retains its existing local workflow.
  const handleAddEmployee = (newEmp: Omit<Employee, 'id'>): Promise<void> | void => {
    if (!canManageRecords) throw new Error('NOT_AUTHORIZED_TO_CREATE_EMPLOYEE');
    if (!isLocalDemo) {
      const payload = buildPilotEmployeeBody(newEmp);
      const generation = sessionGeneration.current;
      return (async () => {
        const created = await getDataAdapter().createEmployee(payload);
        if (sessionGeneration.current !== generation) throw new Error('SESSION_CHANGED');
        if (!created || typeof created.id !== 'string' || created.id.trim() === '') {
          throw new Error('UNVERIFIED_CREATE_RESPONSE');
        }
        setEmployees((prev) => [created, ...prev.filter((emp) => emp.id !== created.id)]);
      })();
    }
    persist(async () => {
      const created = await getDataAdapter().createEmployee(newEmp);
      setEmployees((prev) => [created, ...prev.filter((emp) => emp.name !== created.name)]);
      return created;
    });
  };

  const handleUpdateEmployee = (updatedEmp: Employee, oldName?: string): Promise<void> | void => {
    if (!canManageRecords) throw new Error('NOT_AUTHORIZED_TO_UPDATE_EMPLOYEE');
    if (!isLocalDemo) {
      const payload = buildPilotEmployeeBody(updatedEmp);
      const generation = sessionGeneration.current;
      return (async () => {
        const saved = await getDataAdapter().updateEmployee(updatedEmp.id, payload);
        if (sessionGeneration.current !== generation) throw new Error('SESSION_CHANGED');
        if (!saved || saved.id !== updatedEmp.id) throw new Error('UNVERIFIED_UPDATE_RESPONSE');
        setEmployees((prev) => prev.map((emp) => emp.id === saved.id ? saved : emp));
        // Do not rewrite book subjects, names or relationships in local state:
        // server-linked transaction history must remain authoritative.
      })();
    }
    persist(async () => {
      const saved = await getDataAdapter().updateEmployee(updatedEmp.id, updatedEmp);
      setEmployees((prev) => prev.map((emp) => (emp.id === saved.id ? saved : emp)));
      if (oldName && oldName.trim() !== saved.name.trim()) {
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

  /** Former employees remain in historical records; only their status changes. */
  const handleDeleteEmployee = (empId: string, serviceEndReason: string): Promise<void> | void => {
    if (!canManageRecords) throw new Error('NOT_AUTHORIZED_TO_CHANGE_EMPLOYEE');
    if (!isLocalDemo) {
      const generation = sessionGeneration.current;
      return (async () => {
        const moved = await getDataAdapter().changeEmployeeStatus(empId, {
          status: 'former', serviceEndReason,
        });
        if (sessionGeneration.current !== generation) throw new Error('SESSION_CHANGED');
        if (!moved || moved.id !== empId || moved.status !== 'former') {
          throw new Error('UNVERIFIED_FORMER_EMPLOYEE_RESPONSE');
        }
        setEmployees((prev) => prev.map((emp) => emp.id === moved.id ? moved : emp));
        // No unlinking: past books must still refer to this employee.
      })();
    }
    persist(async () => {
      const moved = await getDataAdapter().changeEmployeeStatus(empId, {
        status: 'former', serviceEndReason,
      });
      setEmployees((prev) => prev.map((emp) => emp.id === moved.id ? moved : emp));
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
    if (!isLocalDemo) { setSelectedTransaction(tr); return; }
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
    if (!isLocalDemo) return;
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
    // `expectedVersion` (Phase 17) من النسخة المقروءة في الحالة: إن تغيّر
    // السجل في مكان آخر رُفض التعديل (409) بدل الكتابة فوق الأحدث.
    for (const item of unread) {
      persist(async () => {
        const saved = await getDataAdapter().updateTransaction(item.id, {
          isRead: true,
          readAt: nowTime,
          expectedVersion: item.version,
        });
        setTransactions((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)));
        return saved;
      });
    }
  };

  // Toggle single read status
  const handleToggleReadStatus = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isLocalDemo) return;
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
        // نسخة القراءة (Phase 17): `1` احتياطاً إن لم يكن السجل في الحالة
        // (نسخة الإنشاء الافتراضية) — والخادم يرفضها 409 إن كانت قد تغيّرت.
        expectedVersion: current?.version ?? 1,
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

    if (isLocalDemo && !tr.isRead) {
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

  function validMutationRecord(id: string): Transaction | null {
    const record = transactions.find((item) => item.id === id);
    if (!record || !Number.isSafeInteger(record.version) || record.version < 1) {
      setTransactionActionError('لا توجد نسخة معتمدة لهذا الكتاب. أعد تحميل السجل.');
      return null;
    }
    return record;
  }

  function runOfficialTransactionAction<T>(
    request: () => Promise<T>,
    onConfirmed: (result: T) => void,
  ): void {
    if (transactionMutationLock.current) return;
    transactionMutationLock.current = true;
    const generation = sessionGeneration.current;
    setTransactionActionBusy(true);
    setTransactionActionError(null);
    void request()
      .then((result) => {
        if (generation === sessionGeneration.current) onConfirmed(result);
      })
      .catch((error: unknown) => {
        if (generation !== sessionGeneration.current) return;
        const message = error instanceof ApiError && error.status === 409
          ? 'تغيّر الكتاب لدى مستخدم آخر. أعد تحميل الصفحة قبل المحاولة مجددًا.'
          : error instanceof ApiError && (error.status === 403 || error.status === 404)
            ? 'رفض الخادم العملية أو لم يعد الكتاب متاحًا ضمن نطاقك.'
            : 'تعذّر تأكيد العملية في الخادم. تحقق من السجل قبل إعادة المحاولة.';
        setTransactionActionError(message);
      })
      .finally(() => {
        if (generation !== sessionGeneration.current) return;
        transactionMutationLock.current = false;
        setTransactionActionBusy(false);
      });
  }

  /** After confirmed restore, rebuild every scoped API dataset together. */
  async function handleRestoredTransaction(_restored: Transaction): Promise<void> {
    if (isLocalDemo || serverAccount?.role !== 'admin') {
      throw new Error('Official admin session required for archive refresh');
    }
    const generation = sessionGeneration.current;
    const token = getBearerToken();
    const stillCurrent = () => token !== null &&
      getBearerToken() === token && sessionGeneration.current === generation;
    if (!stillCurrent()) throw new Error('Session changed during archive refresh');
    const loaded = await loadPilotStartupData(getDataAdapter(), 'admin', stillCurrent);
    if (!stillCurrent()) {
      throw new Error('Session changed during archive refresh');
    }
    setEmployees(loaded.employees);
    setTransactions(loaded.transactions);
    setTransactionEmployees(loaded.transactionEmployees);
    setDailySituations(DailySituationService.normalizeRecords(loaded.dailySituations));
    setEmployeeLeaves(loaded.employeeLeaves);
    setEmployeeTimePermissions(loaded.employeeTimePermissions);
    setEmployeeAssignments(loaded.employeeAssignments);
    setEmployeeCourses(loaded.employeeCourses);
  }

  // Status changes are explicit, versioned server writes in official mode.
  const handleUpdateStatus = (id: string, newStatus: TransactionStatus) => {
    if (!isLocalDemo) {
      if (!canManageRecords || transactionMutationLock.current) return;
      const record = validMutationRecord(id);
      if (!record) return;
      if (record.status === newStatus) return;
      runOfficialTransactionAction(
        () => transitionPilotTransactionStatus(id, newStatus, record.version),
        (saved) => {
          setTransactions((prev) => prev.map((item) => item.id === saved.id ? saved : item));
          setSelectedTransaction((prev) => prev?.id === saved.id ? saved : prev);
          setEditingTransaction((prev) => prev?.id === saved.id ? saved : prev);
        },
      );
      return;
    }
    setTransactions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    if (selectedTransaction && selectedTransaction.id === id) {
      setSelectedTransaction((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // Add new transaction (by archivist)
  const handleAddTransaction = (newTr: Transaction): Promise<void> | void => {
    if (!canManageRecords) throw new Error('NOT_AUTHORIZED_TO_CREATE_TRANSACTION');
    const prepared = TransactionService.prepare(newTr);
    if (prepared.ok === false) {
      throw new Error('INVALID_TRANSACTION');
    }
    const normalized = AuthService.normalizeTransaction(prepared.value, employees);

    if (!isLocalDemo) {
      // Fail before POST on unrepresentable legacy daily data or missing
      // attachment bytes; never claim a metadata placeholder was uploaded.
      const payload = buildPilotTransactionCreatePayload(normalized);
      const generation = sessionGeneration.current;
      return (async () => {
        const created = await getDataAdapter().createTransaction(payload);
        if (sessionGeneration.current !== generation) throw new Error('SESSION_CHANGED');
        if (!created || typeof created.id !== 'string' || created.id.trim() === '' ||
            !Number.isSafeInteger(created.version) || created.version < 1) {
          throw new Error('UNVERIFIED_CREATE_RESPONSE');
        }
        // Do not create a local success before the server returns a persisted ID.
        setTransactions((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        // Link rows have server-issued IDs. Read them independently after
        // creation; failure to refresh links must not trigger a duplicate POST.
        void getDataAdapter().loadLinksByTransaction(created.id)
          .then((links) => {
            if (sessionGeneration.current !== generation) return;
            setTransactionEmployees((prev) => [
              ...prev.filter((item) => item.transactionId !== created.id), ...links,
            ]);
          })
          .catch(() => {
            // The book is already persisted. Fresh login reloads link rows.
          });
      })();
    }

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
    if (!canManageRecords) return;
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
  const handleSaveTransaction = (updatedTr: Transaction): Promise<void> | void => {
    if (!canManageRecords) throw new Error('NOT_AUTHORIZED_TO_UPDATE_TRANSACTION');
    const prepared = TransactionService.prepare(updatedTr);
    if (prepared.ok === false) throw new Error('INVALID_TRANSACTION');
    const normalized = AuthService.normalizeTransaction(prepared.value, employees);

    if (!isLocalDemo) {
      const current = transactions.find((row) => row.id === normalized.id);
      if (!current || !Number.isSafeInteger(current.version) ||
          current.version !== normalized.version) {
        throw new Error('VERSION_CONFLICT_LOCAL');
      }
      const beforeLinks = [...(current.employeeIds ?? [])].sort().join('|');
      const afterLinks = [...(normalized.employeeIds ?? [])].sort().join('|');
      if (beforeLinks !== afterLinks) throw new Error('OFFICIAL_LINKS_NEED_SEPARATE_WORKFLOW');
      const existingFiles = JSON.stringify(current.attachments.map((a) => ({
        id:a.id, name:a.name, type:a.type, fileSize:a.fileSize, uploadDate:a.uploadDate,
      })));
      const submittedFiles = JSON.stringify(normalized.attachments.map((a) => ({
        id:a.id, name:a.name, type:a.type, fileSize:a.fileSize, uploadDate:a.uploadDate,
      })));
      if (existingFiles !== submittedFiles) throw new Error('OFFICIAL_ATTACHMENTS_REQUIRE_UPLOAD');
      const patch = buildTransactionUpdatePatch(normalized);
      // Server-managed attachment blobs, view confirmations and relationships
      // are not replaced by a metadata-only PATCH from this legacy editor.
      delete patch.attachments;
      delete patch.isRead;
      delete patch.readAt;
      const generation = sessionGeneration.current;
      return (async () => {
        const saved = await getDataAdapter().updateTransaction(normalized.id, patch);
        if (sessionGeneration.current !== generation) throw new Error('SESSION_CHANGED');
        if (!saved || saved.id !== normalized.id || !Number.isSafeInteger(saved.version) ||
            saved.version <= normalized.version) {
          throw new Error('UNVERIFIED_UPDATE_RESPONSE');
        }
        setTransactions((prev) => prev.map((item) => item.id === saved.id ? saved : item));
        setSelectedTransaction((prev) => prev?.id === saved.id ? saved : prev);
        setEditingTransaction((prev) => prev?.id === saved.id ? saved : prev);
      })();
    }

    persist(async () => {
      // جسم PATCH يُبنى في نقطة واحدة (`buildTransactionUpdatePatch`):
      // الحقول المسموحة في `UpdateTransactionDto` + `expectedVersion` فقط.
      // كان هذا النداء يرسل الكائن كاملاً `{...normalized}`، فكانت حقول
      // القراءة (`id`/`month`/`createdAt`) تُرفض بـ400 `noUnknownFields`.
      const patch = buildTransactionUpdatePatch(normalized);
      const saved = await getDataAdapter().updateTransaction(normalized.id, patch);
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

  /** Soft-archive in API mode; legacy local demo retains its old behavior. */
  const handleDeleteTransaction = (id: string) => {
    if (!isLocalDemo) {
      if (!canManageRecords || transactionMutationLock.current) return;
      const record = validMutationRecord(id);
      if (!record) return;
      runOfficialTransactionAction(
        () => archivePilotTransaction(id, record.version),
        () => {
          // The backend archives the row: only then remove it from the ACTIVE UI.
          setTransactions((prev) => prev.filter((item) => item.id !== id));
          setTransactionEmployees((prev) => TransactionEmployeeService.removeForTransaction(prev, id));
          setDailySituations((prev) => DailySituationService.removeForTransaction(prev, id));
          setSelectedTransaction((prev) => prev?.id === id ? null : prev);
          setEditingTransaction((prev) => prev?.id === id ? null : prev);
          setDirectAttachmentView((prev) => prev?.transaction.id === id ? null : prev);
        },
      );
      return;
    }
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
    if (!isLocalDemo) return;
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
    const currentForAttachments = transactions.find((item) => item.id === transactionId);
    persist(async () => {
      const saved = await getDataAdapter().updateTransaction(transactionId, {
        attachments: updatedAttachments.map((attachment) => ({
          name: attachment.name,
          type: String(attachment.type),
          fileSize: attachment.fileSize,
          uploadDate: attachment.uploadDate,
        })),
        expectedVersion: currentForAttachments?.version ?? 1,
      });
      setTransactions((prev) =>
        prev.map((item) => (item.id === transactionId ? saved : item)),
      );
      return saved;
    });
  };

  // Official admin directive: versioned PATCH, never optimistic local text.
  const handleSaveDirective = (transactionId: string, directiveText: string, actionRequired: boolean): Promise<void> | void => {
    if (!canManageRecords) throw new Error('NOT_AUTHORIZED_TO_SAVE_DIRECTIVE');
    if (!isLocalDemo) {
      if (transactionMutationLock.current) throw new Error('TRANSACTION_ACTION_BUSY');
      const record = validMutationRecord(transactionId);
      if (!record) throw new Error('VERSION_REQUIRED');
      const generation = sessionGeneration.current;
      const token = getBearerToken();
      if (token === null) throw new Error('SESSION_REQUIRED');
      transactionMutationLock.current = true;
      setTransactionActionBusy(true);
      setTransactionActionError(null);
      return (async () => {
        try {
          const saved = await savePilotTransactionDirective(transactionId, directiveText, actionRequired, record.version);
          if (generation !== sessionGeneration.current || getBearerToken() !== token) {
            throw new Error('SESSION_CHANGED');
          }
          setTransactions((prev) => prev.map((item) => item.id === saved.id ? saved : item));
          setSelectedTransaction((prev) => prev?.id === saved.id ? saved : prev);
          setEditingTransaction((prev) => prev?.id === saved.id ? saved : prev);
        } catch (error: unknown) {
          if (generation === sessionGeneration.current && getBearerToken() === token) {
            setTransactionActionError(error instanceof ApiError && error.status === 409
              ? 'تغيّرت نسخة الكتاب في الخادم. أعد تحميل السجل قبل إعادة التوجيه.'
              : 'لم يؤكد الخادم حفظ التوجيه. لم يُعرض كتوجيه محفوظ.');
          }
          throw error;
        } finally {
          if (generation === sessionGeneration.current && getBearerToken() === token) {
            transactionMutationLock.current = false;
            setTransactionActionBusy(false);
          }
        }
      })();
    }

    const nowTime = getCurrentTimeFormatted();
    const directive = {text: directiveText, date: nowTime, actionRequired};
    setTransactions((prev) =>
      prev.map((item) => item.id === transactionId ? {...item, directorDirective: directive} : item),
    );
    if (selectedTransaction?.id === transactionId) {
      setSelectedTransaction((prev) => prev ? {...prev, directorDirective: directive} : null);
    }
    const current = transactions.find((item) => item.id === transactionId);
    persist(async () => {
      const saved = await getDataAdapter().updateTransaction(transactionId, {
        directorDirective: directive, expectedVersion: current?.version ?? 1,
      });
      setTransactions((prev) => prev.map((item) => item.id === saved.id ? saved : item));
      return saved;
    });
  };

  // PHASE 10: القراءة الأولية غير متزامنة. نعرض مؤشر تحميل بدل واجهة
  // فارغة — القائمة الفارغة قد تعني «لا بيانات» لا «لم تُحمَّل بعد».
  if (!isLocalDemo && serverAccount === null) {
    return <PilotLoginScreen onLogin={handleLogin} />;
  }

  if (!isLocalDemo && serverAccount?.mustChangeSecret === true) {
    return <PilotChangeSecretScreen onChangeSecret={handleSecretChange} />;
  }

  if (startupError !== null) {
    return (
      <main
        dir="rtl"
        role="alert"
        className="min-h-screen bg-[#faf9f6] dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex items-center justify-center px-4 font-['Tajawal',sans-serif]"
      >
        <section className="w-full max-w-lg rounded-xl border border-amber-300 bg-white p-6 text-right shadow-sm dark:bg-stone-900 dark:border-amber-700">
          <h1 className="mb-3 text-lg font-bold">تعذّر بدء السقاية</h1>
          <p className="mb-3 text-sm leading-7">{startupError}</p>
          <p className="mb-5 text-sm leading-7 text-stone-600 dark:text-stone-300">
            لم تُعرض بيانات بديلة، ولم تُحفظ أي تغييرات في مصدر محلي.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 dark:bg-stone-200 dark:text-stone-900"
          >
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  }

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
        setUserRole={setDemoUserRole}
        allowRoleSwitch={isLocalDemo}
        sessionDisplayName={serverAccount?.displayName}
        onLogout={isLocalDemo ? undefined : handleLogout}
        onMarkAllAsRead={handleMarkAllAsRead}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Phase 22 — UI-09: لوحة البحث الموحّد (تراكب فوق التطبيق). */}
      {isSearchOpen && (
        <UnifiedSearchView
          onNavigate={handleNavigate}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {transactionActionError && (
          <div role="alert" className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 flex items-center justify-between gap-3">
            <span>{transactionActionError}</span>
            <button type="button" onClick={() => setTransactionActionError(null)}
              className="underline font-semibold">إغلاق</button>
          </div>
        )}
        {/* Dynamic Views */}
        {currentView === 'transactions' && !isLocalDemo && serverAccount?.role === 'admin' && (
          <div className="flex justify-end mb-4">
            <button type="button" onClick={() => {setShowArchivedTransactions((open) => !open); setTransactionActionError(null);}}
              className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 text-sm font-bold">
              {showArchivedTransactions ? 'عودة إلى الكتب النشطة' : 'عرض الكتب المؤرشفة واستعادتها'}
            </button>
          </div>
        )}
        {currentView === 'transactions' && !showArchivedTransactions && (
          <TransactionsList
            isServerMode={!isLocalDemo}
            isActionBusy={transactionActionBusy}
            transactions={visibleTransactions}
            onSelectTransaction={handleSelectTransaction}
            onToggleReadStatus={isLocalDemo ? handleToggleReadStatus : undefined}
            onMarkAllAsRead={isLocalDemo ? handleMarkAllAsRead : undefined}
            onUpdateStatus={handleUpdateStatus}
            onOpenNewModal={() => {
              setNewModalDefaultMode('normal');
              setIsNewModalOpen(true);
            }}
            userRole={userRole}
            onViewAttachmentDirectly={handleViewAttachmentDirectly}
            onSaveDirective={canManageRecords ? handleSaveDirective : undefined}
            onEditTransaction={canManageRecords ? (tr) => setEditingTransaction(tr) : undefined}
            onDeleteTransaction={canManageRecords ? handleDeleteTransaction : undefined}
            onNavigateToStudio={() => setCurrentView('archivist-studio')}
            onNavigate={handleNavigate}
            navigationTarget={navigationTarget}
          />
        )}

        {currentView === 'transactions' && showArchivedTransactions && !isLocalDemo && serverAccount?.role === 'admin' && (
          <ArchivedTransactionsPanel
            onClose={() => setShowArchivedTransactions(false)}
            onRestored={handleRestoredTransaction}
          />
        )}

        {currentView === 'daily-situations' && canViewDailySituations && (
          <DailySituationsView
            allowCreate={isLocalDemo}
            transactions={visibleTransactions}
            dailySituations={dailySituations}
            employees={employees}
            onSelectTransaction={handleSelectTransaction}
            onOpenNewDailySituation={() => {
              setNewModalDefaultMode('daily-situation');
              setIsNewModalOpen(true);
            }}
            onEditTransaction={canManageRecords ? (tr) => setEditingTransaction(tr) : undefined}
            onDeleteTransaction={isLocalDemo ? handleDeleteTransaction : undefined}
            onViewAttachment={handleViewAttachmentDirectly}
            onNavigate={handleNavigate}
            navigationTarget={navigationTarget}
          />
        )}

        {currentView === 'archivist-studio' && isLocalDemo && (
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
            officialMode={!isLocalDemo}
            onAddEmployee={canManageRecords ? handleAddEmployee : undefined}
            onUpdateEmployee={canManageRecords ? handleUpdateEmployee : undefined}
            onDeleteEmployee={canManageRecords ? handleDeleteEmployee : undefined}
            userRole={userRole}
            allowDailyNavigation={canViewDailySituations}
            onNavigate={handleNavigate}
            navigationTarget={navigationTarget}
            onViewAttachmentDirectly={handleViewAttachmentDirectly}
            onSaveTransaction={isLocalDemo ? handleSaveTransaction : undefined}
          />
        )}
      </main>

      {/* Modals */}
      {selectedTransaction && (
        <TransactionDetailModal
          key={selectedTransaction.id}
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onUpdateStatus={handleUpdateStatus}
          canEditStatus={canManageRecords && !transactionActionBusy}
          officialMode={!isLocalDemo}
          onAcknowledge={!isLocalDemo && serverAccount !== null
            ? (transactionId) => acknowledgeTransactionOfficial(transactionId, serverAccount.id)
            : undefined}
          onToggleReadStatus={isLocalDemo ? () => handleToggleReadStatus(selectedTransaction.id) : undefined}
          onUpdateAttachments={isLocalDemo ? handleUpdateAttachments : undefined}
        />
      )}

      {/* Full Comprehensive Archivist Editor Modal */}
      {editingTransaction && canManageRecords && (
        <ArchivistEditorModal
          isOpen={true}
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaveTransaction={handleSaveTransaction}
          officialMode={!isLocalDemo}
          onDeleteTransaction={isLocalDemo ? handleDeleteTransaction : undefined}
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

      {isNewModalOpen && canManageRecords && (
        <NewTransactionModal
          isOpen={true}
          onClose={() => setIsNewModalOpen(false)}
          onAddTransaction={handleAddTransaction}
          officialMode={!isLocalDemo}
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
