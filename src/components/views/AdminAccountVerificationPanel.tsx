/** In-person account administration for the verified server admin only.
 * Only React component state holds one-time secrets; never localStorage/log.
 * Backend enforces manage_accounts independently of these UI checks.
 */
import React,{useEffect,useState} from 'react';
import {getApiClient} from '../../api/apiClient';
import {getBearerToken} from '../../api/sessionToken';

type IssuedCode={code:string;expiresInMinutes:number};
type ResetResult={temporarySecret:string;account:{id:string}};
const HIDE_SECRET_MS=2*60*1000;

export const AdminAccountVerificationPanel:React.FC=()=>{
  const [badge,setBadge]=useState('');
  const [phone,setPhone]=useState('');
  const [resetBadge,setResetBadge]=useState('');
  const [activation,setActivation]=useState<IssuedCode|null>(null);
  const [temporarySecret,setTemporarySecret]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(activation===null && temporarySecret===null)return;
    const timeout=setTimeout(()=>{setActivation(null);setTemporarySecret(null);},HIDE_SECRET_MS);
    return ()=>clearTimeout(timeout);
  },[activation,temporarySecret]);

  const requestCode=async()=>{
    if(busy || !badge.trim() || !phone.trim())return;
    setActivation(null);setTemporarySecret(null);setError(null);setBusy(true);
    const token=getBearerToken();
    try{
      if(token===null)throw new Error('No authenticated session');
      const issued=await getApiClient().post<IssuedCode>('/auth/registration/admin-issue',{
        badgeNumber:badge.trim(),phone:phone.trim(),
      });
      if(getBearerToken()!==token || !/^[0-9]{6}$/.test(issued.code) ||
          issued.expiresInMinutes!==5)throw new Error('Invalid activation response');
      setActivation(issued);
    }catch{
      if(getBearerToken()===token)setError('تعذر إصدار رمز التفعيل. تحقق من السجل والصلاحية والمحاولات.');
    }finally{setBusy(false);}
  };
  const reset=async()=>{
    if(busy || !resetBadge.trim())return;
    setActivation(null);setTemporarySecret(null);setError(null);setBusy(true);
    const token=getBearerToken();
    try{
      if(token===null)throw new Error('No authenticated session');
      const result=await getApiClient().post<ResetResult>(
        '/auth/accounts/by-badge/reset',{badgeNumber:resetBadge.trim()},
      );
      if(getBearerToken()!==token || !result.temporarySecret ||
          !result.account?.id)throw new Error('Invalid reset response');
      setTemporarySecret(result.temporarySecret);
    }catch{
      if(getBearerToken()===token)setError('تعذرت إعادة الضبط. تحقق من هوية المنتسب وبيانات حسابه.');
    }finally{setBusy(false);}
  };

  return <section dir="rtl" aria-label="التحقق الحضوري وإدارة الحسابات"
    className="mb-5 rounded-xl border border-stone-300 bg-white p-4 text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
    <h2 className="text-lg font-bold">تفعيل حساب المنتسب واستعادته — مسؤول السقاية فقط</h2>
    <p className="mb-4 mt-1 text-sm">
      تحقق حضوريًا من هوية المنتسب وسجله الوظيفي قبل إصدار أي رمز أو إعادة ضبط.
      لا ترسل الرموز عبر مجموعات أو سجلات غير آمنة.
    </p>
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={event=>{event.preventDefault();void requestCode();}}
        className="space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
        <h3 className="font-semibold">تفعيل الحساب لأول مرة</h3>
        <label className="block text-sm">الرقم الوظيفي
          <input value={badge} onChange={event=>{setBadge(event.target.value);setActivation(null);}}
            autoComplete="off" required className="mt-1 w-full rounded border p-2 text-black"/>
        </label>
        <label className="block text-sm">الهاتف المسجّل
          <input value={phone} onChange={event=>{setPhone(event.target.value);setActivation(null);}}
            autoComplete="off" required className="mt-1 w-full rounded border p-2 text-black"/>
        </label>
        <button type="submit" disabled={busy} className="rounded bg-stone-800 px-4 py-2 text-white disabled:opacity-50">
          إصدار رمز مؤقت
        </button>
        {activation&&<p role="status" className="rounded border p-2 text-sm">
          رمز التفعيل (يُسلم حضوريًا): <strong className="font-mono text-lg">{activation.code}</strong>.
          صالح لخمس دقائق ولمرة واحدة. سيُخفى من هذه الشاشة تلقائيًا.
        </p>}
      </form>
      <form onSubmit={event=>{event.preventDefault();void reset();}}
        className="space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
        <h3 className="font-semibold">استعادة حساب موجود</h3>
        <label className="block text-sm">الرقم الوظيفي بعد التحقق الحضوري
          <input value={resetBadge} onChange={event=>{setResetBadge(event.target.value);setTemporarySecret(null);}}
            autoComplete="off" required className="mt-1 w-full rounded border p-2 text-black"/>
        </label>
        <button type="submit" disabled={busy} className="rounded bg-stone-800 px-4 py-2 text-white disabled:opacity-50">
          إعادة ضبط الحساب
        </button>
        {temporarySecret&&<p role="status" className="rounded border p-2 text-sm">
          الرمز المؤقت: <strong className="font-mono text-lg">{temporarySecret}</strong>.
          يُسلّم حضوريًا ويُلزم المنتسب بتغييره عند أول دخول.
        </p>}
      </form>
    </div>
    {error&&<p role="alert" className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>}
  </section>;
};
