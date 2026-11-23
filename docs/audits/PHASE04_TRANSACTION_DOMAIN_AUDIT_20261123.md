# تقرير فحص المرحلة الرابعة — Phase 04 / Transaction Domain

**تاريخ الفحص:** 23 نوفمبر 2026  
**الطريقة:** مراجعة شيفرة GitHub ونتائج CI المسجلة؛ لم يُشغّل اختبار جديد ولم تُمس قاعدة عمل أو ملفات التطبيق.  
**مرجع المرحلة:** [Draft PR #63](https://github.com/daboolgame123-creator/Saqa/pull/63)، SHA `ed93da612d7e6e471e47951d4894391370f0ba07`، مقارنةً بأساس `phase-10-api-data-layer`.  
**مرجع التكامل اللاحق للمقارنة:** [Draft PR #96](https://github.com/daboolgame123-creator/Saqa/pull/96) SHA `0f16837a437dc9a9d76de395f95ddb80de947129`؛ يحتوي تغييرات Phase15 على فرع مستقل ويُدمَج مع Phase4 داخل Actions فقط، وليس شجرة مصدر رسمية مدمجة.  
**الحكم:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. نطاق الفحص والبنية

التعريف الرسمي من `ALSQAYA_PLAN.md:903–907`: اتجاه الكتاب، حالته، بياناته الرسمية والتذكير.  
PR63 يغيّر سبعة ملفات: `server/src/api/validation/transactionMetadata.ts` (جديد)، `transactionValidators.ts`، `server/src/services/duplicateDetection.ts`، اختبارات `server/tests/api/transactions.test.ts` و`transactionPatchPayload.test.ts`، وتقرير التدقيق وWorkflow.

تتبعت كذلك عقد `src/core/models/transaction.ts` و`server/src/api/dto/transaction.ts` و`server/src/api/services/transactionService.ts` و`server/src/api/controllers/transactionController.ts` و`server/src/repositories/transactionRepository.ts` و`src/App.tsx` و`src/components/views/TransactionsList.tsx`، وقرأت مقاطع مقابلة من PR96 لاستبعاد المشكلات التي لها مرشح إصلاح لاحق.

## 2. النتائج السليمة المثبتة بالشيفرة والاختبارات السابقة

1. **اتجاه/حالة مستقلان:** `TransactionDirection` هو `صادر/وارد/داخلي`، و`TransactionStatus` هو `قيد المراجعة/مكتمل`، مفصولان في النموذج ومحققات الإدخال ومستودع PostgreSQL. لا يُستنتَج status من direction.
2. **التاريخ الرسمي:** `date` ↔ `document_date` يختلف عن `createdAt` و`importedAt`؛ `month` مشتق من التاريخ داخل المستودع ولا يقبل من API. تعديل التاريخ يعيد اشتقاق الشهر.
3. **التحقق من metadata:** `transactionMetadata.ts:18–92` يرفض كائن `reminder` أو `directorDirective` ناقصًا/مكسورًا أو بحقول غير معتمدة، ويطلب توقيت ISO ذي منطقة زمنية صريحة. `importedAt` مسموح عند الإنشاء فقط، ورفضه عند PATCH يحمي طابع الاستيراد من التعديل العادي.
4. **القفل التفاؤلي:** `expectedVersion` إلزامي في PATCH؛ `transactionRepository.ts:454–497` ينفّذ `UPDATE ... WHERE version = ... AND deleted_at IS NULL` ويزيد النسخة داخل الجملة نفسها. التعديل المجرد أو المتأخر لا ينبغي أن يكتب فوق الأحدث.
5. **كشف التشابه:** `duplicateDetection.ts:118–173` يقيد النتائج في PostgreSQL نفسه بـ`LIMIT 10` وبنطاق الرؤية، ولا يمنع إدخال الكتاب. اختبار 40 مرشحًا في `server/tests/api/transactions.test.ts:157–183` يؤكد استمرار الإنشاء.
6. **الأرشفة والروابط:** مسارات الأرشفة تمثل حذفًا منطقيًا لا `DELETE` فعليًا للصف؛ `employeeLinks` لا تستبدل في PATCH العام، والإتاحة والمرفقات لها عملياتها المصرّح بها.

### الدليل التنفيذي السابق

[GitHub Actions Phase4 #45058003663](https://github.com/daboolgame123-creator/Saqa/actions/runs/45058003663) على SHA المذكور: **ثلاث وظائف مكتملة وناجحة**:
- مرشح Phase4 المنفرد: **13 فحصًا مركزًا للـAPI + 8 روابط ملف + 376 اختبار خادم + 226 PostgreSQL + 273 API ناجحة؛ 0 فشل و1 متخطى**. لم نجمعها في عداد مستقل إذا تداخلت مع المجموعات الشاملة.
- تركيب **Phase1+2+3+4 مؤقت داخل runner**: **388 خادم + 230 PostgreSQL + 282 API = 900 نجاح، 0 فشل، 1 متخطى**؛ الترقية المقيدة إلى React/Vite أحدث مع TypeScript 5.8 نجحت.
- فحص `npm audit --omit=dev --audit-level=high` للتجميع ناجح، **لا يعني انعدام moderate أو صلاحية ترقية TypeScript 7**. لا يوجد اختبار Host جديد بهذا المرور.

## 3. ملاحظات مرحلة 4 — لا إصلاح الآن

### AUD-04-01 — تعديل الحالة عبر PATCH يعطي نوع Audit مختلفًا عن مسار انتقالها (P2 / تتبع عمليات)

**SOURCE_CONFIRMED / BUSINESS_AND_AUDIT_REVIEW_PENDING.**  
`server/src/api/validation/transactionValidators.ts:145–176` يبقي `status` ضمن PATCH العام، بينما `transactionController.ts:118–132` يسجله كحدث `update`؛ مسار `POST /:id/status` في `:146–155` يكتب `status_change` منفصلًا بقيمتي قبل/بعد. هذا **توافق مقصود** في Phase20 وPR63، لكنه يسمح بالانتقال الفعلي نفسه بنوعَي سجل مختلفَين. `src/App.tsx:614–629` يستخدم المسار المخصص في زر تغيير الحالة الرسمي، لكن ذلك لا يلغي قبول الخادم لتحديث status عبر PATCH.

**ليس بالضرورة عيبًا أمنيًا؛** يلزم تقرير صريح من المالك هل كل تغيير حالة يجب أن ينتج `status_change`، وكيف تحافظ الواجهات القديمة على التوافق، دون منع PATCH أو تغيير صلاحية قبل قرار. كذلك القراءة المسبقة للحالة العامة في PR63 `transactionController.ts:122` هي **نفس** مشكلة `AUD-15-04` السابقة (Audit قبل قديم تحت التزامن) فلا تُعالج مستقلة.

**اختبار مطلوب بعد المسح:** POST وPATCH لتغير الحالة، ومقارنة حقول Audit، وتنافس نسختين تحت PostgreSQL اصطناعي، وتجربة rollback إن فشل تسجيل التدقيق.

### AUD-04-02 — حالة القراءة العامة منفصلة تقنيًا عن «اطلعت» الرسمي (P3 / تعاقد تاريخي)

**SOURCE_CONFIRMED / POLICY_DECISION_PENDING.**  
`transactionValidators.ts:40–47,96–104` يقبل `isRead` و`readAt` في الإنشاء والتعديل الإداري، بينما الإقرار الرسمي يعتمد `view_logs` في Phase15 ويستدعي `POST /:id/acknowledge` فقط. هذا يسمح بتخزين علم قراءة إداري قد يختلف عن الإقرار المعتمد، **لكن لا يوجد دليل أن PATCH يُنشئ إقرار `view_logs` رسميًا**. `TransactionsList.tsx:792,1207,1253` يعزل عرض قراءة legacy عن API بـ`isServerMode`، ولذلك لا ندّعي تزوير إقرار أو تسريبًا مثبتًا.

**المطلوب:** تثبيت أن `isRead/readAt` للبيانات الموروثة فقط، وضمان عدم استعمالها في تقارير الإقرار أو عدادات «جديد» بعد الدمج، واختبارات استقلالها عن `view_logs` و`transaction_opened`. الإحالة إلى Phase15 دون فتح تحسين إضافي.

### AUD-04-03 — خطأ لاحق للحفظ قد يعيد فشلًا رغم إنشاء الكتاب على PR63 المنفرد (P2 / ذرّية استجابة؛ مرشح معالجة لاحق)

**SOURCE_CONFIRMED_ON_PR63 / FIX_CANDIDATE_IN_PR96 / NO_PRODUCTION_REPRODUCTION.**  
`transactionService.ts:125–149` يكتب السجل أولًا ثم ينفّذ `scanDuplicateTransactions`؛ `transactionController.ts:61–78` يُسجّل Audit ويرسل إشعارًا بعد الكتابة، **دون معاملة مشتركة في PR63**. إن فشل الاستعلام اللاحق أو Audit أو الإرسال، من الممكن رجوع HTTP 500 على كتاب موجود بالفعل، مما قد يدفع العميل لإعادة المحاولة وإنشاء نسخة ثانية. هذا تسلسل مستنتَج من الشيفرة، **ولم يُستحث فشل فعلي جديد**.

**الفرع المقارن:** `PR96 transactionController.ts:61–78` يستخدم `auditedMutation` لإحاطة الإنشاء وفحص التشابه وAudit بمعاملة واحدة، ويزيل إشعار الإنشاء. هذه معالجة مرشحة في الشجرة التراكمية وليست Merge رسميًا. المطلوب اختبار حقن فشل في فحص التشابه/سجل Audit ضمن الشجرة المدمجة النهائية والتأكد من rollback ونتيجة HTTP من غير كتاب يتيم أو إعادة إنشاء.

**إحالات:** `AUD-15-01` (تعطيل الإشعارات) و`AUD-15-06` (بوابة التكامل الرسمي)؛ لا تُفتح مهمة إصلاح ثانية لنفس الفجوة.

### AUD-04-04 — تذكير كبيانات محفوظة بعد قرار إلغاء الإشعارات (شرط اتساق قرار؛ ليس ثغرة مثبتة)

**POLICY_RECONCILIATION / NOT_A_RUNTIME_NOTIFICATION.**  
`src/core/models/transaction.ts:81–89,145–148` و`transactionValidators.ts:88–103` يسمحان ببيانات `reminder` اختيارية. القرار الأحدث في Phase15-N هو **إلغاء توليد الإشعارات ومسارات قراءتها**، وتظهر إزالة مرسل الإشعارات في PR95/96. وجود حقل التذكير التاريخي في نموذج المعاملة **لا يعني أن العامل المجدول ما زال يعمل أو أن إشعارًا يُنشأ**.

المطلوب خلال فحص Phase15/21: التأكد من عدم اتصال أي واجهة/مسار/عامل بالتذكيرات لتوليد إشعارات مستقبلًا، وتقرير ما إذا كان إبقاء البيانات التاريخية للقراءة مطلوبًا. لا نحذف جدولًا أو حقولًا أو سجلات عمل وفق قرار التدقيق فقط.

### AUD-04-05 — PATCH ببيانات مرفق فقط قد يوثّق تحديثًا غير فعّال (إحالة سابقة)

`transactionValidators.ts:145–159` يبقي `attachments` ضمن PATCH، لكن `transactionRepository.ts:454–478` قد لا ينفذ كتابة بيانات للحقول المستبعدة من `FIELD_COLUMNS`. هذا هو `AUD-15-02` الذي توجد له معالجة مرشحة في PR94. **لا تُنسخ الملاحظة كعيب جديد**؛ يُراجع الاختبار المتراكم لاختلاف نسخة الصف وAudit عند دمج المرحلة 15 مع الرابعة.

## 4. حكم الفحص والخطوة التالية

التفريق الإلزامي: **PR63 منفرد ناجح في CI، لكن نجاحه ليس قبول شجرة الإصدار المتكاملة**. الملاحظات الأساسية تتعلق بتسجيل الحالة/القراءة والذرّية مع مراحل 15/20/21، لا بفشل نموذج اتجاه الكتاب أو اشتقاق تاريخه. لا دليل حاليًا على كشف مباشر مثبت لكتاب محجوب ضمن نطاق هذه المراجعة.

**الحالة:** `PHASE04_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`. لا تعديل كود، ولا اختبارات جديدة، ولا دمج.  
**التالي:** Phase 05 — Transaction–Employee Relation على [Draft PR #64](https://github.com/daboolgame123-creator/Saqa/pull/64)، SHA `cbb1eae9de186862b0fd49fe6ac9477ad41c63ee`. فحص الأدوار وتعدد الروابط والقيود والأرشفة والتكامل، ثم تسجيل النتائج فقط.
