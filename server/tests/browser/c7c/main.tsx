/** C7c only: test harness never imported by the production React application.
 * Disposable session/account switch UI is deliberately NOT an auth mechanism.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportsCandidateView } from '../../../../src/components/views/ReportsCandidateView';
import { setBearerToken } from '../../../../src/api/sessionToken';
import type { CandidateReportRole } from '../../../../src/api/reportCandidate';

type FixtureAccount = { role:CandidateReportRole; accountId:string };
const ACCOUNTS: Readonly<Record<string,FixtureAccount>> = {
  'employee-a':{role:'employee',accountId:'employee-a'},
  'employee-b':{role:'employee',accountId:'employee-b'},
  admin:{role:'admin',accountId:'admin'},
  director:{role:'director',accountId:'director'},
};
const token=(key:string)=>'C7C_SYNTHETIC_'+key;
setBearerToken(token('employee-a'));

function Harness(){
  const [account,setAccount]=useState<FixtureAccount|null>(ACCOUNTS['employee-a']);
  const change=(key:string)=>{
    setBearerToken(token(key));
    setAccount(ACCOUNTS[key]);
  };
  const logout=()=>{
    setBearerToken(null);
    setAccount(null);
  };
  return <main dir="rtl" style={{maxWidth:1150,margin:'1.5rem auto',padding:'1rem',fontFamily:'sans-serif'}}>
    <h1>السقاية — اختبار Chromium الاصطناعي C7c</h1>
    <p>هذه صفحة اختبار غير مثبتة في التطبيق الرسمي؛ لا تحتوي على بيانات مؤسسية.</p>
    <nav aria-label="تبديل حسابات الاختبار" style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
      <button id="c7c-employee-a" onClick={()=>change('employee-a')}>اختبار المنتسب أ</button>
      <button id="c7c-employee-b" onClick={()=>change('employee-b')}>اختبار المنتسب ب</button>
      <button id="c7c-admin" onClick={()=>change('admin')}>اختبار المسؤول</button>
      <button id="c7c-director" onClick={()=>change('director')}>اختبار المدير</button>
      <button id="c7c-logout" onClick={logout}>خروج تجريبي</button>
    </nav>
    {account
      ? <section>
          <p data-testid="c7c-identity">حساب اصطناعي: {account.role} / {account.accountId}</p>
          <ReportsCandidateView
            role={account.role} sessionKey={account.accountId} pdfApproved={false}/>
        </section>
      : <p data-testid="c7c-logged-out">تم تسجيل الخروج من حساب الاختبار.</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
