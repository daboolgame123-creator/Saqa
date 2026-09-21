import React from 'react';
import { X, Printer, Download, Paperclip, Calendar, CheckCircle, Eye, Share2 } from 'lucide-react';
import { Transaction, DailySituationData } from '../../types';

interface DailySituationDocumentModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onViewAttachment?: (transaction: Transaction, index: number) => void;
}

export const DailySituationDocumentModal: React.FC<DailySituationDocumentModalProps> = ({
  transaction,
  onClose,
  onViewAttachment,
}) => {
  if (!transaction || !transaction.dailySituationData) return null;

  const data: DailySituationData = transaction.dailySituationData;

  const handlePrint = () => {
    window.print();
  };

  // Helper to render an official table section matching 9.jpg
  const renderTableSection = (
    title: string,
    entries: typeof data.permanentLeaves,
    detailColumnHeader: string,
    defaultEmployment: string,
    emptyRowsCount: number = 2
  ) => {
    // Fill up with at least emptyRowsCount rows if empty or few, to match the official pre-printed Iraqi form
    const displayEntries = [...entries];
    const totalRows = Math.max(displayEntries.length, emptyRowsCount);

    return (
      <div className="mb-4">
        <div className="text-center font-bold text-sm sm:text-base text-stone-900 pb-1">
          ({title})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-stone-800 text-xs text-center">
            <thead>
              <tr className="bg-stone-100/90 font-bold border-b border-stone-800 text-stone-900">
                <th className="border border-stone-800 py-1.5 px-2 w-12 text-center">ت</th>
                <th className="border border-stone-800 py-1.5 px-3">الاسم الرباعي للمنتسب</th>
                <th className="border border-stone-800 py-1.5 px-3 w-28">صفة العمل</th>
                <th className="border border-stone-800 py-1.5 px-3">{detailColumnHeader}</th>
                <th className="border border-stone-800 py-1.5 px-3 w-28">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalRows }).map((_, idx) => {
                const item = displayEntries[idx];
                return (
                  <tr key={item?.id || `empty-${idx}`} className="h-7.5 hover:bg-stone-50/50">
                    <td className="border border-stone-800 font-mono font-semibold py-1 px-2">
                      {idx + 1}
                    </td>
                    <td className="border border-stone-800 font-bold text-stone-900 py-1 px-3 text-right sm:text-center">
                      {item?.employeeName || ''}
                    </td>
                    <td className="border border-stone-800 py-1 px-2 font-medium">
                      {item?.employmentType || (item ? defaultEmployment : '')}
                    </td>
                    <td className="border border-stone-800 py-1 px-3 font-semibold text-stone-800">
                      {item?.details || ''}
                    </td>
                    <td className="border border-stone-800 py-1 px-2 font-mono text-[11px]">
                      {item?.date || (item ? data.situationDate : '')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-60 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white dark:bg-stone-900 rounded-2xl max-w-4xl w-full max-h-[96vh] flex flex-col shadow-2xl border border-stone-300 dark:border-stone-700 overflow-hidden"
        dir="rtl"
      >
        {/* Top Modal Controls Header (hidden in print) */}
        <div className="p-3.5 sm:p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/90 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-stone-950 flex items-center justify-center font-bold text-sm">
              📋
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                استعراض استمارة الموقف اليومي الرسمية المعتمدة
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                مطابقة لنموذج مركز الدراسات الإفريقية وقسم الشؤون الفكرية والثقافية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold hover:bg-stone-800 dark:hover:bg-amber-300 transition-colors shadow-xs cursor-pointer active:scale-95"
              title="طباعة الاستمارة الرسمية أصولياً"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الاستمارة الرسمية</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Container with Sheet Preview */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-stone-200/50 dark:bg-stone-950 flex justify-center">
          {/* Printable Official Paper Layout */}
          <div 
            id="printable-daily-situation-sheet"
            className="w-full max-w-[210mm] bg-white text-stone-950 shadow-xl border border-stone-300 p-6 sm:p-10 my-auto rounded-sm print:m-0 print:p-8 print:border-none print:shadow-none"
            style={{ minHeight: '270mm' }}
          >
            {/* 1. Official Header matching 9.jpg */}
            <div className="text-center space-y-2 mb-6">
              <h1 className="text-base sm:text-lg font-bold text-stone-900 tracking-wide">
                {data.addressedTo || 'السيد رئيس قسم الشؤون الفكرية والثقافية دام توفيقه'}
              </h1>
              
              <div className="text-sm sm:text-base font-bold text-stone-800">
                الموقف
              </div>

              <div className="text-sm sm:text-base font-bold text-stone-900 pb-2">
                اليومي لمنتسبي {data.departmentName || 'مركز الدراسات الافريقية'} بتاريخ: <span className="font-mono underline decoration-1 underline-offset-4 font-bold">{data.situationDate}</span>
              </div>
            </div>

            {/* 2. The 6 Tables matching 9.jpg */}
            <div className="space-y-4">
              {/* 1. الإجازات اليومية للمنتسب الدائم */}
              {renderTableSection(
                'الإجازات اليومية للمنتسب الدائم',
                data.permanentLeaves || [],
                'عدد الايام ونوع الاجازة',
                'دائمي',
                2
              )}

              {/* 2. الساعات الزمنية (للمنتسب الدائم) */}
              {renderTableSection(
                'الساعات الزمنية',
                data.permanentTimePermissions || [],
                'عدد الساعات من والى',
                'دائمي',
                2
              )}

              {/* 3. تحويل دوام او دورية او ايفاد (للمنتسب الدائم) */}
              {renderTableSection(
                'تحويل دوام او دورية او ايفاد',
                data.permanentShiftChanges || [],
                'من يوم الى يوم',
                'دائمي',
                3
              )}

              {/* 4. الاجازات اليومية لمنتسبي المكافأة والاجر اليومي والمتطوع */}
              {renderTableSection(
                'الاجازات اليومية لمنتسبي المكافأة والاجر اليومي والمتطوع',
                data.temporaryLeaves || [],
                'يوم الاجازة',
                'مكافأة',
                2
              )}

              {/* 5. الساعات الزمنية (لمنتسبي المكافأة والأجر والمتطوع) */}
              {renderTableSection(
                'الساعات الزمنية',
                data.temporaryTimePermissions || [],
                'عدد الساعات من والى',
                'أجر يومي',
                2
              )}

              {/* 6. تحويل دوام او دورية او ايفاد (لمنتسبي المكافأة والأجر والمتطوع) */}
              {renderTableSection(
                'تحويل دوام او دورية او ايفاد',
                data.temporaryShiftChanges || [],
                'من يوم الى يوم',
                'ساعات',
                3
              )}
            </div>

            {/* 3. Footer Signature Section matching 9.jpg */}
            <div className="mt-8 pt-4 flex flex-col items-start pr-4 sm:pr-8">
              <div className="text-center font-bold text-sm text-stone-900 min-w-[160px]">
                <div>{data.supervisorEndorsement || 'تأييد مسؤول المركز'}</div>
                <div className="h-16 flex items-center justify-center text-xs text-stone-400 italic font-normal">
                  (التوقيع والختم الرسمي)
                </div>
              </div>
            </div>

            {/* Attached scanned papers reminder (if any) */}
            {transaction.attachments && transaction.attachments.length > 0 && (
              <div className="mt-6 pt-3 border-t border-dashed border-stone-300 text-xs text-stone-600 print:hidden flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <Paperclip className="w-4 h-4 text-amber-600" />
                  <span>المرفقات والكتب الممسوحة المرفقة مع هذا الموقف ({transaction.attachments.length}):</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {transaction.attachments.map((att, idx) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => onViewAttachment?.(transaction, idx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-stone-100 hover:bg-amber-100 text-stone-800 text-[11px] font-medium border border-stone-200 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-stone-500" />
                      <span>{att.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
