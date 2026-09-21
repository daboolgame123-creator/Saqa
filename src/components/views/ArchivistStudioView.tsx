import React, { useState, useMemo, useRef } from 'react';
import {
  FileText,
  Calendar,
  Building2,
  User,
  Paperclip,
  Trash2,
  Edit3,
  Check,
  Plus,
  UploadCloud,
  AlertTriangle,
  Eye,
  RefreshCw,
  Save,
  CheckCircle2,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCheck,
  Clock,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import {
  Transaction,
  TransactionDirection,
  TransactionCategory,
  TransactionStatus,
  TransactionPriority,
  Attachment,
  AttachmentType,
  Employee
} from '../../types';
import { processUploadedFile, getAttachmentPreviewUrl } from '../../utils/attachmentUtils';

interface ArchivistStudioViewProps {
  transactions: Transaction[];
  employees: Employee[];
  onSaveTransaction: (updatedTransaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onOpenNewModal: () => void;
  onViewAttachmentDirectly?: (tr: Transaction, index?: number) => void;
}

const ATTACHMENT_TYPES: AttachmentType[] = [
  'كتاب رئيسي',
  'صورة وثيقة',
  'أمر إداري',
  'وصل مالي',
  'قائمة أسماء',
  'ملحق',
  'هامش',
  'تقرير',
  'أخرى',
];

export const ArchivistStudioView: React.FC<ArchivistStudioViewProps> = ({
  transactions,
  employees,
  onSaveTransaction,
  onDeleteTransaction,
  onOpenNewModal,
  onViewAttachmentDirectly,
}) => {
  // Selected Transaction for Editing
  const [selectedId, setSelectedId] = useState<string>(() => {
    return transactions.length > 0 ? transactions[0].id : '';
  });

  // Search & Filter in the studio list
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');

  // Filtered transactions for the studio list
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((t) => {
      const matchCat = categoryFilter === 'الكل' || t.category === categoryFilter;
      const matchQ =
        q === '' ||
        t.number.toLowerCase().includes(q) ||
        t.sequence.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.entity.toLowerCase().includes(q) ||
        (t.employeeName && t.employeeName.toLowerCase().includes(q));
      return matchCat && matchQ;
    });
  }, [transactions, searchQuery, categoryFilter]);

  // Active Transaction being edited
  const activeTransaction = useMemo(() => {
    return transactions.find((t) => t.id === selectedId) || transactions[0] || null;
  }, [transactions, selectedId]);

  // Form Fields State for the Active Transaction
  const [number, setNumber] = useState('');
  const [sequence, setSequence] = useState('');
  const [date, setDate] = useState('');
  const [direction, setDirection] = useState<TransactionDirection>('صادر');
  const [category, setCategory] = useState<TransactionCategory>('إدارية');
  const [subType, setSubType] = useState('');
  const [entity, setEntity] = useState('');
  const [subject, setSubject] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [priority, setPriority] = useState<TransactionPriority>('عادي');
  const [status, setStatus] = useState<TransactionStatus>('قيد المراجعة');
  const [notes, setNotes] = useState('');
  const [purpose, setPurpose] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [amount, setAmount] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Track if there are unsaved edits
  const [isDirty, setIsDirty] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync state whenever activeTransaction changes
  React.useEffect(() => {
    if (activeTransaction) {
      setNumber(activeTransaction.number || '');
      setSequence(activeTransaction.sequence || '');
      setDate(activeTransaction.date || '');
      setDirection(activeTransaction.direction || 'صادر');
      setCategory(activeTransaction.category || 'إدارية');
      setSubType(activeTransaction.subType || '');
      setEntity(activeTransaction.entity || '');
      setSubject(activeTransaction.subject || '');
      setEmployeeName(activeTransaction.employeeName || '');
      setPriority(activeTransaction.priority || 'عادي');
      setStatus(activeTransaction.status || 'قيد المراجعة');
      setNotes(activeTransaction.notes || '');
      setPurpose(activeTransaction.specificDetails?.purpose || '');
      setDestination(activeTransaction.specificDetails?.destination || '');
      setVehicle(activeTransaction.specificDetails?.vehicle || '');
      setAmount(activeTransaction.specificDetails?.amount || '');

      setAttachments(
        activeTransaction.attachments && activeTransaction.attachments.length > 0
          ? activeTransaction.attachments
          : [
              {
                id: `att-${Date.now()}`,
                name: `كتاب_${activeTransaction.number.replace(/[\/\\]/g, '_')}.jpg`,
                type: 'كتاب رئيسي',
                fileSize: '1.2 MB',
                uploadDate: activeTransaction.date,
                isImage: true,
              },
            ]
      );
      setIsDirty(false);
    }
  }, [activeTransaction]);

  // Attachment upload & replace states
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ index: number; name: string } | null>(null);
  const [isConfirmingDeleteTransaction, setIsConfirmingDeleteTransaction] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIndexRef = useRef<number | null>(null);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((c) => (c === msg ? null : c));
    }, 3200);
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    await processAndAddFiles(Array.from(e.dataTransfer.files));
  };

  // Process files
  const processAndAddFiles = async (files: File[]) => {
    setIsProcessingFile(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const newItems: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const processed = await processUploadedFile(file);
        const defaultType: AttachmentType =
          attachments.length === 0 && i === 0 ? 'كتاب رئيسي' : 'صورة وثيقة';

        newItems.push({
          id: `att-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: defaultType,
          fileSize: processed.fileSizeStr,
          uploadDate: today,
          previewUrl: processed.dataUrl,
          isImage: processed.isImage,
        });
      }

      setAttachments((prev) => [...prev, ...newItems]);
      setIsDirty(true);
      showToast(`تمت إضافة ${newItems.length} مرفقات بنجاح! لا تنسَ الضغط على "حفظ التعديلات"`);
    } catch (err) {
      console.error('Error adding files:', err);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Replace file
  const triggerReplace = (idx: number) => {
    replaceTargetIndexRef.current = idx;
    replaceFileInputRef.current?.click();
  };

  const handleReplaceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetIdx = replaceTargetIndexRef.current;
    if (targetIdx === null || !e.target.files || e.target.files.length === 0) return;
    setIsProcessingFile(true);
    try {
      const file = e.target.files[0];
      const processed = await processUploadedFile(file);
      setAttachments((prev) =>
        prev.map((item, idx) => {
          if (idx === targetIdx) {
            return {
              ...item,
              name: file.name,
              fileSize: processed.fileSizeStr,
              previewUrl: processed.dataUrl,
              isImage: processed.isImage,
            };
          }
          return item;
        })
      );
      setIsDirty(true);
      showToast(`تم استبدال ملف المرفق بنجاح`);
    } catch (err) {
      console.error('Error replacing:', err);
    } finally {
      setIsProcessingFile(false);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
      replaceTargetIndexRef.current = null;
    }
  };

  // Update attachment inline field
  const handleUpdateAttField = (idx: number, field: 'name' | 'type', value: string) => {
    setAttachments((prev) =>
      prev.map((att, i) => (i === idx ? { ...att, [field]: value } : att))
    );
    setIsDirty(true);
  };

  // Delete attachment
  const confirmDeleteAtt = () => {
    if (!attachmentToDelete) return;
    setAttachments((prev) => prev.filter((_, i) => i !== attachmentToDelete.index));
    setIsDirty(true);
    showToast(`تم حذف المرفق «${attachmentToDelete.name}»`);
    setAttachmentToDelete(null);
  };

  // Save All Changes
  const handleSave = () => {
    if (!activeTransaction) return;

    const updated: Transaction = {
      ...activeTransaction,
      number: number.trim() || activeTransaction.number || 'بدون عدد',
      sequence: sequence.trim(),
      date: date || activeTransaction.date || new Date().toISOString().split('T')[0],
      direction,
      category,
      subType: subType.trim(),
      entity: entity.trim() || 'عام / غير محدد',
      subject: subject.trim() || 'بدون موضوع',
      employeeName: employeeName.trim() || undefined,
      priority,
      status,
      notes: notes.trim() || undefined,
      attachments,
      specificDetails: {
        ...activeTransaction.specificDetails,
        purpose: purpose.trim() || undefined,
        destination: destination.trim() || undefined,
        vehicle: vehicle.trim() || undefined,
        amount: amount.trim() || undefined,
      },
    };

    onSaveTransaction(updated);
    setIsDirty(false);
    showToast('تم حفظ كافة التعديلات والمرفقات بنجاح في السجل الرسمي ✓');
  };

  // Total Attachments count
  const totalAttachmentsCount = useMemo(() => {
    return transactions.reduce((acc, t) => acc + (t.attachments?.length || 0), 0);
  }, [transactions]);

  return (
    <div className="space-y-4" id="archivist-studio-workspace">
      {/* Studio Banner & Header */}
      <div className="bg-stone-900 text-white rounded-2xl p-4 sm:p-6 shadow-md border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
            <Edit3 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-xl font-bold tracking-tight">
                قسم تحرير الذاتية والملفات المتكامل
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40">
                لوحة الأرشفة والتحكم الكامل
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-300 mt-1 leading-relaxed">
              إضافة وحذف وتعديل المرفقات الممسوحة، وتحديث كافة بيانات المعاملات والكتب الرسمية بصلاحية كاملة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-stone-800/80 px-3 py-1.5 rounded-xl border border-stone-700 text-xs">
            <span className="text-stone-400">إجمالي المعاملات:</span>
            <strong className="text-amber-300 font-bold">{transactions.length}</strong>
            <span className="text-stone-600">|</span>
            <span className="text-stone-400">إجمالي المرفقات:</span>
            <strong className="text-amber-300 font-bold">{totalAttachmentsCount}</strong>
          </div>

          <button
            type="button"
            id="btn-studio-new-transaction"
            onClick={onOpenNewModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ كتاب جديد</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-md transition-all animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-200 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Two-Column Master / Detail Studio Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Right Column: Transactions Selector List (4 cols on lg) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-600" />
              <span>اختر معاملة للتحرير ({filteredList.length})</span>
            </h3>
            {isDirty && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                يوجد تعديل غير محفوظ!
              </span>
            )}
          </div>

          {/* Quick Search & Category Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالعدد أو الموضوع أو القيد..."
                className="w-full pr-8 pl-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden bg-stone-50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {['الكل', 'إدارية', 'مالية', 'منتسبين'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:text-stone-900 bg-stone-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Transaction Cards */}
          <div className="space-y-2 max-h-[750px] overflow-y-auto pr-1">
            {filteredList.map((tr) => {
              const isSelected = activeTransaction?.id === tr.id;
              const attCount = tr.attachments?.length || 0;

              return (
                <div
                  key={tr.id}
                  onClick={() => {
                    if (isDirty && activeTransaction?.id !== tr.id) {
                      const confirmSwitch = window.confirm(
                        'لديك تعديلات غير محفوظة على المعاملة الحالية. هل تريد التبديل دون حفظ؟'
                      );
                      if (!confirmSwitch) return;
                    }
                    setSelectedId(tr.id);
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-400/40 shadow-xs'
                      : 'bg-white hover:bg-stone-50 border-stone-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                      #{tr.sequence}
                    </span>
                    <span className="font-mono font-bold text-stone-900 bg-stone-200/70 px-2 py-0.5 rounded">
                      العدد: {tr.number}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        tr.status === 'قيد المراجعة'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {tr.status}
                    </span>
                  </div>

                  <p className="font-semibold text-stone-900 line-clamp-2 leading-relaxed mt-1">
                    {tr.subject}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-stone-100 text-[10px] text-stone-500">
                    <span className="truncate max-w-[130px]">{tr.entity}</span>
                    <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                      <Paperclip className="w-3 h-3" />
                      {attCount} مرفق
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Left Column: Full Comprehensive Editor for Selected Transaction (8 cols on lg) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 shadow-xs p-4 sm:p-6 space-y-6">
          {!activeTransaction ? (
            <div className="text-center py-16 text-stone-400 space-y-2">
              <FileText className="w-12 h-12 mx-auto text-stone-300" />
              <p className="text-sm font-semibold text-stone-600">
                يرجى اختيار معاملة من القائمة للبدء بتحرير بياناتها ومرفقاتها
              </p>
            </div>
          ) : (
            <>
              {/* Active Editor Header & Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                      قيد #{sequence}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-stone-900">
                      تحرير المعاملة: {number || 'بدون عدد'}
                    </h3>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    تعديل شامل للوثائق والمرفقات وكافة الحقول الرسمية
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {onViewAttachmentDirectly && (
                    <button
                      type="button"
                      onClick={() => onViewAttachmentDirectly(activeTransaction, 0)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                      title="معاينة المعاملة بكامل الشاشة كما يراها السيد المدير"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-600" />
                      <span>معاينة مكبرة</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <Save className="w-4 h-4 text-amber-400" />
                    <span>حفظ التعديلات ✓</span>
                  </button>
                </div>
              </div>

              {/* SECTION A: استوديو إدارة المرفقات والملفات */}
              <div className="bg-stone-50/90 rounded-2xl border border-stone-200 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-stone-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                      <Paperclip className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">
                        مرفقات وكتب المعاملة الممسوحة ({attachments.length})
                      </h4>
                      <p className="text-[11px] text-stone-500">
                        يمكنك إضافة صور جديدة، تعديل أسمائها وأنواعها، استبدالها أو حذفها
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFile}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ إضافة مرفق / ملف جديد</span>
                  </button>
                </div>

                {/* Dropzone for Drag & Drop */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-amber-500 bg-amber-100/50 scale-[0.99]'
                      : 'border-stone-300 hover:border-amber-400 bg-white hover:bg-amber-50/20'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) processAndAddFiles(Array.from(e.target.files));
                    }}
                  />
                  <input
                    ref={replaceFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleReplaceChange}
                  />

                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <UploadCloud className="w-7 h-7 text-amber-600" />
                    <p className="text-xs font-bold text-stone-800">
                      اسحب وأفلت الملفات والصور هنا، أو <span className="text-amber-700 underline">انقر للاختيار</span>
                    </p>
                    <span className="text-[10px] text-stone-400">
                      يدعم كافة صيغ الصور والمستندات الرسمية الممسوحة ضوئياً
                    </span>
                  </div>
                </div>

                {/* Attachments Grid */}
                {attachments.length === 0 ? (
                  <div className="p-4 bg-white rounded-xl border border-dashed border-stone-200 text-center text-xs text-stone-500">
                    لا توجد مرفقات مرتبطة بهذه المعاملة حتى الآن.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {attachments.map((att, idx) => {
                      const previewUrl = getAttachmentPreviewUrl(att, {
                        number,
                        date,
                        subject,
                        entity,
                      });

                      return (
                        <div
                          key={att.id || idx}
                          className="bg-white rounded-xl border border-stone-200 p-3 shadow-2xs hover:border-amber-300 transition-all flex flex-col justify-between gap-2.5"
                        >
                          <div className="flex items-start gap-3">
                            {/* Thumbnail with lightbox click */}
                            <div
                              onClick={() => {
                                if (onViewAttachmentDirectly) {
                                  onViewAttachmentDirectly(
                                    { ...activeTransaction, attachments },
                                    idx
                                  );
                                }
                              }}
                              className="w-16 h-20 rounded-lg bg-stone-100 border border-stone-200 shrink-0 overflow-hidden relative group/thumb cursor-pointer flex items-center justify-center"
                              title="انقر للمعاينة المكبرة"
                            >
                              <img
                                src={previewUrl}
                                alt={att.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-stone-900/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </div>
                            </div>

                            {/* Editable Fields */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center justify-between gap-1 text-[10px] text-stone-400">
                                <span className="font-bold text-stone-600">#{idx + 1}</span>
                                <span>{att.fileSize || '1.1 MB'}</span>
                              </div>

                              {/* Name input */}
                              <div>
                                <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">
                                  اسم المرفق:
                                </label>
                                <input
                                  type="text"
                                  value={att.name}
                                  onChange={(e) =>
                                    handleUpdateAttField(idx, 'name', e.target.value)
                                  }
                                  className="w-full px-2 py-1 text-xs rounded border border-stone-200 focus:ring-1 focus:ring-amber-500 outline-hidden font-medium"
                                />
                              </div>

                              {/* Type dropdown */}
                              <div>
                                <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">
                                  نوع المرفق:
                                </label>
                                <select
                                  value={att.type}
                                  onChange={(e) =>
                                    handleUpdateAttField(idx, 'type', e.target.value)
                                  }
                                  className="w-full px-2 py-0.5 text-xs rounded border border-stone-200 focus:ring-1 focus:ring-amber-500 outline-hidden bg-white"
                                >
                                  {ATTACHMENT_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Action Toolbar for this attachment */}
                          <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (onViewAttachmentDirectly) {
                                  onViewAttachmentDirectly(
                                    { ...activeTransaction, attachments },
                                    idx
                                  );
                                }
                              }}
                              className="text-[11px] font-bold text-stone-700 hover:text-amber-800 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-50 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-600" />
                              <span>معاينة</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => triggerReplace(idx)}
                                className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 border border-stone-200 px-2 py-0.5 rounded hover:bg-stone-100 flex items-center gap-1 cursor-pointer"
                                title="استبدال ملف هذا المرفق"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>استبدال</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setAttachmentToDelete({ index: idx, name: att.name })}
                                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 border border-rose-200 px-2 py-0.5 rounded hover:bg-rose-50 flex items-center gap-1 cursor-pointer"
                                title="حذف هذا المرفق"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>حذف</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION B: بيانات المعاملة الرسمية والقيد */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                  <FileText className="w-4 h-4 text-stone-700" />
                  <h4 className="text-sm font-bold text-stone-900">
                    بيانات المعاملة الرسمية والقيد الإداري
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* العدد */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      رقم الكتاب (العدد):
                    </label>
                    <input
                      type="text"
                      value={number}
                      onChange={(e) => {
                        setNumber(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
                    />
                  </div>

                  {/* رقم القيد */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      رقم القيد (التسلسل):
                    </label>
                    <input
                      type="text"
                      value={sequence}
                      onChange={(e) => {
                        setSequence(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-mono font-medium"
                    />
                  </div>

                  {/* التاريخ */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      تاريخ المعاملة:
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
                    />
                  </div>

                  {/* حركة الكتاب */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      حركة الكتاب:
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200 text-xs">
                      {(['صادر', 'وارد', 'داخلي'] as TransactionDirection[]).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => {
                            setDirection(dir);
                            setIsDirty(true);
                          }}
                          className={`py-1 rounded font-bold transition-all cursor-pointer ${
                            direction === dir
                              ? 'bg-stone-900 text-amber-300 shadow-xs'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* القسم */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      القسم:
                    </label>
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value as TransactionCategory);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden bg-white font-semibold"
                    >
                      <option value="إدارية">قسم المعاملات الإدارية</option>
                      <option value="مالية">قسم الشؤون المالية</option>
                      <option value="منتسبين">قسم شؤون المنتسبين</option>
                      <option value="أخرى">معاملات عامة وأخرى</option>
                    </select>
                  </div>

                  {/* نوع المعاملة الفرعي */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      النوع الفرعي:
                    </label>
                    <input
                      type="text"
                      value={subType}
                      onChange={(e) => {
                        setSubType(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="إيفاد، إجازة..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
                    />
                  </div>

                  {/* الأسبقية */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      درجة الأسبقية:
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => {
                        setPriority(e.target.value as TransactionPriority);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden bg-white font-bold"
                    >
                      <option value="عادي">عادي</option>
                      <option value="هام">هام</option>
                      <option value="عاجل">عاجل</option>
                      <option value="عاجل جداً">عاجل جداً 🚨</option>
                      <option value="سري">سري وخاص 🔒</option>
                    </select>
                  </div>

                  {/* حالة الإنجاز */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      حالة الإنجاز:
                    </label>
                    <select
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value as TransactionStatus);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden bg-white font-bold"
                    >
                      <option value="جديد">جديد</option>
                      <option value="قيد الإنجاز">قيد الإنجاز</option>
                      <option value="مكتمل">مكتمل</option>
                    </select>
                  </div>
                </div>

                {/* الجهة والمنتسب */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      الجهة المرتبطة:
                    </label>
                    <input
                      type="text"
                      value={entity}
                      onChange={(e) => {
                        setEntity(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      المنتسب المعني (إن وجد):
                    </label>
                    <input
                      type="text"
                      list="archivist-studio-employees"
                      value={employeeName}
                      onChange={(e) => {
                        setEmployeeName(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
                    />
                    <datalist id="archivist-studio-employees">
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* الموضوع / المضمون */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    موضوع ومضمون المعاملة:
                  </label>
                  <textarea
                    rows={3}
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium leading-relaxed"
                  />
                </div>

                {/* الحقول الخاصة */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      الغرض:
                    </label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={(e) => {
                        setPurpose(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-2.5 py-1 text-xs rounded border border-stone-200 focus:ring-1 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      الوجهة:
                    </label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => {
                        setDestination(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-2.5 py-1 text-xs rounded border border-stone-200 focus:ring-1 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      العجلة:
                    </label>
                    <input
                      type="text"
                      value={vehicle}
                      onChange={(e) => {
                        setVehicle(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-2.5 py-1 text-xs rounded border border-stone-200 focus:ring-1 focus:ring-amber-500 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      المبلغ المالي:
                    </label>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-2.5 py-1 text-xs rounded border border-stone-200 focus:ring-1 focus:ring-amber-500 outline-hidden font-mono"
                    />
                  </div>
                </div>

                {/* الملاحظات */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    ملاحظات الذاتية الداخلية:
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 outline-hidden font-medium"
                  />
                </div>
              </div>

              {/* Bottom Footer Actions */}
              <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDeleteTransaction(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 transition-all cursor-pointer shadow-2xs"
                  title="حذف هذه المعاملة نهائياً من السجل"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف المعاملة نهائياً</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <Save className="w-4 h-4 text-amber-400" />
                    <span>حفظ كافة التعديلات والمرفقات ✓</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Dialog: Delete Attachment */}
      {attachmentToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-stone-300 shadow-2xl p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">تأكيد إزالة المرفق</h4>
                <p className="text-xs text-stone-500">سيتم حذف هذا الملف من المعاملة</p>
              </div>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed bg-stone-50 p-3 rounded-lg border border-stone-200">
              هل أنت متأكد من حذف المرفق «<strong>{attachmentToDelete.name}</strong>»؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAttachmentToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={confirmDeleteAtt}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete Entire Transaction */}
      {isConfirmingDeleteTransaction && activeTransaction && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-rose-300 shadow-2xl p-5 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">تأكيد حذف المعاملة بالكامل</h4>
                <p className="text-xs text-rose-600 font-semibold">تحذير: هذا الحذف نهائي</p>
              </div>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed bg-rose-50/70 p-3 rounded-lg border border-rose-200">
              هل أنت متأكد من حذف المعاملة بالكامل رقم قيد (<strong>#{sequence}</strong>) والعدد (<strong>{number}</strong>) بموضوع «<strong>{subject}</strong>» مع كافة مرفقاتها الممسوحة؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsConfirmingDeleteTransaction(false)}
                className="px-3.5 py-1.5 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTransaction(activeTransaction.id);
                  setIsConfirmingDeleteTransaction(false);
                  showToast('تم حذف المعاملة بنجاح');
                }}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
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
