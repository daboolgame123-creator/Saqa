import React, { useState, useRef } from 'react';
import { 
  X, 
  FileText, 
  Calendar, 
  Building2, 
  User, 
  Paperclip, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Layers, 
  Check, 
  Plus, 
  Trash2, 
  Edit3, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Download, 
  Image as ImageIcon,
  UploadCloud,
  CheckCheck,
  ShieldCheck
} from 'lucide-react';
import { Transaction, TransactionStatus, Attachment, AttachmentType, ACCESS_SCOPE_OPTIONS } from '../../types';
import { processUploadedFile, getAttachmentPreviewUrl } from '../../utils/attachmentUtils';
import { ImageLightboxModal } from './ImageLightboxModal';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onUpdateStatus: (id: string, newStatus: TransactionStatus) => void;
  onToggleReadStatus?: () => void;
  onUpdateAttachments?: (transactionId: string, attachments: Attachment[]) => void;
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

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
  onUpdateStatus,
  onToggleReadStatus,
  onUpdateAttachments,
}) => {
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  // Edit attachment modal/inline state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editType, setEditType] = useState<string>('ملحق');

  // Loading indicator for file uploads
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIndexRef = useRef<number | null>(null);

  if (!transaction) return null;

  const attachments = transaction.attachments || [];
  const currentAttachment = attachments[selectedAttachmentIndex] || attachments[0];

  // Helper to commit attachments update
  const commitAttachments = (newAttachments: Attachment[]) => {
    if (onUpdateAttachments) {
      onUpdateAttachments(transaction.id, newAttachments);
    }
  };

  // Upload new images/attachments
  const handleAddNewFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingFile(true);
    try {
      const files: File[] = Array.from(e.target.files);
      const newCreatedAttachments: Attachment[] = [];
      const today = new Date().toISOString().split('T')[0];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const processed = await processUploadedFile(file);
        const defaultType: AttachmentType = 
          attachments.length === 0 && i === 0 ? 'كتاب رئيسي' : 'صورة وثيقة';

        newCreatedAttachments.push({
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          type: defaultType,
          fileSize: processed.fileSizeStr,
          uploadDate: today,
          previewUrl: processed.dataUrl,
          isImage: processed.isImage,
        });
      }

      const updated = [...attachments, ...newCreatedAttachments];
      commitAttachments(updated);
      setSelectedAttachmentIndex(attachments.length); // jump to the new attachment
    } catch (err) {
      console.error('Failed to process file:', err);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Replace file of an existing attachment
  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetIdx = replaceTargetIndexRef.current;
    if (targetIdx === null || !e.target.files || e.target.files.length === 0) return;
    setIsProcessingFile(true);
    try {
      const file = e.target.files[0];
      const processed = await processUploadedFile(file);
      const targetAtt = attachments[targetIdx];
      if (targetAtt) {
        const updatedAtt: Attachment = {
          ...targetAtt,
          name: file.name,
          fileSize: processed.fileSizeStr,
          previewUrl: processed.dataUrl,
          isImage: processed.isImage,
        };
        const updatedList = attachments.map((att, i) => (i === targetIdx ? updatedAtt : att));
        commitAttachments(updatedList);
      }
    } catch (err) {
      console.error('Failed to replace file:', err);
    } finally {
      setIsProcessingFile(false);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
      replaceTargetIndexRef.current = null;
    }
  };

  // Trigger replace
  const triggerReplace = (index: number) => {
    replaceTargetIndexRef.current = index;
    replaceFileInputRef.current?.click();
  };

  // Delete attachment
  const handleDeleteAttachment = (indexToDelete: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (attachments.length <= 1) {
      alert('يجب أن تحتوي المعاملة على مرفق أو وثيقة واحدة على الأقل.');
      return;
    }
    const confirmDelete = window.confirm(`هل أنت متأكد من حذف المرفق «${attachments[indexToDelete]?.name}»؟`);
    if (!confirmDelete) return;

    const updated = attachments.filter((_, i) => i !== indexToDelete);
    commitAttachments(updated);
    if (selectedAttachmentIndex >= updated.length) {
      setSelectedAttachmentIndex(Math.max(0, updated.length - 1));
    }
    if (editingIndex === indexToDelete) {
      setEditingIndex(null);
    }
  };

  // Start edit
  const handleStartEdit = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const att = attachments[index];
    if (!att) return;
    setEditingIndex(index);
    setEditName(att.name);
    setEditType(att.type);
  };

  // Save edit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIndex === null) return;
    const target = attachments[editingIndex];
    if (!target) return;

    const updatedAtt: Attachment = {
      ...target,
      name: editName.trim() || target.name,
      type: editType,
    };
    const updated = attachments.map((att, i) => (i === editingIndex ? updatedAtt : att));
    commitAttachments(updated);
    setEditingIndex(null);
  };

  const previewSrc = currentAttachment
    ? getAttachmentPreviewUrl(currentAttachment, {
        number: transaction.number,
        date: transaction.date,
        subject: transaction.subject,
        entity: transaction.entity,
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 overflow-y-auto">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleAddNewFiles}
      />
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleReplaceFile}
      />

      <div 
        className="bg-white dark:bg-stone-900 rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden"
        dir="rtl"
      >
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/80 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-stone-900 text-amber-300">
                العدد: {transaction.number}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                التسلسل: {transaction.sequence}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {transaction.direction}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                قسم {transaction.category}
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200">
                نوع: {transaction.subType}
              </span>
              {transaction.priority && transaction.priority !== 'عادي' && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  transaction.priority === 'عاجل جداً'
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 animate-pulse'
                    : transaction.priority === 'هام'
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                    : 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                }`}>
                  {transaction.priority === 'عاجل جداً' ? '🚨 عاجل جداً' : transaction.priority === 'هام' ? '⚠️ هام' : '🔒 سري وخاص'}
                </span>
              )}
              {transaction.visibility && ACCESS_SCOPE_OPTIONS[transaction.visibility] && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${ACCESS_SCOPE_OPTIONS[transaction.visibility].badgeColor}`}>
                  نطاق الصلاحية: {ACCESS_SCOPE_OPTIONS[transaction.visibility].label}
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-xl font-bold text-stone-900 dark:text-stone-100 mt-1">
              {transaction.subject}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white text-stone-800 dark:text-stone-200 text-xs font-bold border border-stone-300 dark:border-stone-700 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
            title="إغلاق النافذة والعودة للسجل (Esc)"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
            <span>خروج ✕</span>
          </button>
        </div>

        {/* Read Notification & Direct Access Feedback Banner - تم الاطلاع على الكتاب وقراءته وتحتها */}
        <div className="bg-emerald-50/95 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/60 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-700 shadow-2xs text-xs sm:text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>تم الاطلاع على الكتاب وقراءته ✓</span>
            </span>
            {transaction.readAt && (
              <span className="text-emerald-800 dark:text-emerald-300 font-semibold bg-white/70 dark:bg-stone-900/70 px-2.5 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/60 text-xs">
                توقيت الاطلاع: {transaction.readAt}
              </span>
            )}
            <span className="text-stone-600 dark:text-stone-400 font-medium text-[11px] hidden sm:inline">
              (كافة تفاصيل الكتاب، الأقسام، والمرفقات مدرجة أدناه)
            </span>
          </div>

          {onToggleReadStatus && (
            <button
              type="button"
              onClick={onToggleReadStatus}
              className="text-[11px] text-stone-600 dark:text-stone-400 hover:text-rose-700 dark:hover:text-rose-400 font-semibold underline cursor-pointer"
              title="إذا أردت ترك الكتاب كغير مقروء لمراجعته لاحقاً"
            >
              {transaction.isRead ? 'إعادة تعيين كـ «غير مقروء 🔴»' : 'تحديد كـ «مقروء ✓»'}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Transaction Metadata & Status */}
          <div className="lg:col-span-6 space-y-4">
            {/* Status Control Box */}
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-2">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider block">
                متابعة حالة المعاملة
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['قيد المراجعة', 'مكتمل'] as TransactionStatus[]).map((status) => {
                  const isActive = transaction.status === status;
                  let colorClasses = 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600';
                  if (isActive) {
                    if (status === 'قيد المراجعة') colorClasses = 'border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold ring-1 ring-amber-400';
                    if (status === 'مكتمل') colorClasses = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-bold ring-1 ring-emerald-400';
                  }

                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => onUpdateStatus(transaction.id, status)}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${colorClasses}`}
                    >
                      {status === 'قيد المراجعة' && <Clock className="w-3.5 h-3.5" />}
                      {status === 'مكتمل' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{status}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Core Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
              <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 space-y-1">
                <span className="text-xs font-semibold text-stone-400 dark:text-stone-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" /> تاريخ الكتاب
                </span>
                <p className="font-semibold text-stone-800 dark:text-stone-200">{transaction.date}</p>
                <span className="text-[11px] text-stone-400 dark:text-stone-500">تابع لتقرير شهر {transaction.month}</span>
              </div>

              <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 space-y-1">
                <span className="text-xs font-semibold text-stone-400 dark:text-stone-400 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" /> الجهة المرتبطة
                </span>
                <p className="font-semibold text-stone-800 dark:text-stone-200">{transaction.entity}</p>
              </div>

              {transaction.employeeName && (
                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/40 space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> المنتسب المرتبط بالمعاملة
                  </span>
                  <p className="font-bold text-stone-900 dark:text-stone-100">{transaction.employeeName}</p>
                </div>
              )}

              {/* Access Scope / Privacy Level Card */}
              {transaction.visibility && ACCESS_SCOPE_OPTIONS[transaction.visibility] && (
                <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-500" /> نطاق الصلاحيات والخصوصية (Access Scope)
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${ACCESS_SCOPE_OPTIONS[transaction.visibility].badgeColor}`}>
                      {ACCESS_SCOPE_OPTIONS[transaction.visibility].label}
                    </span>
                    <span className="text-xs text-stone-600 dark:text-stone-300">
                      {ACCESS_SCOPE_OPTIONS[transaction.visibility].description}
                    </span>
                  </div>
                </div>
              )}

              {transaction.isDailySituation && transaction.dailySituationData && (
                <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/40 space-y-1 sm:col-span-2">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                    📋 هذا السجل يمثل استمارة موقف يومي معتمد
                  </span>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    العدد الكلي للكادر: {transaction.dailySituationData.totalStaff} • الحضور الفعلي: {transaction.dailySituationData.presentCount} • المجازين: {transaction.dailySituationData.leaveCount} • الإيفادات: {transaction.dailySituationData.deputationCount}
                  </p>
                </div>
              )}
            </div>

            {/* Specific Dynamic Details (If Any) */}
            {transaction.specificDetails && Object.keys(transaction.specificDetails).length > 0 && (
              <div className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/60 space-y-2">
                <span className="text-xs font-bold text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                  بيانات تفصيلية خاصة بنوع ({transaction.subType}):
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {transaction.specificDetails.destination && (
                    <div>
                      <span className="text-stone-400 dark:text-stone-500 block">وجهة الإيفاد:</span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">{transaction.specificDetails.destination}</span>
                    </div>
                  )}
                  {transaction.specificDetails.vehicle && (
                    <div>
                      <span className="text-stone-400 dark:text-stone-500 block">العجلة المخصصة:</span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">{transaction.specificDetails.vehicle}</span>
                    </div>
                  )}
                  {transaction.specificDetails.purpose && (
                    <div className="col-span-2">
                      <span className="text-stone-400 dark:text-stone-500 block">الغرض:</span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">{transaction.specificDetails.purpose}</span>
                    </div>
                  )}
                  {transaction.specificDetails.amount && (
                    <div>
                      <span className="text-stone-400 dark:text-stone-500 block">المبلغ المالي:</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{transaction.specificDetails.amount}</span>
                    </div>
                  )}
                  {transaction.specificDetails.leaveDays && (
                    <div>
                      <span className="text-stone-400 dark:text-stone-500 block">عدد أيام الإجازة:</span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">{transaction.specificDetails.leaveDays} أيام ({transaction.specificDetails.leaveType})</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Director's Directive / هامش المدير (إن وجد) */}
            {transaction.directorDirective && (
              <div className="p-3.5 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-linear-to-br from-amber-50 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <span className="text-sm">✍️</span>
                    هامش وتوجيه السيد المدير
                  </span>
                  {transaction.directorDirective.date && (
                    <span className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-300/80 bg-amber-100/70 dark:bg-amber-900/60 px-2 py-0.5 rounded">
                      {transaction.directorDirective.date}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-200 leading-relaxed bg-white/80 dark:bg-stone-900/80 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  «{transaction.directorDirective.text}»
                </p>
                {transaction.directorDirective.actionRequired && (
                  <span className="inline-block text-[11px] font-bold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                    مطلوب إجراء فوري ومتابعة من شعبة الذاتية
                  </span>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 space-y-1.5">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 block">ملاحظات الذاتية والمتابعة:</span>
              <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-900/60 p-2.5 rounded-lg border border-stone-100 dark:border-stone-800">
                {transaction.notes || 'لا توجد ملاحظات مسجلة لهذه المعاملة.'}
              </p>
            </div>
          </div>

          {/* Right Column: Scanned Attachments & Photo Editor */}
          <div className="lg:col-span-6 space-y-3 flex flex-col">
            {/* Attachments Section Header with Add Photo Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 dark:border-stone-700 pb-2">
              <div className="flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                  المرفقات والصور الممسوحة ({attachments.length})
                </span>
              </div>

              {/* Add Photo / Attachment Button */}
              <button
                type="button"
                id="btn-add-attachment"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
                className="inline-flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold px-3 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="إضافة صور أو وثائق ممسوحة ضوئياً من الهاتف أو الحاسوب"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صورة / وثيقة</span>
              </button>
            </div>

            {/* Processing Spinner */}
            {isProcessingFile && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-lg text-xs flex items-center justify-center gap-2">
                <span className="animate-spin text-amber-600">⌛</span>
                <span>جاري معالجة وتحسين جودة الصورة المرفوعة...</span>
              </div>
            )}

            {/* Attachment Selector Tabs & Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
              {attachments.map((att, idx) => {
                const isSelected = selectedAttachmentIndex === idx;
                return (
                  <div
                    key={att.id || idx}
                    onClick={() => {
                      setSelectedAttachmentIndex(idx);
                      setZoomLevel(1);
                      setRotation(0);
                    }}
                    className={`group relative flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer select-none whitespace-nowrap ${
                      isSelected
                        ? 'bg-stone-900 text-amber-300 border-stone-900 font-semibold shadow-xs ring-1 ring-amber-400'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                    }`}
                  >
                    <span className="text-[11px] opacity-80">#{idx + 1}</span>
                    <span className="truncate max-w-[110px]">{att.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                      isSelected ? 'bg-amber-400/20 text-amber-200' : 'bg-stone-200/80 text-stone-600'
                    }`}>
                      {att.type}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Inline Editor for the Selected Attachment (If active) */}
            {editingIndex !== null && (
              <form onSubmit={handleSaveEdit} className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <span className="flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5" /> تعديل بيانات المرفق #{editingIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                  <div className="sm:col-span-7 space-y-1">
                    <label className="text-[11px] font-semibold text-stone-700 block">اسم المرفق / الملف:</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md border border-stone-300 bg-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[11px] font-semibold text-stone-700 block">نوع وتصنيف الوثيقة:</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md border border-stone-300 bg-white text-xs focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer"
                    >
                      {ATTACHMENT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="px-3 py-1 rounded bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1 rounded bg-stone-900 hover:bg-stone-800 text-amber-300 font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    حفظ التعديلات ✓
                  </button>
                </div>
              </form>
            )}

            {/* Document / Image Viewer Canvas */}
            <div className="rounded-xl border border-stone-300 bg-stone-900/95 p-2 flex flex-col relative overflow-hidden shadow-inner">
              {/* Overlay Top Bar: Controls */}
              <div className="bg-stone-950/85 backdrop-blur-xs rounded-lg px-2.5 py-1.5 mb-2 flex items-center justify-between text-white text-xs z-10 border border-stone-800">
                <div className="flex items-center gap-2 truncate">
                  <span className="px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[10px] font-bold">
                    {currentAttachment?.type}
                  </span>
                  <span className="truncate max-w-[180px] text-stone-200 text-[11px] font-medium">
                    {currentAttachment?.name}
                  </span>
                </div>

                {/* Viewer Tools */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 2.5))}
                    className="p-1 hover:bg-stone-800 rounded text-stone-300 hover:text-white cursor-pointer"
                    title="تكبير"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.6))}
                    className="p-1 hover:bg-stone-800 rounded text-stone-300 hover:text-white cursor-pointer"
                    title="تصغير"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="p-1 hover:bg-stone-800 rounded text-stone-300 hover:text-white cursor-pointer"
                    title="تدوير"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLightboxOpen(true)}
                    className="p-1 hover:bg-amber-400 hover:text-stone-950 rounded text-stone-300 cursor-pointer"
                    title="ملء الشاشة والتكبير عالي الدقة"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Main Document / Image Canvas */}
              <div 
                className="h-[320px] sm:h-[370px] flex items-center justify-center overflow-hidden rounded-lg bg-stone-950 cursor-zoom-in relative select-none"
                onClick={() => setIsLightboxOpen(true)}
                title="انقر لتكبير الوثيقة وعرضها بحجم كامل"
              >
                {currentAttachment ? (
                  <div 
                    className="transition-transform duration-150 flex items-center justify-center max-w-full max-h-full pointer-events-none select-none"
                    style={{
                      transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                    }}
                  >
                    <img
                      src={previewSrc}
                      alt={currentAttachment.name}
                      className="max-h-[300px] sm:max-h-[350px] w-auto max-w-full object-contain rounded shadow-lg border border-stone-800 bg-white select-none"
                    />
                  </div>
                ) : (
                  <div className="text-center text-stone-500 text-xs py-10">
                    لا توجد وثيقة أو صورة محددة
                  </div>
                )}

                <div className="absolute bottom-2 left-2 bg-stone-900/80 backdrop-blur-xs text-stone-300 text-[10px] px-2 py-0.5 rounded pointer-events-none">
                  انقر للتكبير عالي الدقة 🔍
                </div>
              </div>

              {/* Bottom Quick Attachment Actions: Edit name, Replace Image, Delete */}
              {currentAttachment && (
                <div className="mt-2 pt-2 border-t border-stone-800 flex items-center justify-between text-xs text-stone-300">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleStartEdit(selectedAttachmentIndex, e)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="تعديل اسم أو تصنيف هذا المرفق"
                    >
                      <Edit3 className="w-3 h-3 text-amber-400" />
                      <span>تعديل المرفق</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerReplace(selectedAttachmentIndex)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="استبدال صورة هذا المرفق بصورة جديدة من الجهاز"
                    >
                      <UploadCloud className="w-3 h-3 text-emerald-400" />
                      <span>استبدال الصورة</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400 font-mono">
                      {currentAttachment.fileSize}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteAttachment(selectedAttachmentIndex, e)}
                      className="p-1 rounded text-stone-400 hover:text-rose-400 hover:bg-rose-950/60 transition-colors cursor-pointer"
                      title="حذف هذا المرفق"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/80 flex items-center justify-between">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            تاريخ التوثيق: {transaction.date} • التسلسل الإداري: #{transaction.sequence}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-900 dark:bg-stone-800 hover:bg-rose-700 dark:hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 border border-transparent dark:border-stone-700"
          >
            <X className="w-4 h-4" />
            <span>خروج والعودة لسجل المعاملات</span>
          </button>
        </div>
      </div>

      {/* Lightbox / Full-Screen Inspection Modal with Fixed Exit Button & Multi-attachment browsing */}
      {isLightboxOpen && currentAttachment && (
        <ImageLightboxModal
          attachment={{
            ...currentAttachment,
            previewUrl: previewSrc,
          }}
          attachments={attachments}
          currentIndex={selectedAttachmentIndex}
          onIndexChange={(idx) => {
            setSelectedAttachmentIndex(idx);
            setZoomLevel(1);
          }}
          transactionTitle={transaction.subject}
          transactionNumber={transaction.number}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  );
};
