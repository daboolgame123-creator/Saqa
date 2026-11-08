/** C13 TEST-ONLY React fixture. Real login and /auth/me provide role and identity.
 * Never import this file in production UI or expose the fixture beyond loopback.
 */
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReportsCandidateView} from '../../../../src/components/views/ReportsCandidateView';
import {setBearerToken} from '../../../../src/api/sessionToken';
import type {CandidateReportRole} from '../../../../src/api/reportCandidate';

const TEST_SECRET='C13-SYNTHETIC-SECRET-ONLY';
const identities={
  'employee-a':'C13-EMP-A', 'employee-b':'C13-EMP-B', admin:'C13-ADMIN',
} as const;
type Identity={role:CandidateReportRole; userId:string; username:string};
function Harness(){
  const [account,setAccount]=useState<Identity|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const choose=async(key:keyof typeof identities)=>{
    setBearerToken(null);
    setAccount(null);
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/auth/login',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({identifier:identities[key],secret:TEST_SECRET}),
      });
      if(!response.ok)throw new Error('Synthetic login rejected');
      const body=await response.json() as {sessionToken:string};
      if(typeof body.sessionToken!=='string')throw new Error('Missing session');
      const me=await fetch('/api/auth/me',{
        headers:{authorization:'Bearer '+body.sessionToken},
      });
      if(!me.ok)throw new Error('Identity request rejected');
      const identity=await me.json() as Identity;
      if(!['admin','director','employee'].includes(identity.role)||
          !identity.userId || identity.username!==identities[key]){
        throw new Error('Unverified account/role');
      }
      setBearerToken(body.sessionToken);
      setAccount(identity);
    }catch{
      setBearerToken(null);
      setError('تعذر الدخول إلى حساب الاختبار');
    }finally{setBusy(false);}
  };
  const logout=()=>{
    setBearerToken(null);
    setAccount(null);
    setError('');
  };
  return <main dir="rtl" style={{maxWidth:1150,margin:'1.5rem auto',padding:'1rem',fontFamily:'sans-serif'}}>
    <h1>السقاية — اختبار قبول C13 على قاعدة بيانات وجلسات حقيقية اصطناعية</h1>
    <p>صفحة اختبار معزولة فقط، ليست جزءًا من واجهة النظام الرسمية.</p>
    <nav aria-label="حسابات الاختبار" style={{display:'flex',gap:12,marginBottom:20}}>
      <button id="c13-employee-a" disabled={busy} onClick={()=>void choose('employee-a')}>منتسب أ</button>
      <button id="c13-employee-b" disabled={busy} onClick={()=>void choose('employee-b')}>منتسب ب</button>
      <button id="c13-admin" disabled={busy} onClick={()=>void choose('admin')}>المسؤول</button>
      <button id="c13-logout" disabled={busy} onClick={logout}>خروج</button>
    </nav>
    {error && <p role="alert">{error}</p>}
    {account
      ? <section><p data-testid="c13-identity">جلسة مؤكدة: {account.role} / {account.username}</p>
          <ReportsCandidateView role={account.role} sessionKey={account.userId} pdfApproved={false}/>
        </section>
      : <p data-testid="c13-no-session">لا توجد جلسة نشطة</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
