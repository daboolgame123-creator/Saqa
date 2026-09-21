import React, { useState, useEffect, useRef } from 'react';
import {
  X,
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
  FileUp,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Lock,
  Globe,
  Users
} from 'lucide-react';
import {
  Transaction,
  TransactionDirection,
  TransactionCategory,
  TransactionStatus,
  TransactionPriority,
  Attachment,
  AttachmentType,
  AccessScope,
  ACCESS_SCOPE_OPTIONS,
  Employee
} from '../../types';
import { processUploadedFile, getAttachmentPreviewUrl } from '../../utils/attachmentUtils';

interface ArchivistEditorModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSaveTransaction: (updatedTransaction: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  employees: string[];
  allEmployees?: Employee[];
  onOpenLightbox?: (attachment: Attachment, attachments: Attachment[], index: number) => void;
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

export const ArchivistEditorModal: React.FC<ArchivistEditorModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onSaveTransaction,
  onDeleteTransaction,
  employees,
  allEmployees,
  onOpenLightbox,
}) => {
  // Normalize employees list with ids
  const normalizedEmployeesList: Array<{ id: string; name: string; department?: string }> = 
    allEmployees && allEmployees.length > 0
      ? allEmployees.map((e) => ({ id: e.id, name: e.name, department: e.department }))
      : employees.map((name, i) => ({ id: `emp-${i}-${name}`, name, department: 'عام' }));

  // Form Fields State - hooks must always be called unconditionally at the top level
  const [number, setNumber] = useState(transaction?.number || '');
  const [sequence, setSequence] = useState(transaction?.sequence || '');
  const [date, setDate] = useState(transaction?.date || '');
  const [direction, setDirection] = useState<TransactionDirection>(transaction?.direction || 'صادر');
  const [category, setCategory] = useState<TransactionCategory>(transaction?.category || 'إدارية');
  const [subType, setSubType] = useState(transaction?.subType || '');
  const [entity, setEntity] = useState(transaction?.entity || '');
  const [subject, setSubject] = useState(transaction?.subject || '');
  const [employeeName, setEmployeeName] = useState(transaction?.employeeName || '');
  const [priority, setPriority] = useState<TransactionPriority>(transaction?.priority || 'عادي');
  const [status, setStatus] = useState<TransactionStatus>(transaction?.status || 'جديد');
  const [notes, setNotes] = useState(transaction?.notes || '');

  // Access Scope / Visibility & Employee IDs
  const [visibility, setVisibility] = useState<AccessScope>(transaction?.visibility || 'Administrative');
  const [employeeIds, setEmployeeIds] = useState<string[]>(transaction?.employeeIds || []);

  // Specific Details
  const [purpose, setPurpose] = useState(transaction?.specificDetails?.purpose || '');
  const [destination, setDestination] = useState(transaction?.specificDetails?.destination || '');
  const [vehicle, setVehicle] = useState(transaction?.specificDetails?.vehicle || '');
  const [amount, setAmount] = useState(transaction?.specificDetails?.amount || '');

  // Attachments State
  const [attachments, setAttachments] = useState<Attachment[]>(
    transaction?.attachments && transaction.attachments.length > 0
      ? transaction.attachments
      : transaction
      ? [
          {
            id: `att-${Date.now()}`,
            name: `كتاب_${(transaction.number || 'رسمي').replace(/[\/\\]/g, '_')}.jpg`,
            type: 'كتاب رئيسي',
            fileSize: '1.2 MB',
            uploadDate: transaction.date || '',
            isImage: true,
          },
        ]
      : []
  );

  // Sync state whenever transaction changes
  useEffect(() => {
    if (transaction) {
      setNumber(transaction.number || '');
      setSequence(transaction.sequence || '');
      setDate(transaction.date || '');
      setDirection(transaction.direction || 'صادر');
      setCategory(transaction.category || 'إدارية');
      setSubType(transaction.subType || '');
      setEntity(transaction.entity || '');
      setSubject(transaction.subject || '');
      setEmployeeName(transaction.employeeName || '');
      setPriority(transaction.priority || 'عادي');
      setStatus(transaction.status || 'جديد');
      setNotes(transaction.notes || '');
      setPurpose(transaction.specificDetails?.purpose || '');
      setDestination(transaction.specificDetails?.destination || '');
      setVehicle(transaction.specificDetails?.vehicle || '');
      setAmount(transaction.specificDetails?.amount || '');

      setVisibility(transaction.visibility || 'Administrative');
      
      // If employeeIds is already present, use it; otherwise match existing employeeName
      if (transaction.employeeIds && transaction.employeeIds.length > 0) {
        setEmployeeIds(transaction.employeeIds);
      } else if (transaction.employeeName) {
        const matched = normalizedEmployeesList
          .filter((emp) => transaction.employeeName!.includes(emp.name))
          .map((emp) => emp.id);
        setEmployeeIds(matched);
      } else {
        setEmployeeIds([]);
      }

      setAttachments(
        transaction.attachments && transaction.attachments.length > 0
          ? transaction.attachments
          : [
              {
                id: `att-${Date.now()}`,
                name: `كتاب_${(transaction.number || 'رسمي').replace(/[\/\\]/g, '_')}.jpg`,
                type: 'كتاب رئيسي',
                fileSize: '1.2 MB',
                uploadDate: transaction.date || '',
                isImage: true,
              },
            ]
      );
    }
  }, [transaction]);

  // UI / Action states
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ index: number; name: string } | null>(null);
  const [isConfirmingDeleteTransaction, setIsConfirmingDeleteTransaction] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // File Input Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIndexRef = useRef<number | null>(null);

  if (!isOpen || !transaction) return null;

  // Handle Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    await processFiles(Array.from(e.dataTransfer.files));
  };

  // Process files helper
  const processFiles = async (files: File[]) => {
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
      showToast(`تمت إضافة ${newItems.length} مرفقات بنجاح`);
    } catch (err) {
      console.error('Error processing files:', err);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Add files from file picker
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await processFiles(Array.from(e.target.files));
  };

  // Trigger Replace File
  const triggerReplaceFile = (index: number) => {
    replaceTargetIndexRef.current = index;
    replaceFileInputRef.current?.click();
  };

  // Handle Replace File
  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      showToast(`تم استبدال ملف «${attachments[targetIdx]?.name}» بنجاح`);
    } catch (err) {
      console.error('Error replacing file:', err);
    } finally {
      setIsProcessingFile(false);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
      replaceTargetIndexRef.current = null;
    }
  };

  // Update Attachment Name or Type
  const handleUpdateAttachmentField = (
    index: number,
    field: 'name' | 'type',
    value: string
  ) => {
    setAttachments((prev) =>
      prev.map((att, i) => (i === index ? { ...att, [field]: value } : att))
    );
  };

  // Confirm Attachment Deletion
  const confirmDeleteAttachment = () => {
    if (!attachmentToDelete) return;
    setAttachments((prev) => prev.filter((_, i) => i !== attachmentToDelete.index));
    showToast(`تم حذف المرفق «${attachmentToDelete.name}»`);
    setAttachmentToDelete(null);
  };

  // Toast Helper
  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage((current) => (current === msg ? null : current));
    }, 3000);
  };

  const handleToggleEmployee = (id: string) => {
    setEmployeeIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSyncEmployeeNamesToField = () => {
    const names = employeeIds
      .map((id) => {
        const found = normalizedEmployeesList.find((e) => e.id === id);
        return found ? found.name : id;
      })
      .filter(Boolean);
    if (names.length > 0) {
      setEmployeeName(names.join('، '));
      showToast('تمت مزامنة أسماء المنتسبين المحددين في حقل المعاملة ✓');
    }
  };

  // Save All Changes
  const handleSaveAll = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    let finalEmployeeName = employeeName.trim() || undefined;
    if (!finalEmployeeName && employeeIds.length > 0) {
      const derivedNames = employeeIds
        .map((id) => normalizedEmployeesList.find((e) => e.id === id)?.name)
        .filter(Boolean);
      if (derivedNames.length > 0) {
        finalEmployeeName = derivedNames.join(' ، ');
      }
    }

    const updatedTransaction: Transaction = {
      ...transaction,
      number: number.trim() || transaction.number || 'بدون عدد',
      sequence: sequence.trim(),
      date: date || transaction.date || new Date().toISOString().split('T')[0],
      direction,
      category,
      subType: subType.trim(),
      entity: entity.trim() || 'عام / غير محدد',
      subject: subject.trim() || 'بدون موضوع',
      employeeName: finalEmployeeName,
      employeeIds: employeeIds.length > 0 ? employeeIds : undefined,
      visibility,
      priority,
      status,
      notes: notes.trim() || undefined,
      attachments,
      specificDetails: {
        ...transaction.specificDetails,
        purpose: purpose.trim() || undefined,
        destination: destination.trim() || undefined,
        vehicle: vehicle.trim() || undefined,
        amount: amount.trim() || undefined,
      },
    };

    onSaveTransaction(updatedTransaction);
    showToast('تم حفظ كافة التعديلات والمرفقات بنجاح ✓');
    setTimeout(() => {
      onClose();
    }, 600);
  };

  // Delete Transaction Action
  const handleDeleteTransactionFinal = () => {
    if (onDeleteTransaction && transaction) {
      onDeleteTransaction(transaction.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-900/70 backdrop-blur-xs overflow-y-auto"
      id="archivist-editor-modal"
    >
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-5xl my-4 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center font-bold text-lg shadow-xs">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  قسم تحرير الذاتية والملفات الكامل
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-stone-950">
                  تعديل شامل للمعاملة #{sequence || transaction.sequence}
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                إضافة وحذف وتعديل المرفقات، وتحديث بيانات ومضمون المعاملة الرسمية
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-archivist-editor"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق المحرر"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Toast Banner */}
        {successMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-xs transition-all">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-200 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Modal Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* SECTION 1: إدارة المرفقات والملفات (Attachments Studio) */}
          <div className="bg-stone-50/80 rounded-xl border border-stone-200 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Paperclip className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    إدارة وتعديل المرفقات والوثائق الرسمية
                  </h3>
                  <p className="text-xs text-stone-500">
                    عدد المرفقات الحالية: <strong className="text-stone-900">{attachments.length}</strong> مرفقات
                  </p>
                </div>
              </div>

              {/* Add files trigger button */}
              <button
                type="button"
                id="btn-upload-new-attachment"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>+ إضافة مرفق / صورة جديدة</span>
              </button>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
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
                onChange={handleFileSelect}
              />
              <input
                ref={replaceFileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleReplaceFileChange}
              />

              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-xs sm:text-sm font-bold text-stone-800">
                  اسحب وأفلت ملفات الكتب والوثائق هنا، أو <span className="text-amber-700 underline">انقر لاختيار ملفات</span>
                </p>
                <p className="text-[11px] text-stone-500">
                  يدعم صور الكتب والمستندات (JPG, PNG, WEBP) ومستندات PDF مع الحفظ الفوري
                </p>
              </div>
            </div>

            {/* List of Current Attachments with Full Controls */}
            {attachments.length === 0 ? (
              <div className="p-4 bg-white rounded-lg border border-dashed border-stone-200 text-center text-xs text-stone-500">
                لا توجد مرفقات مرتبطة بهذه المعاملة حتى الآن. يمكنك إضافة مرفقات بالضغط على الزر أعلاه.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {attachments.map((att, index) => {
                  const previewUrl = getAttachmentPreviewUrl(att, {
                    number,
                    date,
                    subject,
                    entity,
                  });

                  return (
                    <div
                      key={att.id || index}
                      className="bg-white rounded-xl border border-stone-200 p-3 shadow-2xs hover:border-amber-300 transition-all flex flex-col justify-between gap-3 group"
                    >
                      {/* Top info and thumbnail */}
                      <div className="flex items-start gap-3">
                        {/* Thumbnail / Preview with zoom on click */}
                        <div
                          onClick={() => {
                            if (onOpenLightbox) {
                              onOpenLightbox(att, attachments, index);
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
                            <Eye className="w-5 h-5" />
                          </div>
                        </div>

                        {/* Editable Name & Type */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                              مرفق #{index + 1}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {att.fileSize || '1.1 MB'}
                            </span>
                          </div>

                          {/* Editable Attachment Name */}
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">
                              اسم المرفق / الملف:
                            </label>
                            <input
                              type="text"
                              value={att.name}
                              onChange={(e) =>
                                handleUpdateAttachmentField(index, 'name', e.target.value)
                              }
                              placeholder="اسم المرفق..."
                              className="w-full px-2 py-1 text-xs rounded border border-stone-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
                            />
                          </div>

                          {/* Editable Attachment Type */}
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-500 mb-0.5">
                              نوع المرفق وتصنيفه:
                            </label>
                            <select
                              value={att.type}
                              onChange={(e) =>
                                handleUpdateAttachmentField(index, 'type', e.target.value)
                              }
                              className="w-full px-2 py-1 text-xs rounded border border-stone-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden bg-white font-medium"
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

                      {/* Action Bar for this attachment */}
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenLightbox) {
                              onOpenLightbox(att, attachments, index);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-700 hover:text-amber-800 px-2 py-1 rounded hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600" />
                          <span>معاينة مكبرة</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          {/* Replace File */}
                          <button
                            type="button"
                            onClick={() => triggerReplaceFile(index)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-stone-900 px-2 py-1 rounded hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
                            title="استبدال ملف هذا المرفق بملف جديد"
                          >
                            <RefreshCw className="w-3 h-3 text-stone-500" />
                            <span>استبدال</span>
                          </button>

                          {/* Delete File */}
                          <button
                            type="button"
                            onClick={() => setAttachmentToDelete({ index, name: att.name })}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 px-2 py-1 rounded hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                            title="حذف هذا المرفق"
                          >
                            <Trash2 className="w-3 h-3 text-rose-600" />
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

          {/* SECTION 2: تعديل بيانات المعاملة الأساسية */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
              <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-800 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-stone-900">
                بيانات المعاملة الرسمية والقيد الإداري
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* العدد */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  رقم الكتاب (العدد):
                </label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="مثال: ذ / 405"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
                />
              </div>

              {/* رقم القيد / التسلسل */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  رقم القيد (التسلسل):
                </label>
                <input
                  type="text"
                  value={sequence}
                  onChange={(e) => setSequence(e.target.value)}
                  placeholder="مثال: 124"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium font-mono"
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
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
                />
              </div>

              {/* حركة المعاملة */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  حركة الكتاب:
                </label>
                <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200">
                  {(['صادر', 'وارد', 'داخلي'] as TransactionDirection[]).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setDirection(dir)}
                      className={`py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        direction === dir
                          ? 'bg-stone-900 text-amber-300 shadow-2xs'
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
                  القسم المختص:
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden bg-white font-semibold"
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
                  onChange={(e) => setSubType(e.target.value)}
                  placeholder="إيفاد، إجازة، كتب وزارية..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
                />
              </div>

              {/* درجة الأسبقية */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  درجة الأسبقية:
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TransactionPriority)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden bg-white font-bold"
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
                  onChange={(e) => setStatus(e.target.value as TransactionStatus)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden bg-white font-bold"
                >
                  <option value="جديد">جديد</option>
                  <option value="قيد الإنجاز">قيد الإنجاز</option>
                  <option value="مكتمل">مكتمل</option>
                </select>
              </div>
            </div>

            {/* الجهة والمنتسب */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  الجهة المرتبطة (إلى / من):
                </label>
                <input
                  type="text"
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                  placeholder="مثال: الأمانة العامة لمجلس الوزراء"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  اسم المنتسب المعني (إن وجد):
                </label>
                <input
                  type="text"
                  list="employee-suggestions"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="اكتب اسم المنتسب أو اختره..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
                />
                <datalist id="employee-suggestions">
                  {employees.map((emp) => (
                    <option key={emp} value={emp} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* الموضوع / المضمون الكامل */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                موضوع ومضمون المعاملة:
              </label>
              <textarea
                rows={3}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="اكتب المضمون الدقيق للكتاب أو المعاملة الرسمية..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium leading-relaxed"
              />
            </div>

            {/* حقول تفصيلية خاصة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  الغرض (إن وجد):
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="مهمة عمل، صيانة..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  الوجهة / الدائرة:
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="موقع المهمة..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  العجلة / المركبة:
                </label>
                <input
                  type="text"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="رقم ونوع العجلة..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-amber-500 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">
                  المبلغ المالي:
                </label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مثال: 500,000 د.ع"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-amber-500 outline-hidden font-mono"
                />
              </div>
            </div>

            {/* الملاحظات الإدارية */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                ملاحظات الذاتية والأرشفة:
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات داخلية لمسؤول الذاتية..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-medium"
              />
            </div>
          </div>

          {/* SECTION 3: نطاق الخصوصية وصلاحيات الرؤية وربط المنتسبين (Access Scope & RBAC) */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    نطاق الخصوصية وصلاحيات الرؤية (Access Scope)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    تحديد من يملك صلاحية الاطلاع على هذا المستند وقراءته داخل المنظومة
                  </p>
                </div>
              </div>
              {ACCESS_SCOPE_OPTIONS[visibility] && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ACCESS_SCOPE_OPTIONS[visibility].badgeColor}`}>
                  النطاق المعتمد: {ACCESS_SCOPE_OPTIONS[visibility].label}
                </span>
              )}
            </div>

            {/* Scope Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.keys(ACCESS_SCOPE_OPTIONS) as AccessScope[]).map((scopeKey) => {
                const opt = ACCESS_SCOPE_OPTIONS[scopeKey];
                const isSelected = visibility === scopeKey;
                return (
                  <button
                    key={scopeKey}
                    type="button"
                    onClick={() => setVisibility(scopeKey)}
                    className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/50 shadow-xs'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                          {scopeKey === 'PublicToEmployees' && <Globe className="w-3.5 h-3.5 text-emerald-600" />}
                          {scopeKey === 'SpecificEmployees' && <Users className="w-3.5 h-3.5 text-blue-600" />}
                          {scopeKey === 'Administrative' && <FileText className="w-3.5 h-3.5 text-stone-600" />}
                          {scopeKey === 'DirectorOnly' && <Lock className="w-3.5 h-3.5 text-rose-600" />}
                          <span>{opt.label}</span>
                        </span>
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-stone-300" />
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 leading-relaxed">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Linked Employees Multi-Select */}
            <div className={`p-4 rounded-xl border transition-colors ${
              visibility === 'SpecificEmployees'
                ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-300/50'
                : 'bg-stone-50/60 border-stone-200'
            }`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <label className="text-xs font-bold text-stone-800">
                    ربط المنتسبين المعنيين بالمعاملة (Multi-Select Employee Linking):
                  </label>
                </div>
                {visibility === 'SpecificEmployees' && (
                  <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                    مطلوب: يحدد من يرى هذا الكتاب حصراً في حسابه
                  </span>
                )}
              </div>

              <p className="text-[11px] text-stone-500 mb-3">
                اختر منتسباً أو أكثر لربط قيودهم بهذا الكتاب. عند اختيار نطاق "خاص بالمعنيين"، لن يظهر الكتاب في حساب أي منتسب سوى من يتم تحديده هنا.
              </p>

              {/* Selected Chips */}
              <div className="flex flex-wrap gap-1.5 mb-3 min-h-[36px] p-2.5 rounded-lg bg-white border border-stone-200">
                {employeeIds.length === 0 ? (
                  <span className="text-xs text-stone-400 self-center">
                    لم يتم ربط أي منتسب بعد (انقر على أسماء المنتسبين في القائمة أدناه لتحديدهم)
                  </span>
                ) : (
                  employeeIds.map((id) => {
                    const emp = normalizedEmployeesList.find((e) => e.id === id);
                    const name = emp ? emp.name : id;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 text-xs font-bold border border-blue-200 shadow-2xs"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleEmployee(id)}
                          className="hover:text-rose-600 cursor-pointer p-0.5 rounded hover:bg-blue-200 transition-colors"
                          title="إزالة هذا المنتسب من الربط"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              {/* Quick Selectable Pills List */}
              <div>
                <span className="text-[11px] font-semibold text-stone-600 block mb-1.5">
                  قائمة الكوادر والمنتسبين (انقر لتفعيل / إلغاء التحديد):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 bg-white rounded-lg border border-stone-200">
                  {normalizedEmployeesList.map((emp) => {
                    const isSelected = employeeIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleToggleEmployee(emp.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-2xs'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                        }`}
                      >
                        <span>{emp.name}</span>
                        {emp.department && emp.department !== 'عام' && (
                          <span className={`text-[10px] opacity-75 ${isSelected ? 'text-blue-100' : 'text-stone-500'}`}>
                            ({emp.department})
                          </span>
                        )}
                        {isSelected && <Check className="w-3 h-3 ml-0.5 stroke-[2.5]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {employeeIds.length > 0 && (
                <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-stone-200/70">
                  <span className="text-[11px] text-stone-500 font-medium">
                    تم ربط {employeeIds.length} منتسب بهذا السجل
                  </span>
                  <button
                    type="button"
                    onClick={handleSyncEmployeeNamesToField}
                    className="text-xs text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                  >
                    مزامنة الأسماء المحددة مع حقل "اسم المنتسب المعني" أعلاه ↗
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer: Action Buttons */}
        <div className="px-5 py-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Delete Transaction Button */}
            {onDeleteTransaction && (
              <button
                type="button"
                id="btn-delete-transaction-trigger"
                onClick={() => setIsConfirmingDeleteTransaction(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 transition-all cursor-pointer shadow-2xs"
                title="حذف هذه المعاملة نهائياً من السجل"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف المعاملة نهائياً</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="btn-cancel-archivist-editor"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              إلغاء التعديل
            </button>

            <button
              type="button"
              id="btn-save-archivist-editor"
              onClick={() => handleSaveAll()}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4 text-amber-400" />
              <span>حفظ جميع التعديلات والمرفقات ✓</span>
            </button>
          </div>
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
                <h4 className="text-sm font-bold text-stone-900">تأكيد حذف المرفق</h4>
                <p className="text-xs text-stone-500">هذا الإجراء سيقوم بإزالة الملف من المعاملة</p>
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
                onClick={confirmDeleteAttachment}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete Entire Transaction */}
      {isConfirmingDeleteTransaction && (
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
              هل أنت متأكد من رغبتك في حذف المعاملة بالكامل رقم قيد (<strong>#{sequence}</strong>) والعدد (<strong>{number}</strong>) بموضوع «<strong>{subject}</strong>» مع كافة مرفقاتها الممسوحة؟
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
                onClick={handleDeleteTransactionFinal}
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
