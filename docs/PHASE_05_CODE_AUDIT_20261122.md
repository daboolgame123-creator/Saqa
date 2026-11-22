# مراجعة Phase 5 — علاقات المعاملات بالمنتسبين (Transaction–Employee)

**التاريخ:** 22 نوفمبر 2026  
**الخطة:** `ALSQAYA_PLAN.md` §23، Phase 5 — M:N و`TransactionEmployee`  
**الفرع:** `audit/phase5-transaction-employee-20261122`  
**PR:** [#64](https://github.com/daboolgame123-creator/Saqa/pull/64) — Draft / NO MERGE  
**الحالة:** `PHASE5_FIX_CANDIDATE / FINAL_CI_PENDING / HOST_ACCEPTANCE_PENDING`

## ما فُحص
- نموذج `TransactionEmployee`: مفاتيح `transactionId` و`employeeId` وأدوار `subject/recipient/assigned/beneficiary`.
- خدمة المتصفح المحلية، المزامنة، مرآة `employeeIds`، وإعادة بناء الروابط من سجل الاسم الموروث.
- الجدول `transaction_employees` وقيود FK وUNIQUE والترحيل الخاص بروابط `NULL` (Phase1 PR #60).
- صلاحيات GET/POST/PATCH/DELETE ومسار `transaction-employees`، والاستعلام SQL المقيّد برؤية الكتب.
- الأرشفة الناعمة والاستعادة، واستمرارية روابط الكتاب التاريخية، وعدم حذف أي موظف أو كتاب عند حذف سطر العلاقة.
- التوافق مع مراجعات Phase 1–4 وإصدارات المكتبات المقفلة.

## العيوب المثبتة والتصحيح
| العيب | أثره | التصحيح |
|---|---|---|
| تحويل الاسم القديم كان يستعمل `isEmployeeMatch` الذي يطابق كلمات جزئية | ربط منتسب غير مقصود | **مطابقة الاسم الكامل المطبّع والفريد فقط**. تم التنسيق مع نفس إصلاح Phase1، ولا اعتماد على الاسم في API الرسمي |
| `seedFromTransactions` يزيل رابطاً مشروعاً إذا كان نفس الموظف في الكتاب بدورين | ضياع رابط تاريخي مستقل | التمييز حسب ثلاثية `[transactionId, employeeId, relationshipType]`، وحذف تكرار الدور نفسه فقط |
| `seedFromTransactions` يعيد ربط موظف حُذف من علاقات الكتاب إذا كانت مرآة `employeeIds` قديمة | عودة رابط غير صحيح بعد الإزالة | العلاقات الموجودة مصدر الحقيقة، والمرآة تستخدم للكتب التي **لم تمتلك أي رابط** بعد |
| مرآة `employeeIdsForTransaction` تكرر الموظف بسبب الأدوار المتعددة | عدد/عرض غير متسق | إرجاع معرّفات الموظفين المتميزة دون خسارة أدوار العلاقات نفسها |
| `POST/PATCH/DELETE /api/transaction-employees` كان يسمح بتعديل روابط كتاب مؤرشف إذا عُرف UUID | العبث بسجل الارتباطات التاريخي رغم أن القراءة تخفيها | قيود SQL على `deleted_at IS NULL`، وقفل صف الكتاب `FOR UPDATE` قبل كتابة الرابط، و404 عند الكتاب الغائب أو المؤرشف؛ تُحفظ كل الروابط بعد الاستعادة |

**الخصوصية:** لا يخرج أي رابط خارج نطاق الكتاب في `listByTransaction` و`listByEmployee`؛ كل استعلام يتضمن JOIN مع `transactions` و`transactionScopeCondition`، فضلاً عن استبعاد المؤرشف. المسؤولية النهائية عن المصادقة والصلاحية في middleware الخادم.

## ضمانات الاختبار
- 8 اختبارات Domain: الاسم الكامل مقابل الاسم الجزئي، التشابه/التكرار، الأدوار المتعددة، عدم بعث روابط المرآة القديمة، المزامنة، وidempotence.
- API على PostgreSQL اصطناعي: حظر إضافة/تعديل/حذف رابط كتاب مؤرشف، ثبات صف الرابط، استعادة الكتاب والروابط، وتعدد أدوار المنتسب.
- تشغيل `npm run lint` و`npm run build`، ثم اختبارات الخادم وPostgreSQL وAPI بالكامل.
- تشغيل الدمج **التجريبي غير المنشور فقط** للمراحل 1–5 بمراجع SHA مثبتة وملف المكتبات الأمني من Phase2.
- فحص `npm audit --omit=dev --audit-level=high` على النسخة المجمّعة؛ أحدث Vite/React مع TypeScript 5.8 في بيئة مؤقتة.

[مراجعة نتائج GitHub Actions](https://github.com/daboolgame123-creator/Saqa/actions/workflows/phase5-transaction-employee.yml)

## بوابة الإغلاق
لا تُعدّ Phase5 مغلقة برمجياً حتى تؤكد جميع وظائف CI نجاحها **على آخر التزام واحد**. لا Commit/Push/Merge إلى الفرع الرسمي ولا وصول إلى `alsqaya_staging` أو ملفات UI-04/A2.3 المحلية. التوافق مع TypeScript 7 وتنبيهات الاعتماديات المتوسطة يجري تتبعهما على مستوى المشروع؛ لا تغييرات إجبارية تكسر مشروع السقاية.
