# Phase 13-A — فحص Access Scope والإتاحة

**التاريخ:** 2026-11-23؛ **الخطوة:** `13-A / INSPECTION ONLY`.
**الأساس:** [Phase 12-B PR #76](https://github.com/daboolgame123-creator/Saqa/pull/76) عند SHA `1152bc9275c19224e9cc0c2fb6039f4b3ce74112`، [Cumulative CI #45077628660](https://github.com/daboolgame123-creator/Saqa/actions/runs/45077628660) = 957 PASS / 0 FAIL / 1 SKIP.
**المرجع:** `ALSQAYA_PLAN.md` §9، §10، §12، §29؛ بروتوكول `PHASE_AUDIT_TWO_STEP_PROTOCOL.md`.
**الحالة:** `PHASE13_A_INSPECTED / 13_B_TARGETED_ACCEPTANCE_REQUIRED / NO_MERGE`.

## بنية النطاق

- `authorization/accessScope.ts`: أربعة نطاقات، افتراضي `Administrative`، المنتسب يرى `PublicToEmployees` أو `SpecificEmployees` بإتاحة سارية لرقمه الوظيفي المرتبط؛ `is_daily_situation` مرفوض للمنتسب ولو المخزون يصفه عامًا.
- `repositories/transactionScopeSql.ts`: قيد المعاملة داخل SQL؛ لا يُكتفى بتصفية React. الإتاحة شرط `revoked_at IS NULL` مع `visibility=SpecificEmployees`، و`visibility` غير معروف يعيد لا صفوف.
- `api/routes/index.ts`: `requireSession → requireChangedSecret → requireResourcePermission → attachAccessScope`، قبل كل راوترات الموارد.
- `transactionController` و`transactionRepository`: قوائم الكتب، GET by ID، cursor، والكتب المؤرشفة تحمل قيد النطاق.
- `attachmentController` و`attachmentService`: فحص رؤية **الكتاب** قبل استعلام metadata أو قراءة البايتات من القرص، وفرض `Cache-Control:no-store` و404 للمحجوب.
- `transactionEmployeeRepository`: JOIN على الكتب مع نفس شرط النطاق، لمنع تسرّب الروابط.
- `timelineService` و`searchRepository`: تصفية معاملات ضمن النطاق؛ البحث عن منتسبين/سجلات شخصية يحمل `PersonnelReadScope` مستقلًا.
- `availabilityService` و`availabilityRepository`: منح وسحب إتاحة فقط للمسؤول، تسجيل السحب دون حذف تاريخ المنح.
- التغطية الحالية: `server/tests/accessScope.test.ts`، `api/availability.test.ts`، `api/attachments.test.ts`، `api/notifications.test.ts`، `api/search.test.ts` و`api/timeline.test.ts` (حيث تتوفر). تشمل 404 للكتب المحجوبة والتفريق بين رابط الكتاب والإتاحة ومنع قراءة ملفات كتاب إداري.

## فرز المخاطر ومسؤولية الخطوة التالية

| ID | ما تحقق | مستوى الدليل | التنفيذ |
|---|---|---|---|
| P13-01 | اختبار إتاحة `SpecificEmployees` يثبت ظهور الكتاب ثم اختفاءه بعد السحب؛ واختبار مرفق `Administrative` يثبت 404. **لا اختبار مركب للملف المرفق في كتاب SpecificEmployees قبل المنح وبعد السحب على نفس Bearer**. | `TEST_GAP / SUSPECTED` لا استغلال مثبت | **CHAT 13-B**: HTTP + PostgreSQL + ملف PDF اصطناعي؛ 404 قبل المنح، 200 للبايتات بعد المنح، 404 للـcontent والـlist والـintegrity بعد السحب، دون فقد البايتات أو نشر وجود الملف. |
| P13-02 | تصفية روابط الكتب والخط الزمني والبحث داخل SQL، ومنع الاطلاع على الوثيقة غير المتاحة، ظاهرة في الكود والاختبارات السابقة. | `VERIFIED_BY_STRUCTURE_AND_EXISTING_TESTS` | لا عمل إضافي بلا دليل جديد. |
| P13-03 | منح إتاحة لكتاب `Administrative` لا يجعل المنتسب يرى الكتاب لأنه لا يحمل `SpecificEmployees`. | `EXPECTED_POLICY` | لا توسيع إتاحة/خفض سرية بلا قرار من OWNER. |
| P13-04 | نطاق الكتب يختلف عن نطاق الملف الشخصي `PersonnelReadScope`؛ المنتسب يرى بياناته لا سجل منتسب آخر عبر `/api/employees` والبحث. | `EXISTING_SCOPE_PRESENT` | يحتفظ فصل النطاقين؛ لا تغيير في RBAC. |
| P13-05 | النطاق في عقود المستودعات قد يكون وسيطًا اختياريًا لأن الخدمات الإدارية تستخدمها أيضًا، لكن جميع مسارات HTTP العامة تُركّبه قبل الوصول. | `LOW_WATCHLIST` | لا إعادة تصميم داخل 13-B. |

## 13-B — معايير القبول

1. إضافة **اختبار واحد مركب فقط** إلى `server/tests/api/attachments.test.ts` مع بيانات اختبار معزولة، دون تغيير سلوك الكود ما لم يكشف الاختبار فشلًا مثبتًا.
2. تأكيد أخطاء 404 قبل/بعد السحب، و200 مع بايتات كاملة بعد المنح، وبقاء السجل الإداري والأرشيف بعد السحب.
3. بعده `npm ci` و`npm run lint` و`npm run build` و`npm run test:all`، والتجميع التجريبي لفروع المراحل 1–12 مع المرشح 13-B على Runner لا يكتب إلى الفرع الرسمي.
4. `CHAT` مسؤول؛ لا حاجة إلى OpenCode ضمن هذه المهمة. المراجعة الأمنية المستقلة لمرحلة Auth `OC-11-SEC` تبقى `WAITING_EXTERNAL/NOT_ASSIGNED` ولا تعطي موافقة نشر.

**قاعدة الإغلاق:** لا يُغلق التدقيق البرمجي للمرحلة 13 إلا على آخر SHA وCI مجمعة ناجحة؛ لا دمج أو ترحيل/اختبار على `alsqaya_staging` أو بيانات حقيقية.
