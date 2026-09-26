# السقاية — نظام إدارة الذاتية والأرشفة والتوثيق الإداري

نظام إداري وأرشيفي رقمي داخلي لشعبة الذاتية، يهدف إلى تنظيم الكتب والوثائق وبيانات المنتسبين والباحثين والسجلات الزمنية والطلبات والمتابعة والتقارير، مع صلاحيات ونطاق وصول وسجلات تدقيق واطلاع.

## الحالة الحالية

تم تنفيذ واختبار:

- Phase 0 — Baseline.
- Phase 1 — Domain Models.
- Phase 2 — Personnel Domain & Services.
- Phase 3 — Employee Profile.
- Phase 4 — Transaction Domain.
- Phase 5 — Transaction–Employee Relations.
- Phase 6 — Daily Situation.
- Phase 7 — Timeline.
- Phase 8 — Backend Foundation.
- Phase 9 — PostgreSQL + Migrations + Persistence Foundation.
- Phase 10 — API Data Layer.

**المرحلة التالية:** Phase 11 — Authentication / الحسابات / الجلسات.

## المرجع الرئيسي

`ALSQAYA_PLAN.md`

هذه الوثيقة تحتوي على الخطة التفصيلية، قواعد الأعمال، النطاق المحدد لكل مرحلة، الاختبارات، ومعايير الإغلاق.

الوثائق المساندة:

- `Architecture.md` — المعمارية.
- `PROJECT_RULES.md` — قواعد التطوير.
- `PROJECT_VISION.md` — الرؤية.
- `docs/` — تقارير ووثائق تاريخية أو مساندة.

## المعمارية المستهدفة

```text
React Client
   ↓
REST API
   ↓
Node.js + Express + TypeScript
   ↓
PostgreSQL + Central File Storage
```

ويضاف إليها Authentication وRBAC وAccess Scope وAudit/View Logs وBackground Jobs وBackup/Restore وMonitoring.

## الوضع الحالي

منذ **Phase 10** صارت الواجهة تقرأ وتكتب عبر **REST API** إلى PostgreSQL بدل `localStorage`.
يبقى `localStorage` للوضع الليلي فقط، وكـ`Local Adapter` اختياري للتطوير بلا خادم
(`VITE_DATA_SOURCE=local`).

## منهج التنفيذ

كل مرحلة تُنفذ منفصلة، ثم تُختبر وتُراجع وتُثبت في Git قبل الانتقال إلى المرحلة التالية.

Cline لا يجوز له اختراع قاعدة عمل أو تنفيذ مرحلة مستقبلية، ويجب عليه اعتبار `TBD` قرارًا غير محسوم وليس إذنًا للاجتهاد.

## التشغيل المحلي الحالي

### الواجهة والـBackend

```bash
npm install
npm run db:dev        # PostgreSQL مدمج محلياً (منفذ 5433)
npm run db:migrate    # تطبيق الترحيلات
npm run server:dev    # الـBackend (منفذ 4000)
npm run dev           # الواجهة (منفذ 3000)
```

> العنقود يجب أن يكون بترميز **UTF8**. لو نُشئ بلغة النظام (WIN1256 على جهاز عربي)
> سيرفض حفظ الأرقام العربية الهندية في أرقام الكتب.

### الفحص والاختبار

```bash
npm run lint          # TypeScript
npm run build
npm run test:server   # اختبارات الـBackend العامة
npm run test:db       # اختبارات المستودعات على قاعدة مدمجة
npm run test:api      # اختبارات طبقة الـAPI (خادم + واجهة)
npm run test:all      # الثلاث معاً
```

استخدم بيانات اختبار فقط أثناء التطوير. لا تدخل بيانات العمل الحقيقية قبل اكتمال متطلبات المصادقة والصلاحيات والتدقيق والنسخ الاحتياطي والترحيل وفق الخطة.
