import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Paperclip, 
  Check, 
  UploadCloud, 
  Trash2, 
  Image as ImageIcon, 
  Camera, 
  Calendar, 
  Clock, 
  Users, 
  Briefcase, 
  FileText,
  AlertCircle,
  ShieldCheck,
  Globe,
  Lock
} from 'lucide-react';
import { 
  Transaction, 
  TransactionDirection, 
  TransactionCategory, 
  TransactionStatus, 
  TransactionPriority, 
  Attachment, 
  AttachmentType,
  DailySituationData,
  DailySituationEntry,
  AccessScope,
  ACCESS_SCOPE_OPTIONS,
  Employee
} from '../../types';
import { processUploadedFile } from '../../utils/attachmentUtils';
import { splitEmployeeNames } from '../../utils/employeeUtils';
import { TransactionEmployeeService } from '../../services';

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction: (transaction: Transaction) => void;
  employees: string[];
  allEmployees?: Employee[];
  defaultMode?: 'normal' | 'daily-situation';
}

export const NewTransactionModal: React.FC<NewTransactionModalProps> = ({
  isOpen,
  onClose,
  onAddTransaction,
  employees,
  allEmployees = [],
  defaultMode = 'normal',
}) => {
  const today = new Date().toISOString().split('T')[0];

  // Entry Mode: إما معاملة طبيعية اعتيادية أو موقف يومي
  const [entryMode, setEntryMode] = useState<'normal' | 'daily-situation'>(defaultMode);

  useEffect(() => {
    if (defaultMode) {
      setEntryMode(defaultMode);
    }
  }, [defaultMode]);

  // Standard Transaction State
  const [number, setNumber] = useState('');
  const [sequence, setSequence] = useState('');
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState<TransactionDirection>('صادر');
  const [category, setCategory] = useState<TransactionCategory>('إدارية');
  const [subType, setSubType] = useState('إيفاد');
  const [entity, setEntity] = useState('');
  const [subject, setSubject] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [priority, setPriority] = useState<TransactionPriority>('عادي');
  const [status, setStatus] = useState<TransactionStatus>('قيد المراجعة');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<AccessScope>('Administrative');

  // Daily Situation State (6 Categorized Tables matching 9.jpg)
  const [situationDate, setSituationDate] = useState(today);
  const [addressedTo, setAddressedTo] = useState('السيد رئيس قسم الشؤون الفكرية والثقافية دام توفيقه');
  const [departmentName, setDepartmentName] = useState('مركز الدراسات الافريقية');
  const [supervisorEndorsement, setSupervisorEndorsement] = useState('تأييد مسؤول المركز');

  // 1. الإجازات اليومية للمنتسب الدائم
  const [permanentLeaves, setPermanentLeaves] = useState<DailySituationEntry[]>([
    {
      id: `pl-${Date.now()}-1`,
      sequence: 1,
      employeeName: '',
      employmentType: 'دائمي',
      details: 'يوم واحد (اعتيادية)',
      date: today,
    },
  ]);

  // 2. الساعات الزمنية (للمنتسب الدائم)
  const [permanentTimePermissions, setPermanentTimePermissions] = useState<DailySituationEntry[]>([]);

  // 3. تحويل دوام او دورية او ايفاد (للمنتسب الدائم)
  const [permanentShiftChanges, setPermanentShiftChanges] = useState<DailySituationEntry[]>([]);

  // 4. الاجازات اليومية لمنتسبي المكافأة والاجر اليومي والمتطوع
  const [temporaryLeaves, setTemporaryLeaves] = useState<DailySituationEntry[]>([]);

  // 5. الساعات الزمنية (لمنتسبي المكافأة والأجر والمتطوع)
  const [temporaryTimePermissions, setTemporaryTimePermissions] = useState<DailySituationEntry[]>([]);

  // 6. تحويل دوام او دورية او ايفاد (لمنتسبي المكافأة والأجر والمتطوع)
  const [temporaryShiftChanges, setTemporaryShiftChanges] = useState<DailySituationEntry[]>([]);

  // Attachments State
  const [attachments, setAttachments] = useState<Attachment[]>([
    {
      id: `att-new-1`,
      name: entryMode === 'daily-situation' ? 'استمارة_الموقف_اليومي_الممسوحة.jpg' : 'الكتاب_الرئيسي_الممسوح.jpg',
      type: 'كتاب رئيسي',
      fileSize: '1.1 MB',
      uploadDate: today,
      isImage: true,
    },
  ]);

  const [isUploading, setIsUploading] = useState<boolean>(false);

  if (!isOpen) return null;

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    try {
      const files: File[] = Array.from(e.target.files);
      const newAtts: Attachment[] = [];

      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        const processed = await processUploadedFile(file);
        const defaultType: AttachmentType = 
          attachments.length === 0 && idx === 0 ? 'كتاب رئيسي' : 'ملحق';

        newAtts.push({
          id: `att-file-${Date.now()}-${idx}`,
          name: file.name,
          type: defaultType,
          fileSize: processed.fileSizeStr,
          uploadDate: today,
          isImage: processed.isImage,
          previewUrl: processed.dataUrl,
        });
      }
      setAttachments((prev) => [...prev, ...newAtts]);
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (idToRemove: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== idToRemove));
  };

  const handleChangeAttachmentType = (id: string, newType: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, type: newType } : a))
    );
  };

  // Handlers for adding/editing/removing Daily Situation Entries
  const addEntry = (
    type: 1 | 2 | 3 | 4 | 5 | 6,
    defaultEmpType: string,
    defaultDetails: string
  ) => {
    const newEntry: DailySituationEntry = {
      id: `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sequence: 1, // dynamically numbered
      employeeName: '',
      employmentType: defaultEmpType,
      details: defaultDetails,
      date: situationDate,
    };

    switch (type) {
      case 1:
        setPermanentLeaves((prev) => [...prev, { ...newEntry, sequence: prev.length + 1 }]);
        break;
      case 2:
        setPermanentTimePermissions((prev) => [...prev, { ...newEntry, sequence: prev.length + 1 }]);
        break;
      case 3:
        setPermanentShiftChanges((prev) => [...prev, { ...newEntry, sequence: prev.length + 1 }]);
        break;
      case 4:
        setTemporaryLeaves((prev) => [...prev, { ...newEntry, sequence: prev.length + 1 }]);
        break;
      case 5:
        setTemporaryTimePermissions((prev) => [...prev, { ...newEntry, sequence: prev.length + 1 }]);
        break;
      case 6:
        setTemporaryShiftChanges((prev) => [...prev, { ...newEntry, sequence: prev.length + 1 }]);
        break;
    }
  };

  const updateEntry = (
    type: 1 | 2 | 3 | 4 | 5 | 6,
    index: number,
    field: keyof DailySituationEntry,
    value: any
  ) => {
    const updater = (list: DailySituationEntry[]) =>
      list.map((item, idx) => (idx === index ? { ...item, [field]: value } : item));

    switch (type) {
      case 1:
        setPermanentLeaves(updater);
        break;
      case 2:
        setPermanentTimePermissions(updater);
        break;
      case 3:
        setPermanentShiftChanges(updater);
        break;
      case 4:
        setTemporaryLeaves(updater);
        break;
      case 5:
        setTemporaryTimePermissions(updater);
        break;
      case 6:
        setTemporaryShiftChanges(updater);
        break;
    }
  };

  const removeEntry = (type: 1 | 2 | 3 | 4 | 5 | 6, index: number) => {
    const remover = (list: DailySituationEntry[]) =>
      list.filter((_, idx) => idx !== index).map((item, i) => ({ ...item, sequence: i + 1 }));

    switch (type) {
      case 1:
        setPermanentLeaves(remover);
        break;
      case 2:
        setPermanentTimePermissions(remover);
        break;
      case 3:
        setPermanentShiftChanges(remover);
        break;
      case 4:
        setTemporaryLeaves(remover);
        break;
      case 5:
        setTemporaryTimePermissions(remover);
        break;
      case 6:
        setTemporaryShiftChanges(remover);
        break;
    }
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const now = new Date();
    const formattedTime = new Intl.DateTimeFormat('ar-IQ', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);

    if (entryMode === 'daily-situation') {
      // Filter out empty rows where employeeName is missing
      const cleanPermLeaves = permanentLeaves.filter((e) => e.employeeName.trim() !== '');
      const cleanPermTimes = permanentTimePermissions.filter((e) => e.employeeName.trim() !== '');
      const cleanPermShifts = permanentShiftChanges.filter((e) => e.employeeName.trim() !== '');
      const cleanTempLeaves = temporaryLeaves.filter((e) => e.employeeName.trim() !== '');
      const cleanTempTimes = temporaryTimePermissions.filter((e) => e.employeeName.trim() !== '');
      const cleanTempShifts = temporaryShiftChanges.filter((e) => e.employeeName.trim() !== '');

      const dailyData: DailySituationData = {
        situationDate: situationDate || today,
        addressedTo: addressedTo.trim() || 'السيد رئيس قسم الشؤون الفكرية والثقافية دام توفيقه',
        departmentName: departmentName.trim() || 'مركز الدراسات الافريقية',
        permanentLeaves: cleanPermLeaves,
        permanentTimePermissions: cleanPermTimes,
        permanentShiftChanges: cleanPermShifts,
        temporaryLeaves: cleanTempLeaves,
        temporaryTimePermissions: cleanTempTimes,
        temporaryShiftChanges: cleanTempShifts,
        supervisorEndorsement: supervisorEndorsement.trim() || 'تأييد مسؤول المركز',
        notes: notes.trim() || undefined,
      };

      // Extract employee names for linking
      const allMentionedEmployees = Array.from(new Set([
        ...cleanPermLeaves.map((e) => e.employeeName.trim()),
        ...cleanPermTimes.map((e) => e.employeeName.trim()),
        ...cleanPermShifts.map((e) => e.employeeName.trim()),
        ...cleanTempLeaves.map((e) => e.employeeName.trim()),
        ...cleanTempTimes.map((e) => e.employeeName.trim()),
        ...cleanTempShifts.map((e) => e.employeeName.trim()),
      ])).filter(Boolean);

      const mainEmployeeName = allMentionedEmployees.length > 0 ? allMentionedEmployees.join(' ، ') : 'كافة منتسبي المركز';

      // Match employeeIds as the primary relation — عبر خدمة العلاقة (تطابق فريد آمن فقط)
      const dailyEmployeeIds = TransactionEmployeeService.resolveEmployeeIds(
        allMentionedEmployees,
        allEmployees ?? []
      );

      const fullCreatedAt = `${situationDate} (${formattedTime})`;

      const newDailyTr: Transaction = {
        id: `tr-daily-${Date.now()}`,
        number: number.trim() || `موقف/${situationDate}`,
        sequence: sequence.trim() || String(Math.floor(Math.random() * 900) + 100),
        date: situationDate,
        month: situationDate.substring(0, 7),
        direction: 'داخلي',
        category: category === 'الأساتذة' ? 'الأساتذة' : 'منتسبين',
        subType: 'موقف يومي',
        entity: departmentName.trim() || 'مركز الدراسات الافريقية',
        subject: `الموقف اليومي لمنتسبي ${departmentName.trim() || 'مركز الدراسات الافريقية'} بتاريخ ${situationDate}`,
        employeeIds: dailyEmployeeIds.length > 0 ? dailyEmployeeIds : undefined,
        employeeName: mainEmployeeName,
        priority: 'عادي',
        status: 'مكتمل',
        isRead: false,
        createdAt: fullCreatedAt,
        notes: notes.trim() || undefined,
        attachments,
        isDailySituation: true,
        dailySituationData: dailyData,
        visibility: 'Administrative',
      };

      onAddTransaction(newDailyTr);
      onClose();
      return;
    }

    // Standard Transaction Logic
    const fullCreatedAt = `${date} (${formattedTime})`;
    let assignedEmployee = employeeName.trim();
    if (category === 'منتسبين' && !assignedEmployee) {
      if (entity.trim() && !['عام', 'عام / غير محدد', 'الذاتية'].includes(entity.trim())) {
        assignedEmployee = entity.trim();
      } else {
        assignedEmployee = 'منتسب عام / شؤون إدارية';
      }
    }

    // Match employeeIds as the primary relation — عبر خدمة العلاقة (تطابق فريد آمن فقط)
    const matchedEmployeeIds = TransactionEmployeeService.resolveEmployeeIds(
      splitEmployeeNames(assignedEmployee),
      allEmployees
    );

    const newTr: Transaction = {
      id: `tr-${Date.now()}`,
      number: number.trim() || `كتاب-${Math.floor(100 + Math.random() * 900)}`,
      sequence: sequence.trim() || String(Math.floor(Math.random() * 900) + 100),
      date: date || today,
      month: (date || today).substring(0, 7),
      direction,
      category,
      subType: subType.trim() || (category === 'منتسبين' ? 'إجازة / مباشرة' : 'كتاب رسمي'),
      entity: entity.trim() || 'عام / غير محدد',
      subject: subject.trim() || 'بدون موضوع',
      employeeIds: matchedEmployeeIds.length > 0 ? matchedEmployeeIds : undefined,
      employeeName: assignedEmployee || undefined,
      visibility,
      priority,
      status,
      isRead: false,
      createdAt: fullCreatedAt,
      notes: notes.trim() || undefined,
      attachments,
    };

    onAddTransaction(newTr);
    onClose();
  };

  // Helper to render table editor for one section of the Daily Situation
  const renderSectionEditor = (
    type: 1 | 2 | 3 | 4 | 5 | 6,
    title: string,
    list: DailySituationEntry[],
    detailLabel: string,
    defaultEmployment: string,
    defaultDetailPlaceholder: string
  ) => {
    return (
      <div className="bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700/80 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-200 dark:border-stone-700 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
              ({title})
            </h4>
            <span className="text-[11px] font-mono px-2 py-0.2 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-semibold">
              {list.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => addEntry(type, defaultEmployment, defaultDetailPlaceholder)}
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة قيد</span>
          </button>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-2.5 text-xs text-stone-400 dark:text-stone-500 italic">
            لا توجد قيود مسجلة في هذا القسم (انقر "إضافة قيد" إذا وجد)
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-stone-800 p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 items-center text-xs"
              >
                {/* Sequence */}
                <div className="sm:col-span-1 text-center font-bold text-stone-500 font-mono">
                  #{idx + 1}
                </div>

                {/* Employee Name with Datalist */}
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    list="employees-datalist"
                    placeholder="الاسم الرباعي للمنتسب *"
                    value={entry.employeeName}
                    onChange={(e) => updateEntry(type, idx, 'employeeName', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-stone-300 dark:border-stone-600 dark:bg-stone-900 text-stone-900 dark:text-stone-100 font-semibold focus:ring-1 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                {/* Employment Type */}
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="صفة العمل"
                    value={entry.employmentType}
                    onChange={(e) => updateEntry(type, idx, 'employmentType', e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-stone-300 dark:border-stone-600 dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-center focus:ring-1 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                {/* Details (Leaves / Time / Shift) */}
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    placeholder={detailLabel}
                    value={entry.details}
                    onChange={(e) => updateEntry(type, idx, 'details', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-stone-300 dark:border-stone-600 dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-1 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                {/* Delete Button */}
                <div className="sm:col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => removeEntry(type, idx)}
                    className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    title="حذف هذا القيد"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div 
        className="bg-white dark:bg-stone-900 rounded-2xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden"
        dir="rtl"
      >
        {/* Top Modal Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold text-lg">
              {entryMode === 'daily-situation' ? '📋' : '📝'}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">
                {entryMode === 'daily-situation'
                  ? 'تنظيم وتوثيق استمارة الموقف اليومي لمنتسبي المركز'
                  : 'إدخال معاملة جديدة في سجل الذاتية'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {entryMode === 'daily-situation'
                  ? 'تسجيل الإجازات والساعات الزمنية وتحويلات الدوام وفق الاستمارة الرسمية'
                  : 'أدخل بيانات الكتاب والمرفقات لإضافته إلى متابعة الشهر وسجل المعاملات'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Segmented Tabs (معاملة طبيعية / موقف يومي) */}
        <div className="bg-stone-100 dark:bg-stone-800/50 p-2 border-b border-stone-200 dark:border-stone-800">
          <div className="grid grid-cols-2 gap-1.5 max-w-md mx-auto">
            <button
              type="button"
              id="mode-normal-transaction"
              onClick={() => setEntryMode('normal')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                entryMode === 'normal'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs border border-stone-200 dark:border-stone-700'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <FileText className="w-4 h-4 text-amber-500" />
              <span>معاملة طبيعية (كتاب رسمي / إداري / مالي)</span>
            </button>

            <button
              type="button"
              id="mode-daily-situation"
              onClick={() => setEntryMode('daily-situation')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                entryMode === 'daily-situation'
                  ? 'bg-amber-500 text-stone-950 shadow-xs font-extrabold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <span>📋 الموقف اليومي للمنتسبين (الاستمارة المعتمدة)</span>
            </button>
          </div>
        </div>

        {/* Global Datalist for autocomplete */}
        <datalist id="employees-datalist">
          {employees.map((emp) => (
            <option key={emp} value={emp} />
          ))}
        </datalist>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-sm">
          {/* ===================== IF DAILY SITUATION MODE ===================== */}
          {entryMode === 'daily-situation' ? (
            <div className="space-y-5">
              {/* Daily Situation Metadata Card */}
              <div className="bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      تاريخ الموقف اليومي *
                    </label>
                    <input
                      type="date"
                      required
                      value={situationDate}
                      onChange={(e) => setSituationDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-hidden font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      رقم المعاملة / القيد
                    </label>
                    <input
                      type="text"
                      placeholder={`موقف/${situationDate}`}
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      القسم الرئيسي
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden font-semibold"
                    >
                      <option value="منتسبين">شؤون المنتسبين</option>
                      <option value="الأساتذة">الأساتذة</option>
                      <option value="إدارية">إدارية</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      الجهة الموجه إليها (ترويسة الاستمارة)
                    </label>
                    <input
                      type="text"
                      value={addressedTo}
                      onChange={(e) => setAddressedTo(e.target.value)}
                      placeholder="السيد رئيس قسم الشؤون الفكرية والثقافية دام توفيقه"
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      اسم المركز / القسم
                    </label>
                    <input
                      type="text"
                      value={departmentName}
                      onChange={(e) => setDepartmentName(e.target.value)}
                      placeholder="مركز الدراسات الافريقية"
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* The 6 Categorized Sections Matching 9.jpg */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                    جداول قيود الموقف اليومي المعتمدة (6 تقسيمات):
                  </span>
                </div>

                {/* 1. الإجازات اليومية للمنتسب الدائم */}
                {renderSectionEditor(
                  1,
                  'الإجازات اليومية للمنتسب الدائم',
                  permanentLeaves,
                  'عدد الأيام ونوع الإجازة (مثال: يوم واحد اعتيادية)',
                  'دائمي',
                  'يوم واحد (اعتيادية)'
                )}

                {/* 2. الساعات الزمنية (للمنتسب الدائم) */}
                {renderSectionEditor(
                  2,
                  'الساعات الزمنية (للمنتسب الدائم)',
                  permanentTimePermissions,
                  'عدد الساعات من وإلى (مثال: ساعتان من 10 إلى 12)',
                  'دائمي',
                  'ساعتان (من 10:00 إلى 12:00)'
                )}

                {/* 3. تحويل دوام او دورية او ايفاد (للمنتسب الدائم) */}
                {renderSectionEditor(
                  3,
                  'تحويل دوام او دورية او ايفاد (للمنتسب الدائم)',
                  permanentShiftChanges,
                  'من يوم إلى يوم / ملاحظة الإيفاد',
                  'دائمي',
                  'من الأحد إلى الخميس'
                )}

                {/* 4. الاجازات اليومية لمنتسبي المكافأة والاجر اليومي والمتطوع */}
                {renderSectionEditor(
                  4,
                  'الاجازات اليومية لمنتسبي المكافأة والاجر اليومي والمتطوع',
                  temporaryLeaves,
                  'يوم الإجازة (مثال: يوم واحد اعتيادية)',
                  'مكافأة',
                  'يوم واحد (اعتيادية)'
                )}

                {/* 5. الساعات الزمنية (لمنتسبي المكافأة والأجر والمتطوع) */}
                {renderSectionEditor(
                  5,
                  'الساعات الزمنية (لمنتسبي المكافأة والأجر والمتطوع)',
                  temporaryTimePermissions,
                  'عدد الساعات من وإلى (مثال: ساعتان)',
                  'أجر يومي',
                  'ساعتان (من 11:00 إلى 01:00)'
                )}

                {/* 6. تحويل دوام او دورية او ايفاد (لمنتسبي المكافأة والأجر والمتطوع) */}
                {renderSectionEditor(
                  6,
                  'تحويل دوام او دورية او ايفاد (لمنتسبي المكافأة والأجر والمتطوع)',
                  temporaryShiftChanges,
                  'من يوم إلى يوم / ملاحظة الانفكاك أو الإيفاد (مثال: انفكاك (ايفاد الى غانا رقم الكتاب 113))',
                  'ساعات',
                  'انفكاك (إيفاد رسمي رقم الكتاب 113)'
                )}
              </div>

              {/* Endorsement and Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                    تذييل الاعتماد والتوقيع
                  </label>
                  <input
                    type="text"
                    value={supervisorEndorsement}
                    onChange={(e) => setSupervisorEndorsement(e.target.value)}
                    placeholder="تأييد مسؤول المركز"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                    ملاحظات إدارية عامة
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي ملاحظات حول موقف اليوم..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* ===================== IF NORMAL TRANSACTION MODE ===================== */
            <div className="space-y-4">
              {/* Row 1: Number, Sequence, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    العدد (رقم الكتاب) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: ١٠٥٠/ص"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    التسلسل (سجل القيد)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: ٨٢٤"
                    value={sequence}
                    onChange={(e) => setSequence(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    تاريخ الكتاب
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Row 2: Direction, Category (including الأساتذة), SubType */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    حركة الكتاب
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as TransactionDirection)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  >
                    <option value="صادر">صادر (من المركز)</option>
                    <option value="وارد">وارد (إلى المركز)</option>
                    <option value="داخلي">إجراء داخلي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    القسم الرئيسي *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden font-semibold"
                  >
                    <option value="إدارية">إدارية</option>
                    <option value="مالية">مالية</option>
                    <option value="منتسبين">شؤون المنتسبين</option>
                    <option value="الأساتذة">الأساتذة</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    نوع المعاملة
                  </label>
                  <input
                    type="text"
                    value={subType}
                    onChange={(e) => setSubType(e.target.value)}
                    placeholder="إيفاد، إجازة، طلب..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Row 3: Entity, Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    الجهة الصادر منها أو الموجه إليها *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: الأمانة العامة / الدائرة الإدارية والمالية"
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    اسم المنتسب أو الأستاذ المرتبط
                  </label>
                  <input
                    type="text"
                    list="employees-datalist"
                    placeholder="اختر أو اكتب اسم المنتسب..."
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  الموضوع / ملخص المعاملة *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="مضمون المعاملة أو ملخص ما ورد في الكتاب الرسمي..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden resize-none"
                />
              </div>

              {/* Row 4: Priority & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    درجة الأسبقية
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TransactionPriority)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  >
                    <option value="عادي">عادي</option>
                    <option value="هام">هام</option>
                    <option value="عاجل">عاجل</option>
                    <option value="عاجل جداً">عاجل جداً</option>
                    <option value="سري">سري</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    الحالة الإجرائية
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TransactionStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
                  >
                    <option value="قيد المراجعة">قيد المراجعة</option>
                    <option value="مكتمل">مكتمل</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Access Scope (نطاق الخصوصية وصلاحيات الرؤية) */}
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    <span>نطاق الخصوصية والاطلاع (Access Scope):</span>
                  </label>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ACCESS_SCOPE_OPTIONS[visibility]?.badgeColor || ''}`}>
                    {ACCESS_SCOPE_OPTIONS[visibility]?.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(ACCESS_SCOPE_OPTIONS) as AccessScope[]).map((scopeKey) => {
                    const opt = ACCESS_SCOPE_OPTIONS[scopeKey];
                    const isSelected = visibility === scopeKey;
                    return (
                      <button
                        key={scopeKey}
                        type="button"
                        onClick={() => setVisibility(scopeKey)}
                        className={`p-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 font-bold ring-1 ring-amber-400'
                            : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-2 leading-relaxed">
                  {ACCESS_SCOPE_OPTIONS[visibility]?.description}
                </p>
              </div>
            </div>
          )}

          {/* ===================== ATTACHMENTS & SCANNED FILES (FOR BOTH MODES) ===================== */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs text-stone-800 dark:text-stone-200">
                <Paperclip className="w-4 h-4 text-amber-500" />
                <span>إرفاق الوثائق والمستندات الممسوحة (الملحقات):</span>
              </div>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer">
                <UploadCloud className="w-3.5 h-3.5 text-amber-500" />
                <span>رفع كتاب / ملحق ممسوح</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length === 0 ? (
              <div className="text-center p-3 rounded-lg border border-dashed border-stone-300 dark:border-stone-700 text-xs text-stone-400">
                لا توجد مرفقات مضافة حالياً.
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-7 h-7 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {att.isImage ? <ImageIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-stone-900 dark:text-stone-100 truncate">{att.name}</div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">{att.fileSize}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={att.type}
                        onChange={(e) => handleChangeAttachmentType(att.id, e.target.value)}
                        className="px-2 py-1 text-[11px] rounded border border-stone-300 dark:border-stone-600 dark:bg-stone-900 text-stone-800 dark:text-stone-200 font-medium"
                      >
                        <option value="كتاب رئيسي">كتاب رئيسي</option>
                        <option value="قائمة أسماء">قائمة أسماء</option>
                        <option value="ملحق">ملحق</option>
                        <option value="هامش">هامش</option>
                        <option value="صورة وثيقة">صورة وثيقة</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="إزالة المرفق"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Actions Footer */}
          <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-bold hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold hover:bg-stone-800 dark:hover:bg-amber-300 shadow-sm cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4 text-amber-400 dark:text-stone-950" />
              <span>
                {entryMode === 'daily-situation'
                  ? 'حفظ وأرشفة الموقف اليومي'
                  : 'حفظ وأرشفة المعاملة'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
