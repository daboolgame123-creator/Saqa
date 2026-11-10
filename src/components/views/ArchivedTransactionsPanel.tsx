import React, { useEffect, useRef, useState } from 'react';
import type { Transaction } from '../../core/models';
import { ApiError } from '../../api/apiClient';
import { getBearerToken } from '../../api/sessionToken';
import {
  listPilotArchivedTransactions,
  restorePilotArchivedTransaction,
  type ArchivedPilotTransaction,
} from '../../api/pilotArchive';

const PAGE_SIZE = 25;

interface Props {
  onClose: () => void;
  /** The parent refreshes *all* active scoped resources after restoration. */
  onRestored: (transaction: Transaction) => Promise<void>;
}

/**
 * Official admin-only historical view. Mount from an admin role gate in App,
 * but never rely on that for security: GET and POST are protected on server.
 */
export const ArchivedTransactionsPanel: React.FC<Props> = ({onClose, onRestored}) => {
  const [rows, setRows] = useState<ArchivedPilotTransaction[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restorePending, setRestorePending] = useState(false);
  const [confirm, setConfirm] = useState<ArchivedPilotTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const pendingRead = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const sessionToken = getBearerToken();
    pendingRead.current = true;
    void listPilotArchivedTransactions(0, PAGE_SIZE)
      .then((data) => {
        if (!mounted.current || getBearerToken() !== sessionToken) return;
        setRows(data);
        setNextOffset(data.length);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch(() => {
        if (mounted.current && getBearerToken() === sessionToken) {
          setError('تعذّر قراءة الأرشيف من الخادم. لم تُعرض بيانات بديلة.');
        }
      })
      .finally(() => {
        pendingRead.current = false;
        if (mounted.current && getBearerToken() === sessionToken) setLoading(false);
      });
    return () => { mounted.current = false; };
  }, []);

  async function loadMore(): Promise<void> {
    if (pendingRead.current || !hasMore || restorePending) return;
    pendingRead.current = true;
    const token = getBearerToken();
    setLoading(true);
    setError(null);
    try {
      const data = await listPilotArchivedTransactions(nextOffset, PAGE_SIZE);
      if (!mounted.current || getBearerToken() !== token) return;
      setRows((prev) => {
        const existing = new Set(prev.map((row) => row.id));
        return [...prev, ...data.filter((row) => !existing.has(row.id))];
      });
      setNextOffset(nextOffset + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      if (mounted.current && getBearerToken() === token) {
        setError('تعذّر تحميل الصفحة التالية من الأرشيف. احتفظنا بالصفوف المؤكدة فقط.');
      }
    } finally {
      pendingRead.current = false;
      if (mounted.current && getBearerToken() === token) setLoading(false);
    }
  }

  async function restoreConfirmed(): Promise<void> {
    const item = confirm;
    if (!item || restorePending) return;
    const token = getBearerToken();
    setRestorePending(true);
    setError(null);
    setNotice(null);
    let restored: Transaction;
    try {
      restored = await restorePilotArchivedTransaction(item.id, item.version);
    } catch (e: unknown) {
      if (!mounted.current || getBearerToken() !== token) return;
      setError(e instanceof ApiError && e.status === 409
        ? 'تغيّرت نسخة الكتاب المؤرشف. أغلق الأرشيف وأعد فتحه لتحديث القائمة.'
        : 'لم يؤكّد الخادم الاستعادة. تحقق من حالة الكتاب قبل تكرار المحاولة.');
      setRestorePending(false);
      return;
    }
    if (!mounted.current || getBearerToken() !== token) return;

    // This row is confirmed active by the server's versioned response.
    setRows((prev) => prev.filter((row) => row.id !== item.id));
    setConfirm(null);
    setNotice('تمت استعادة الكتاب رسميًا في الخادم.');
    try {
      await onRestored(restored);
    } catch {
      if (mounted.current && getBearerToken() === token) {
        setError('تمت الاستعادة، لكن تعذّر تحديث قائمة الكتب النشطة. أعد تسجيل الدخول لإعادة المزامنة.');
      }
    } finally {
      if (mounted.current && getBearerToken() === token) setRestorePending(false);
    }
  }

  return (
    <section dir="rtl" aria-label="أرشيف الكتب الرسمية" className="rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">أرشيف الكتب الرسمية</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">عرض إداري من الخادم فقط. الاستعادة لا تنشئ كتابًا جديدًا.</p>
        </div>
        <button type="button" onClick={onClose} disabled={restorePending}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">عودة إلى الكتب النشطة</button>
      </header>

      {notice && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 text-rose-900 p-3 text-sm">{error}</p>}
      {loading && rows.length === 0 && <p role="status" className="text-sm text-stone-500">جارٍ جلب السجلات المؤرشفة من الخادم…</p>}
      {!loading && !error && rows.length === 0 &&
        <p className="text-sm text-stone-500">لا توجد كتب مؤرشفة في الصفحة الحالية.</p>}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((item) => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3 dark:border-stone-700">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{item.subject}</p>
                <p className="text-xs text-stone-500 mt-1">العدد: {item.number} | القيد: {item.sequence} | تاريخ الكتاب: {item.date}</p>
                <p className="text-xs text-stone-500 mt-1">تاريخ الأرشفة: {item.deletedAt}</p>
                {item.deleteReason && <p className="text-xs text-stone-600 mt-1">سبب الأرشفة: {item.deleteReason}</p>}
              </div>
              <button type="button" disabled={restorePending || loading} onClick={() => {setConfirm(item); setError(null);}}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-white text-xs font-bold disabled:opacity-50">
                استعادة
              </button>
            </article>
          ))}
        </div>
      )}

      {hasMore && <button type="button" disabled={loading || restorePending} onClick={() => void loadMore()}
        className="rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-50">
        {loading ? 'جارٍ التحميل…' : 'عرض المزيد من الكتب المؤرشفة'}
      </button>}

      {confirm && (
        <div className="border-2 border-emerald-300 dark:border-emerald-700 rounded-xl p-4 space-y-3" role="group" aria-label="تأكيد استعادة الكتاب">
          <p className="text-sm font-bold">هل تريد استعادة الكتاب رقم {confirm.number} إلى القائمة النشطة؟</p>
          <p className="text-xs text-stone-600 dark:text-stone-300">لن يُنشأ كتاب جديد؛ يحتفظ السجل بهويته الأصلية.</p>
          <div className="flex gap-2">
            <button type="button" disabled={restorePending} onClick={() => void restoreConfirmed()}
              className="bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50">
              {restorePending ? 'جارٍ تأكيد الاستعادة…' : 'تأكيد الاستعادة'}
            </button>
            <button type="button" disabled={restorePending} onClick={() => setConfirm(null)}
              className="border px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50">إلغاء</button>
          </div>
        </div>
      )}
    </section>
  );
};
