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

**المرحلة التالية:** Phase 8 — Backend Foundation.

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

النسخة الموجودة حاليًا Prototype تعتمد التخزين المحلي للاختبار. هذا ليس التخزين النهائي للنظام.

## منهج التنفيذ

كل مرحلة تُنفذ منفصلة، ثم تُختبر وتُراجع وتُثبت في Git قبل الانتقال إلى المرحلة التالية.

Cline لا يجوز له اختراع قاعدة عمل أو تنفيذ مرحلة مستقبلية، ويجب عليه اعتبار `TBD` قرارًا غير محسوم وليس إذنًا للاجتهاد.

## التشغيل المحلي الحالي

```bash
npm install
npm run dev
npm run lint
npm run build
```

استخدم بيانات اختبار فقط أثناء التطوير. لا تدخل بيانات العمل الحقيقية قبل اكتمال متطلبات التخزين المركزي والمصادقة والصلاحيات والتدقيق والنسخ الاحتياطي والترحيل وفق الخطة.
