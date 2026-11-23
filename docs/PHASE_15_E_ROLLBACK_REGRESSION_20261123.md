# Phase 15-E — تدقيق إضافي لتراجع المجال عند فشل Audit

**التاريخ:** 2026-11-23  
**المرشح:** [Draft PR #85](https://github.com/daboolgame123-creator/Saqa/pull/85)  
**HEAD المراجع والمختبر:** `6884e9434a667a9034c2d6a656c37ecd749ddd3c` (أساسه [PR #84](https://github.com/daboolgame123-creator/Saqa/pull/84))  
**حالة المراجعة:** `PHASE15_E_TEST_PASS / OPEN_INDEPENDENT_REVIEW / NO_MERGE / RELEASE_NO_GO`.

## 1. نطاق العمل

راجع CHAT تنفيذ `ApiServices.auditedMutation` ومسار استخدامه في الكتاب والإتاحة وطلب workflow. المسار يشغّل domain mutation وAudit INSERT عبر PostgreSQL Client واحد و`withTransaction`، ويتجنب فتح معاملة داخل معاملة عند استقبال Client قائم، كما أن إشعارات المجال تبقى بعد COMMIT.

لم يغيّر 15-E أي كود إنتاج، ولم يُعدّل `auth` ولا صلاحيات `RBAC`، ولا فتح `reports` المحجوبة. أضيف اختبارا Failure Injection جديدان إلى `server/tests/api/phase15AuditAtomicityDiagnostic.test.ts` ضمن قاعدة PostgreSQL اصطناعية وHTTP محلي:

1. **أرشفة الكتاب ثم استعادته**: تعطيل INSERT للحدثين `archive` و`update/action=restore`، والتحقق من رد 500، عدم تغير `deleted_at` أو `version`، وعدم إنشاء حدث نجاح وهمي. عند السماح بالسجل تُجرى أرشفة فعلية وتنجح، ثم يفشل restore المدقَّق ويرجع للأرشيف دون تغير.
2. **طلب workflow**: إنشاء طلب عام اصطناعي `draft`، وتعطيل INSERT لحدث `status_change`، ثم محاولة `submit`. النتيجة 500، مع بقاء `status='draft'` و`version=1`، وعدم إضافة صف `submit` إلى `request_status_history` أو `audit_logs`.

## 2. الأدلة

- [GitHub Actions #45128237572](https://github.com/daboolgame123-creator/Saqa/actions/runs/45128237572): **SUCCESS** على رأس PR #85.
- **Server:** 418 اختبار PASS، واحد SKIP.
- **PostgreSQL test:** 243 PASS.
- **API:** 303 PASS، تشمل الاختبارين الجديدين.
- الإجمالي دون العد المكرر: **964 PASS / 0 FAIL / 1 SKIP**.
- إعادة الاختبارات الأمنية الموجّهة أُجريت ونجحت، ولا تُجمع مرة ثانية مع الإجمالي.
- فحص TypeScript والبناء و`npm audit --omit=dev --audit-level=high`: PASS، **0 high/critical** و**2 moderate** (المعروفة مسبقاً).
- لا بيانات staging، ولا اختبار على ملفات المؤسسة، ولا تعديل إنتاجي في هذا PR. 

## 3. القرار والتوزيع

- **15-A/B/C/D/E:** فحص كود واختبارات معزولة ناجحة للمرشح الحالي؛ لكن هذا **ليس إغلاقًا أمنيًا نهائيًا للمرحلة 15**.
- **OpenCode — OC-15-ATOMIC-AUDIT:** المراجعة المعمارية المستقلة **NOT_ASSIGNED** لأن OpenCode غير متاح الآن. المطلوب تقييم التداخل/الإشعارات بعد COMMIT، مسارات الكتابة المتبقية، وإثبات غياب الثغرات، وليس إعادة كتابة الإصلاح من الصفر.
- **OpenCode — OC-11-SEC:** تدقيق المصادقة المستقل ما زال `NOT_ASSIGNED`.
- **OWNER/HOST:** أذونات مستخدم PostgreSQL التشغيلية، والاختبار المحلي UAT وWindows/LAN والملفات الحقيقية، والسياسات المعلّقة.
- **Phase16:** لا يبدأ audit جديد قبل الحسم المنهجي لمراجعة المرحلة 15 بحسب بوابة المشروع. الفروع المسودة غير مدمجة، ولم يمنح CI إذناً بالنشر.

## المراجع المباشرة

- [PR #81 — 15-A inspection](https://github.com/daboolgame123-creator/Saqa/pull/81)
- [PR #82 — 15-B proved non-atomicity](https://github.com/daboolgame123-creator/Saqa/pull/82)
- [PR #83 — 15-C initial atomic fix](https://github.com/daboolgame123-creator/Saqa/pull/83)
- [PR #84 — 15-D extended atomicity](https://github.com/daboolgame123-creator/Saqa/pull/84)
- [PR #85 — 15-E independent targeted regression](https://github.com/daboolgame123-creator/Saqa/pull/85)

**تسلسل الحالات:** `SCOPED_CODE_PASS → INDEPENDENT_SECURITY_REVIEW_PENDING → HOST_ACCEPTANCE_PENDING → RELEASE_NO_GO`.
