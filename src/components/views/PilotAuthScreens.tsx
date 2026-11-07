import React, { useState } from 'react';
import { ApiError } from '../../api/apiError';

function friendlyAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403 || error.status === 400) {
      return 'تعذّر تسجيل الدخول. تأكد من البيانات وصلاحية الحساب.';
    }
    if (error.status === 0 || error.status === 408) return 'تعذّر الاتصال بخادم السقاية. تحقق من الشبكة وحاول مجددًا.';
  }
  return 'تعذّر التحقق من الحساب. لم تُفتح أي بيانات.';
}

const fieldClass = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white';
const actionClass = 'w-full rounded-lg bg-stone-900 px-4 py-2.5 font-bold text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-amber-400 dark:text-stone-950';

export const PilotLoginScreen: React.FC<{
  onLogin: (identifier: string, secret: string) => Promise<void>;
}> = ({onLogin}) => {
  const [identifier,setIdentifier] = useState('');
  const [secret,setSecret] = useState('');
  const [submitting,setSubmitting] = useState(false);
  const [error,setError] = useState<string | null>(null);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(identifier,secret);
      setSecret('');
    } catch(reason) {
      setError(friendlyAuthError(reason));
      setSecret('');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f6] px-4 py-10 text-stone-900 dark:bg-stone-950 dark:text-stone-100 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h1 className="mb-2 text-xl font-bold">السقاية — تسجيل الدخول</h1>
        <p className="mb-5 text-sm leading-6 text-stone-600 dark:text-stone-300">ادخل رقم الباج أو رقم الهاتف والرمز السري المرتبط بحسابك. لا يمكن فتح البيانات دون التحقق من الخادم.</p>
        <form onSubmit={e => void submit(e)} className="space-y-4">
          <label className="block text-sm font-semibold">رقم الباج أو الهاتف
            <input className={fieldClass+' mt-1'} value={identifier} onChange={e=>setIdentifier(e.target.value)}
              autoComplete="username" required maxLength={128} disabled={submitting} />
          </label>
          <label className="block text-sm font-semibold">الرمز السري
            <input className={fieldClass+' mt-1'} type="password" value={secret} onChange={e=>setSecret(e.target.value)}
              autoComplete="current-password" required minLength={8} maxLength={128} disabled={submitting}/>
          </label>
          {error !== null && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
          <button className={actionClass} disabled={submitting} type="submit">{submitting?'جارٍ التحقق…':'دخول'}</button>
        </form>
      </section>
    </main>
  );
};

export const PilotChangeSecretScreen: React.FC<{
  onChangeSecret:(currentSecret:string,newSecret:string)=>Promise<void>;
}> = ({onChangeSecret}) => {
  const [current,setCurrent] = useState('');
  const [next,setNext] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy) return;
    setBusy(true);setError(null);
    try {
      await onChangeSecret(current,next);
      setCurrent('');setNext('');
    } catch(reason) {
      setError(friendlyAuthError(reason));
      setCurrent('');setNext('');
    } finally {setBusy(false);}
  }
  return (
    <main dir="rtl" className="min-h-screen bg-[#faf9f6] px-4 py-10 text-stone-900 dark:bg-stone-950 dark:text-stone-100 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-6 shadow-sm dark:border-amber-700 dark:bg-stone-900">
        <h1 className="mb-3 text-xl font-bold">تغيير الرمز السري مطلوب</h1>
        <p className="mb-4 text-sm leading-6">لا يمكن عرض بيانات السقاية قبل تغيير الرمز المؤقت. بعد التغيير سجّل الدخول مجددًا.</p>
        <form onSubmit={e=>void submit(e)} className="space-y-4">
          <label className="block text-sm">الرمز الحالي
            <input type="password" className={fieldClass+' mt-1'} value={current} onChange={e=>setCurrent(e.target.value)}
              required minLength={8} maxLength={128} autoComplete="current-password" disabled={busy} />
          </label>
          <label className="block text-sm">الرمز الجديد
            <input type="password" className={fieldClass+' mt-1'} value={next} onChange={e=>setNext(e.target.value)}
              required minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} />
          </label>
          {error!==null && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className={actionClass} disabled={busy} type="submit">{busy?'جارٍ التغيير…':'حفظ الرمز وتسجيل الدخول مجددًا'}</button>
        </form>
      </section>
    </main>
  );
};
