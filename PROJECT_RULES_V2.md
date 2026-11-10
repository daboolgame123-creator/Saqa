# PROJECT_RULES — قواعد مشروع السقاية

**حالة الوثيقة:** V2 — قواعد تشغيلية صارمة لوكلاء البرمجة (Cline وأي Agent مشابه).
**المرجع الوظيفي والتنفيذي:** `ALSQAYA_PLAN.md`.
**المرجع الخاص بالواجهة:** `ALSQAYA_UI_PLAN.md`.
**الغرض:** منع الانحراف عن الخطة، منع التخمين والهلوسة، حماية سلامة البيانات والأمن، وضمان أن التنفيذ يستخدم ممارسات حديثة ومستقرة وقابلة للاختبار.

> هذه الوثيقة لا تستبدل `ALSQAYA_PLAN.md` ولا تضيف Business Rules من نفسها. وظيفتها أن تحدد **كيف يجب على وكيل البرمجة أن يتصرف أثناء تنفيذ الخطة**.

---

# 1. هرمية السلطة بين الوثائق

الأولوية عند وجود تعارض:

1. `ALSQAYA_PLAN.md` — المرجع التنفيذي والوظيفي الرئيسي.
2. مواصفات/عقود المجال المنشأة ضمن المرحلة الحالية، بشرط عدم تعارضها مع الخطة.
3. `ALSQAYA_UI_PLAN.md` — المرجع الخاص بمتطلبات وتجربة الواجهة، بشرط عدم تعارضه مع الخطة.
4. `PROJECT_VISION.md`.
5. `PROJECT_RULES_V2.md` — قواعد سلوك Agent وضبط التنفيذ.
6. تقارير `PHASE_*_REPORT.md` — سجل تاريخي، وليست سلطة لتغيير المستقبل.
7. الوثائق القديمة والأرشيفية.

إذا تعارضت وثيقة قديمة مع الخطة، لا تعدل الخطة لتناسب الكود القديم. سجّل التعارض وعالجه فقط ضمن النطاق المسموح.

**مهم:** كون `PROJECT_RULES_V2.md` أدنى من `ALSQAYA_PLAN.md` لا يعني تجاهل هذه القواعد؛ بل يعني أن هذه الوثيقة لا يجوز أن تخالف Business Rules. هي ملزمة للـAgent في طريقة التنفيذ.

---

# 2. قاعدة البداية الإلزامية — افهم الحالة الفعلية أولًا

قبل أي تعديل:

1. اقرأ `PROJECT_RULES_V2.md`.
2. اقرأ `ALSQAYA_PLAN.md`.
3. اقرأ المرحلة المطلوبة كاملة، وليس مقتطفًا منها.
4. اقرأ المرحلة السابقة ذات الصلة.
5. اقرأ المرحلة التالية مباشرة إذا كانت قراراتها تؤثر على تصميم المرحلة الحالية.
6. اقرأ `ALSQAYA_UI_PLAN.md` إذا كان التغيير له أثر على UI أو UX أو عقود الواجهة.
7. افحص `git status`.
8. افحص branch وHEAD وآخر commits.
9. افحص الملفات الفعلية المتأثرة.
10. افحص `package.json` وlockfile وأي configuration ذات صلة قبل إضافة dependency أو تغيير tooling.
11. افحص الاختبارات الحالية ذات الصلة.

**لا تعتمد على جدول "المرحلة الحالية" داخل وثيقة قديمة إذا كان Git أو تقارير المراحل يثبتان حالة مختلفة.**

إذا كانت الخطة تقول إن Phase 20 آخر مرحلة بينما المستودع يحتوي تنفيذ Phase 21 موثقًا، لا تفترض أيهما صحيح. تحقق من Git والـreports والـdiff وسجّل التناقض قبل تنفيذ عمل جديد.

---

# 3. قاعدة عدم الاختراع وعدم الهلوسة

الوكيل ممنوع من اختراع:

- Business Rules.
- حقول Domain جديدة.
- حالات جديدة.
- صلاحيات جديدة.
- Roles جديدة.
- Access Scopes جديدة.
- علاقات Domain جديدة.
- مصادر بيانات غير موثقة.
- صيغ ملفات غير مثبتة.
- أسماء أعمدة أو معاني أعمدة غير مثبتة.
- سلوك UI يؤثر في البيانات أو الصلاحيات.
- سياسات حذف أو أرشفة.
- سياسات matching أو duplicate detection.
- سياسات OCR.
- سياسات Backup/Restore.
- vendor أو protocol أو database schema لجهاز خارجي غير معروف.

`TBD ≠ permission to guess`

إذا كان القرار غير محسوم:

**توقف → حدّد السؤال/الغموض → اذكر الخيارات والتأثيرات → لا تنفذ قرارًا تجاريًا من عندك.**

---

# 4. Evidence Before Implementation

لا تعتمد على ذاكرة النموذج عندما تكون المعلومة مؤثرة في التنفيذ.

يجب التحقق من:

- سلوك library/API الحالي.
- حالة dependency.
- deprecation.
- compatibility.
- framework behavior.
- file format behavior.
- database behavior.
- security behavior.

مصادر الأولوية:

1. كود المشروع الحالي.
2. وثائق المشروع.
3. الوثائق الرسمية الحالية للتقنية/المكتبة.
4. اختبارات قابلة للتنفيذ.
5. مصدر خارجي موثوق عند الحاجة.

لا تحول تخمينًا إلى حقيقة لمجرد أنه "يبدو منطقيًا".

---

# 5. قاعدة التقنية الحديثة والمكتبات

المطلوب ليس "أحدث إصدار بأي ثمن".

المعيار هو:

**Latest stable + supported + non-deprecated + compatible + tested**

عند استخدام أو إضافة dependency:

1. افحص ما هو مثبت حاليًا.
2. افحص هل dependency موجودة أصلًا وتفي بالغرض.
3. تحقق من أن المكتبة maintained ومدعومة.
4. تحقق من أنها ليست deprecated.
5. تحقق من compatibility مع Node/TypeScript/React/Vite/Express/PostgreSQL وغيرها المستخدمة فعليًا.
6. استخدم أحدث إصدار مستقر مناسب لقيود المشروع، لا أحدث إصدار لمجرد أنه أحدث.
7. لا ترقّي dependency دون سبب مرتبط بالمهمة.
8. لا تضف dependency جديدة إذا أمكن تنفيذ المطلوب بأدوات المشروع الحالية بصورة سليمة.
9. لا تستخدم API قديمًا إذا كان البديل المدعوم واضحًا.
10. أي تغيير dependency يجب أن يظهر في diff ويُذكر سببه.

**ممنوع:**
- نسخ كود من tutorial قديم دون التحقق من توافقه.
- استخدام API deprecated.
- إضافة package فقط لتجاوز مشكلة يمكن إصلاحها في الكود الحالي.
- تغيير framework/toolchain خارج نطاق المرحلة.

---

# 6. TypeScript وجودة الكود

المشروع TypeScript ويجب الحفاظ على type safety.

ممنوع استخدام أي من التالي لإخفاء مشكلة حقيقية:

- `any` غير مبرر.
- `@ts-ignore`.
- `@ts-expect-error` كحل سريع.
- تعطيل قواعد ESLint.
- تعطيل strictness.
- casts غير مبررة.
- `as any`.
- catch فارغ.
- ابتلاع Promise rejection.
- تحويل error إلى نجاح وهمي.
- جعل القيمة `unknown` أو `string` فقط للهروب من typing دون validation.

إذا كان cast ضروريًا:

- يجب أن يكون له سبب تقني واضح.
- يجب أن يكون أضيق نطاق ممكن.
- يجب أن يكون مدعومًا بضمان/validation مناسب.

الأفضل إصلاح مصدر مشكلة النوع بدل إسكات compiler.

---

# 7. لا تصلح Build على حساب صحة النظام

نجاح:

- `typecheck`
- `lint`
- `build`

ليس دليلًا كافيًا على صحة feature.

ممنوع حذف test أو validation أو authorization أو error handling فقط لكي ينجح Build.

لا يجوز تغيير behavior الصحيح فقط لإرضاء اختبار ضعيف؛ إذا كان الاختبار قديمًا أو خاطئًا، أثبت ذلك وحدّثه ضمن النطاق المسموح.

---

# 8. دورة تنفيذ المرحلة

لكل Phase:

1. Read.
2. Understand.
3. تحديد Scope.
4. تحديد Acceptance Criteria.
5. تحديد الملفات المتوقعة.
6. تحديد المخاطر والحالات الحدية.
7. تنفيذ المرحلة فقط.
8. كتابة/تحديث الاختبارات المناسبة.
9. تشغيل typecheck.
10. تشغيل lint.
11. تشغيل tests.
12. تشغيل build.
13. مراجعة diff.
14. مراجعة عدم وجود تغييرات خارج النطاق.
15. مراجعة security/data integrity.
16. تحديث تقرير المرحلة.
17. Commit واضح.
18. STOP.

**لا يبدأ الوكيل المرحلة التالية تلقائيًا.**

---

# 9. لا توسع النطاق

ممنوع:

- refactor واسع غير مخطط.
- إعادة تسمية شاملة.
- إعادة هيكلة المشروع لمجرد التفضيل.
- تنظيف ملفات غير مرتبطة.
- تحديث dependencies غير المرتبطة.
- إضافة ميزات مستقبلية.
- تنفيذ UI لمرحلة مستقبلية.
- تنفيذ migration أو endpoint لا تحتاجه المرحلة.

إذا اكتشف الوكيل مشكلة خارج نطاق المرحلة:

**سجّلها → لا تصلحها تلقائيًا → اذكر تأثيرها → انتظر المرحلة/قرار الإصلاح المناسب.**

الاستثناء: مشكلة أمنية حرجة أو corruption خطر يجب إيقاف التنفيذ عندها وإبلاغ صاحب المشروع بدل تجاهلها.

---

# 10. قاعدة التعارض بين الكود والخطة

إذا وجد الوكيل:

- كودًا قديمًا يخالف الخطة.
- اختبارًا يتوقع behavior مختلفًا.
- migration لا تطابق الخطة.
- API contract لا يطابق الخطة.
- UI behavior يناقض قاعدة أعمال.

لا يختار الحل من نفسه.

يجب أن يحدد:

- ما الموجود.
- ما تقوله الخطة.
- ما التعارض.
- ما أثر كل خيار.

ثم يطبق فقط ما تسمح به الخطة الحالية.

---

# 11. Architecture Boundaries

الطبقات الأساسية:

- UI: العرض والتفاعل.
- Services: Domain/Business logic.
- Controllers/Routes: HTTP boundary.
- Validators: input validation.
- Authorization: Permission + Access Scope.
- Repositories: data access.
- Database: source of truth.
- Storage: central file storage.
- Jobs: asynchronous/scheduled work.
- Audit: audit/view records.
- Logging: technical logs.
- Config: environment/runtime configuration.

القواعد:

- React لا يتصل بقاعدة البيانات مباشرة.
- React ليس مصدر الصلاحيات.
- Business logic لا يوضع داخل React components.
- Controllers لا تتحول إلى مكان لمنطق المجال.
- Repositories لا تقرر Business Rules.
- SQL لا يُستخدم بطريقة تسمح بحقن SQL.
- لا يتم تجاوز Services/Authorization فقط لتسريع feature.

---

# 12. البيانات ومصدر الحقيقة

بعد PostgreSQL:

**PostgreSQL هو مصدر الحقيقة للبيانات التشغيلية.**

ممنوع إعادة localStorage كمصدر حقيقة أمني أو تشغيلي.

العلاقات الأساسية تستخدم IDs.

`employeeName` ليس مفتاح علاقة.

لا تستخدم الاسم للمطابقة الأساسية عندما يوجد معرف رسمي/داخلي.

البيانات التاريخية لا تُحذف بسبب تغيّر UI.

Former Employee ليس حذفًا للـEmployee.

Timeline طبقة مشتقة ولا تصبح نسخة ثانية من بيانات المصدر إلا إذا نصت الخطة صراحة على ذلك.

---

# 13. Database / Migration Safety

أي migration يجب أن:

- تكون قابلة للتتبع.
- تحافظ على البيانات الموجودة.
- تستخدم constraints المناسبة.
- تراعي foreign keys.
- تراعي unique constraints.
- تراعي indexes عند الحاجة.
- تراعي rollback/forward strategy المتبعة في المشروع.
- تختبر على نسخة اختبارية.
- لا تحذف بيانات تاريخية دون مواصفة صريحة.

ممنوع تعديل migration مطبق في بيئة مستقرة بطريقة تكسر التاريخ؛ أضف migration جديدة وفق آلية المشروع.

لا تستخدم migration لتغيير Business Rule غير معتمد.

---

# 14. Data Integrity

كل إدخال خارجي أو API input يعتبر غير موثوق حتى يتم التحقق منه.

يجب الفصل بين:

**raw/source data → normalized data → validated domain data**

ولا يجوز فقد المصدر الأصلي دون سبب موثق.

عند التحويل:

- لا تُسقط قيمة بصمت.
- لا تستبدل قيمة غامضة بقيمة "منطقية" من عندك.
- لا تغير معنى البيانات.
- لا تقرّب التواريخ أو الأرقام دون قاعدة.
- لا تحول null/empty/unknown إلى قيمة حقيقية بلا مواصفة.

---

# 15. العربية وUnicode والتواريخ

يجب التعامل مع العربية كحالة أساسية، وليس edge case.

يجب اختبار:

- Arabic Unicode.
- Arabic/Latin digits.
- اختلاف أشكال الهمزات.
- التشكيل عند الحاجة.
- المسافات غير العادية.
- BOM/encoding.
- أسماء الملفات العربية.
- UTF-8.
- التواريخ العربية/الغربية.
- locale-dependent formats.

Normalization لا يعني تغيير القيمة الأصلية.

يجب الاحتفاظ بالقيمة الأصلية عندما تكون مطلوبة للتدقيق أو الاسترجاع.

أي Arabic normalization يستخدم للمقارنة/البحث فقط إذا كانت الخطة تسمح بذلك.

---

# 16. التواريخ والأوقات

يجب التفريق بين:

- تاريخ الوثيقة الأصلي.
- تاريخ/وقت إنشاء السجل.
- تاريخ/وقت الاستيراد.
- تاريخ/وقت الحدث التشغيلي.

لا تستبدل `Document Date` بـ `Imported At`.

لا تستخدم timezone المحلي بطريقة ضمنية إذا كان ذلك يغير المعنى.

أي parsing للتاريخ يجب أن يحدد format بوضوح.

التاريخ الغامض يفشل validation بدل التخمين.

---

# 17. External Data / Import Safety

أي بيانات من نظام خارجي تعتبر **untrusted input**.

ينطبق ذلك على:

- Excel.
- CSV.
- PDF.
- صور.
- ملفات المرفقات.
- API خارجي.
- قاعدة بيانات وسيطة.
- جهاز حضور.
- نظام الجود.

قبل بناء connector أو importer يجب معرفة **الشكل الفعلي للبيانات**.

ممنوع اختراع schema أو vendor أو column mapping.

---

# 18. قاعدة الاستيراد: Understand → Normalize → Validate → Preview → Commit → Verify

أي Import حساس يجب أن يمر منطقيًا بهذه الطبقات:

1. Discover source format.
2. Parse.
3. Preserve raw/source information.
4. Normalize.
5. Validate.
6. Detect duplicates/conflicts.
7. Produce report/preview.
8. Commit only validated data.
9. Verify persisted results.
10. Audit the import.

إذا كانت المرحلة تحدد dry-run أو batch approval، يجب عدم تجاوزها.

---

# 19. استيراد نظام «الجود» — قواعد إلزامية

استيراد الجود من أكثر أجزاء المشروع حساسية.

القاعدة الأساسية:

**لا تخمين في بيانات الجود.**

إذا كانت الحزمة مثل:

```text
Export Folder/
├── Excel file
└── attachfile/
    ├── file...
    └── ...
```

يجب استخدام المرجع الفعلي في Excel/المصدر لربط المرفق بالكتاب.

ممنوع الربط اعتمادًا على:

- رقم الصف.
- ترتيب الصفوف.
- ترتيب الملفات.
- تشابه الاسم.
- "أقرب اسم".
- افتراض نمط غير موثق.
- تخمين AI.

إذا كان المرجع غير موجود أو غير واضح:

**unmatched/ambiguous → report → manual review**

ولا ينشئ الوكيل علاقة من عنده.

---

# 20. ملفات الجود غير المرتبطة

إذا وجد ملف في `attachfile` بلا مرجع مقابل:

- لا يُربط تلقائيًا.
- لا يُحذف.
- لا يُهمل.
- لا يُعتبر نجاحًا.
- يسجل `unmatched/unreferenced`.
- يظهر في تقرير الاستيراد.

إذا كان هناك أكثر من ملف يمكن أن يطابق مرجعًا واحدًا بشكل غير حاسم:

**ambiguous → لا تخمين.**

---

# 21. سلامة الملفات أثناء Import

قبل تخزين أي ملف:

- وجود الملف.
- قابلية القراءة.
- MIME detection.
- size.
- hash.
- integrity.
- filename sanitization.
- path traversal protection.
- stable ID جديد.
- original filename محفوظ.
- storage key جديد وآمن.
- authorization عند الوصول.

لا يعتمد نوع الملف على extension وحده عندما يلزم فحص المحتوى.

لا تستخدم مسار مجلد الجود كمسار إنتاجي بعد الاستيراد.

لا تجعل Windows share مصدر الوصول المباشر للمستخدمين.

---

# 22. Original vs Internal Identity

اسم الملف الأصلي ليس ID.

يجب الفصل بين:

- `stable ID` في السقاية.
- `original filename`.
- `storage key/path`.
- `hash`.

لا تستخدم filename كـprimary key.

لا تغير original filename بلا سبب.

---

# 23. Duplicate Detection

Duplicate detection لا يعني "تشابه النص".

يجب أن يكون مبنيًا على مفاتيح/قواعد موثقة.

عند وجود duplicate candidate:

- لا تحذف تلقائيًا.
- لا تدمج تلقائيًا إذا لم تنص الخطة على merge policy.
- لا تستبدل سجلًا صحيحًا بسجل آخر.
- سجل سبب الاشتباه.
- اجعل القرار قابلًا للمراجعة.

يجب اختبار:

- exact duplicate.
- same official number/date.
- near duplicate إذا كانت الخطة تتطلبه.
- conflicting records.
- duplicate attachment/hash.

---

# 24. Mapping

أي mapping يجب أن يكون:

- موثقًا.
- deterministic.
- قابلًا للاختبار.
- قابلًا للمراجعة.
- لا يعتمد على ترتيب الصفوف.

إذا تغير header أو format المصدر:

لا يحاول الوكيل "التأقلم" بالتخمين.

يجب أن يفشل بوضوح أو يستخدم schema version/adapter موثقًا.

---

# 25. Import Batches

عند تنفيذ Phase 31 أو أي استيراد إنتاجي:

- كل سنة/دفعة مستقلة.
- لا إدخال شامل دفعة واحدة.
- لكل دفعة report.
- لكل دفعة نقطة تحقق.
- لا تبدأ الدفعة التالية إذا كانت السابقة غير مفهومة أو فاشلة.
- لا تعتبر partial success نجاحًا كاملًا.
- يجب تمييز processed / failed / skipped / ambiguous / unmatched.

أي failure يجب أن يكون قابلًا للتشخيص.

---

# 26. Transactions / Atomicity

عندما تتطلب العملية atomicity:

- استخدم DB transaction.
- لا تترك domain record في حالة نصف مكتملة.
- لا تنشئ Attachment relation قبل التأكد من سلامة الملف إذا كانت العملية تتطلب ذلك.
- لا تكتب نتيجة "نجاح" قبل اكتمال العملية المطلوبة.
- عند الحاجة، افصل العمليات غير القابلة للمعاملة مثل file I/O عن DB transaction مع reconciliation/cleanup strategy واضحة.

لا تفترض أن DB transaction وحدها تعيد ملفات filesystem تلقائيًا.

---

# 27. Import Reports

يجب أن يستطيع تقرير الاستيراد التمييز، بحسب متطلبات المرحلة، بين:

- total rows.
- valid.
- invalid.
- duplicates.
- conflicts.
- missing references.
- unmatched attachments.
- unreferenced attachments.
- unreadable files.
- corrupted files.
- successfully imported.
- skipped.
- failed.
- ambiguous.

لا تقل "Import successful" إذا كانت هناك أخطاء حرجة مخفية.

---

# 28. Historical Import Semantics

التاريخ الأصلي للوثيقة يبقى هو تاريخ الوثيقة.

`Imported At` يبقى تاريخ الإدخال.

استيراد 2022–2026 لا يعني أن الوثيقة جديدة.

لا يولد الاستيراد التاريخي تلقائيًا:

- Notification جديد.
- Reminder مصطنع.
- نشاط حديث.
- Acknowledgement جديد.

إذا كانت قاعدة تاريخية خاصة مطلوبة، يجب أن تكون موثقة في الخطة.

---

# 29. OCR

OCR ليس مصدر الحقيقة للوثيقة.

- الصورة/الملف الأصلي هو المرجع الرسمي.
- OCR يستخدم للفهرسة/البحث وفق الخطة.
- OCR failure لا يعني فشل حفظ الوثيقة.
- OCR يجب أن يكون قابلًا لإعادة المحاولة عند تصميم job.
- لا يستبدل النص الأصلي بالنص المستخرج.
- لا يقرر OCR قيمة Business Field دون قاعدة صريحة.

لا يختار Cline مزود OCR مدفوعًا أو خدمة سحابية من نفسه.

اختيار OCR يكون بعد benchmark على عينات حقيقية ووفق الخطة.

---

# 30. Search / Normalization

Flexible matching لا يعني إنشاء كيانات جديدة.

Typo في اسم منتسب لا يبرر إنشاء Employee جديد.

لا تجعل search normalization تغير البيانات الأصلية.

أي fuzzy matching يستخدم للبحث/اقتراح فقط ما لم تنص الخطة على غير ذلك.

---

# 31. Security

القرار الأمني النهائي على Backend:

```text
Identity
→ Permission
→ Access Scope
→ Resource
```

يجب اختبار direct API access، وليس UI فقط.

ممنوع:

- الثقة في hidden buttons.
- الاعتماد على frontend authorization.
- كشف resource لمجرد معرفة ID.
- IDOR.
- privilege escalation.
- bypass لـAccess Scope.

لا تسجل secrets أو tokens أو كلمات المرور في logs.

Secrets تأتي من environment/secret store حسب البنية المعتمدة.

لا تضع credentials داخل source code.

---

# 32. Authentication / Sessions

لا تغير قواعد auth المعتمدة من الخطة.

أي تعديل في:

- OTP.
- session.
- account lock.
- reset.
- secret handling.

يجب أن يراجع security implications والاختبارات.

أي بيانات سرية قابلة للكشف إداريًا وفق Business Rule استثنائية يجب عزلها في وحدة أمنية واضحة ولا تعمم على باقي النظام.

---

# 33. API Safety

كل endpoint جديد يجب أن يحدد:

- authentication requirement.
- permission.
- access scope.
- input schema.
- validation.
- error behavior.
- response shape.
- audit requirement إذا لزم.
- concurrency behavior إذا كان mutable.

لا تقبل fields غير متوقعة إذا كان ذلك يؤدي إلى mass assignment أو سلوك غير معروف.

---

# 34. Error Handling

الأخطاء يجب أن تكون:

- واضحة.
- قابلة للتشخيص.
- typed قدر الإمكان.
- غير كاشفة لمعلومات حساسة.
- مسجلة تقنيًا عند الحاجة.

ممنوع:

- catch ثم return success.
- catch فارغ.
- إخفاء سبب failure.
- fallback صامت يغير البيانات.
- تحويل validation failure إلى default value من عند الوكيل.

Fallback يجب أن يكون موثقًا ومحددًا.

---

# 35. Logging / Audit

فرق واضح بين:

- Technical Log.
- Audit Log.
- View/Acknowledgement Log.

لا تسجل كل شيء في Audit لمجرد أن التسجيل ممكن.

لا تستخدم View Log كبديل عن Audit.

في Historical Import يجب أن يكون المصدر والدفعة والسجلات/المرفقات والنتائج المهمة قابلة للتتبع وفق سياسة التدقيق.

---

# 36. Notifications / Reminders

الأحداث التاريخية المستوردة لا تعامل كأحداث حديثة.

أي event generation يجب أن يحترم:

- historicalImport semantics.
- idempotency.
- duplicate prevention.
- processing state.

Background jobs يجب ألا تنتج إشعارات مكررة بسبب retry.

---

# 37. Background Jobs

أي Job يجب أن يراعي:

- idempotency.
- retry policy.
- failure state.
- logging.
- عدم تكرار side effects.
- recovery بعد restart.

لا تجعل retry ينشئ record/notification/file مرتين.

---

# 38. Backup / Restore

Backup ليس مجرد إنشاء ملف.

يجب التحقق من:

- PostgreSQL.
- central attachments.
- required configuration.
- required audit/system state.

Backup ناجح فقط إذا كان Restore قابلًا للاختبار.

Restore يجب أن يتبعه consistency/readiness check.

لا تكتب backup code من عندك إذا كانت أداة/آلية النظام محددة في المرحلة.

---

# 39. LAN / Deployment

ممنوع hard-code لـIP داخل التطبيق.

استخدم configuration/hostname/حل مناسب حسب الخطة.

لا تعتمد الوظائف الأساسية على Internet.

لا تعتمد على SSID كآلية أمنية أو routing.

Startup/readiness يجب أن يفرقا بين:

- service running.
- system ready.

لا تجعل التطبيق يعلن readiness إذا كانت DB/storage/required dependencies غير جاهزة.

---

# 40. Performance

لا تحسن الأداء بالتخمين.

قبل optimization:

- حدد bottleneck.
- قس أو راقب.
- نفذ أقل تغيير مناسب.
- اختبر regression.

الالتزام بالخطة:

- pagination.
- lazy loading.
- عدم تحميل جميع الصور.
- indexes.
- background jobs.
- caching عند الحاجة.

Caching لا يصبح مصدر حقيقة للبيانات.

---

# 41. UI Rules

الواجهة تتبع `ALSQAYA_UI_PLAN.md`.

لا يخترع Cline UI behavior يغير:

- permissions.
- business rules.
- data semantics.

UI يجب أن يمثل حالات:

- Loading.
- Empty.
- Error.
- Success.
- Permission denied.
- Session expired.

لكن وجود زر مخفي لا يعتبر authorization.

لا تعاد هيكلة UI بالكامل لمجرد الحجم.

---

# 42. Deep Navigation / Routing

عند إدخال routes:

- لا تخزن كل semantics في state داخلي دائمًا.
- route يجب أن يمثل resource/intent واضحًا عندما تتطلب الخطة ذلك.
- لا تخترع URL contract غير موثق إذا كان له أثر خارجي.

---

# 43. Accessibility / RTL / Arabic UX

RTL هو الافتراضي.

يجب الحفاظ على:

- readable Arabic.
- keyboard accessibility حيث يلزم.
- labels واضحة.
- error messages مفهومة.
- focus management في dialogs/forms.
- عدم الاعتماد على اللون وحده.
- responsive behavior.

لا تجعل تحسينًا بصريًا يكسر data semantics أو accessibility.

---

# 44. Tests — الحد الأدنى الإلزامي

عند كل مرحلة:

- typecheck.
- lint إذا كان متاحًا.
- build.
- tests الخاصة بالمرحلة.
- regression tests المناسبة.

Feature حساسة يجب أن تختبر على الأقل:

1. Happy path.
2. Invalid input.
3. Boundary/edge cases.
4. Failure path.
5. Security/authorization إذا كانت ذات صلة.
6. Regression.

---

# 45. Import Tests

أي Import يجب أن يختبر، بحسب نطاق المرحلة:

- valid source.
- malformed source.
- missing columns.
- extra columns.
- reordered columns.
- Arabic headers.
- encoding.
- Arabic/Latin digits.
- invalid dates.
- ambiguous dates.
- missing reference.
- duplicate records.
- duplicate attachments.
- corrupted attachment.
- unreadable attachment.
- unreferenced attachment.
- multiple attachments.
- path traversal.
- malicious/unsafe file type.
- partial failure.
- retry/idempotency.
- rollback/reconciliation.
- audit result.
- dry run.
- batch approval.

**لا يكفي اختبار ملف ناجح واحد.**

---

# 46. Test Data Isolation

بيانات الاختبار منفصلة تمامًا عن بيانات العمل.

لا تستخدم ملفات الجود الحقيقية في tests تلقائيًا.

إذا احتجنا عينات واقعية:

- استخدم نسخة sanitized/anonymized.
- لا تسجل بيانات حساسة في snapshots/logs.
- لا commit بيانات عمل حقيقية إلى Git.

---

# 47. Test Seed / UAT

لا تعتبر seed data بيانات إنتاج.

لا تدخل بيانات العمل الحقيقية قبل نجاح UAT وفق الخطة.

UAT يجب أن يغطي المسارات الأساسية للأدوار المعتمدة.

---

# 48. Dependency / Tooling Changes

أي تغيير في:

- package.
- Node version.
- TypeScript.
- Vite.
- React.
- Express.
- database driver.
- ORM/query layer.
- test runner.
- build tooling.

يجب أن يكون مبررًا ومرتبطًا بالنطاق.

بعد التغيير:

- install/lockfile integrity.
- typecheck.
- lint.
- tests.
- build.

لا تغير toolchain أثناء feature صغيرة إلا إذا كان هناك سبب ضروري.

---

# 49. File / Repository Discipline

قبل التعديل:

- `git status`.

بعد التعديل:

- `git diff`.
- `git status`.

يجب أن تكون كل الملفات المعدلة مرتبطة بالمهمة.

أي ملف غير متوقع:

**تحقق قبل commit.**

لا تمسح ملفات غير معروفة فقط لأنها تبدو غير مستخدمة.

---

# 50. Git

ممنوع:

- force push.
- حذف branch/tag/commit سليم دون قرار.
- إعادة كتابة history دون ضرورة معتمدة.

كل Phase لها checkpoint واضح.

لا يعتبر كلام Agent عن commit دليلًا؛ تحقق من Git فعليًا.

---

# 51. Phase Completion Gate

لا تقل:

`Phase complete`

لمجرد أن الكود كُتب.

الإغلاق يتطلب:

- Scope matched.
- Requirements matched.
- No unresolved required item.
- Tests passed.
- Typecheck passed.
- Lint passed أو تم توثيق سبب عدم توفره.
- Build passed.
- Regression checked.
- Security checked where relevant.
- Diff reviewed.
- No unintended files.
- Documentation/report updated.
- Git checkpoint created.

إذا فشل شرط مهم:

**المرحلة ليست مكتملة.**

---

# 52. مراجعة المخاطر قبل المراحل الحساسة

قبل أي مرحلة تتعامل مع:

- external data.
- files.
- migration.
- auth.
- permissions.
- backup.
- restore.
- OCR.
- import.
- export.
- deployment.

يجب إعداد قائمة مختصرة:

- assumptions.
- failure modes.
- edge cases.
- data-loss risks.
- security risks.
- recovery behavior.

إذا كانت هناك حالة لم تحدد الخطة سلوكها، لا يخترع الوكيل السلوك.

---

# 53. قاعدة خاصة بالمراحل 30–31

Phase 30 ليست تصريحًا بالإدخال الفعلي.

Phase 30 يجب أن تركز على:

- source understanding.
- mapping.
- cleaning.
- validation.
- attachment mapping.
- source preservation.
- duplicate detection.
- error reporting.
- dry run.

Phase 31 هي التنفيذ الفعلي على دفعات.

لا يختصر الوكيل المرحلتين في عملية واحدة.

لا يتم إدخال الإنتاج الكامل دفعة واحدة.

---

# 54. قاعدة خاصة بالربط مع المنتسبين

لا تربط سجلًا بمنتسب بناءً على الاسم فقط إذا كان معرف رسمي متاحًا.

إذا لم توجد مطابقة مؤكدة:

- unmatched/ambiguous.
- report.
- manual review.

Typo أو تشابه اسم لا يبرر إنشاء Employee جديد.

---

# 55. قاعدة خاصة بالكتب المرتبطة

لا تنشئ Related Transaction اعتمادًا على:

- proximity.
- row order.
- filename similarity.
- subject similarity وحدها.

استخدم فقط relationship rule موثقة.

عند الغموض:

**لا تخمين.**

---

# 56. قاعدة خاصة بالحضور والبصمة

قبل connector إنتاجي:

- معرفة الجهاز الفعلي.
- معرفة vendor الفعلي.
- معرفة export/API/database الفعلي.
- معرفة schema الفعلي.

لا يخترع Cline vendor أو schema.

Raw attendance محفوظ.

Derived attendance منفصل.

لا تُحذف raw records بسبب الاشتقاق.

---

# 57. قاعدة خاصة بالـAI نفسه

الـAI ليس مصدر الحقيقة.

لا يجوز للـAgent أن يعتبر:

- confidence اللغوي.
- "عادةً".
- "أفضل ممارسة عامة".
- "هذا شائع".
- "غالبًا".

دليلًا على Business Rule.

عندما يحتاج قرارًا غير موثق:

**STOP rather than invent.**

---

# 58. عندما يكتشف Agent مشكلة

التصرف المطلوب:

1. وصف المشكلة.
2. تحديد مكانها.
3. تحديد أثرها.
4. تحديد هل هي داخل Scope.
5. تحديد هل لها قاعدة موجودة.
6. إصلاحها فقط إذا كانت ضمن النطاق أو ضرورية لمنع فشل المرحلة.
7. إذا كانت خارج النطاق، وثقها ولا توسع العمل.

---

# 59. Bugs المكتشفة أثناء العمل

Bug حقيقي يجب ألا يُخفى.

إذا كان داخل نطاق المرحلة:

- أضف regression test.
- أصلح السبب.
- شغل الاختبارات.

إذا كان خارج النطاق:

- لا تنفذ إصلاحًا واسعًا.
- سجل bug واضحًا.
- اذكر المخاطر.

إذا كان أمنيًا/فساد بيانات:

- أوقف التنفيذ عند الحاجة.
- لا تدفع commit يعرف أنه يترك النظام في حالة خطرة.

---

# 60. لا تعتمد على رسالة Agent

الجملة:

> "تم التنفيذ بنجاح"

ليست دليلًا.

الدليل هو:

- الكود.
- diff.
- tests.
- typecheck.
- lint.
- build.
- Git.
- report.
- evidence of behavior where required.

---

# 61. تقرير المرحلة

يجب أن يوضح التقرير:

- What changed.
- What did not change.
- Requirements satisfied.
- Tests run/results.
- Known limitations.
- Out-of-scope findings.
- Migration changes.
- Security considerations.
- Data integrity considerations.
- Git checkpoint.

لا يعلن التقرير نجاحًا إذا بقي شرط إغلاق إلزامي غير محقق.

---

# 62. تغيير Business Rules

إذا ظهرت قاعدة جديدة:

```text
اكتشاف
→ توثيق
→ اعتماد
→ تحديث ALSQAYA_PLAN.md
→ تحديد المرحلة المناسبة
→ تنفيذ
→ اختبار
```

لا يضيف Cline Business Rule داخل الكود أولًا ثم يوثقها لاحقًا.

---

# 63. تغيير PROJECT_RULES

إذا اكتشفنا نمطًا متكررًا من أخطاء Agent:

1. لا نضيف قاعدة عشوائية.
2. نحدد سبب الفشل.
3. نحدد هل القاعدة تخص الخطة أم سلوك Agent.
4. نحدث الوثيقة المناسبة.
5. نمنع التناقض مع `ALSQAYA_PLAN.md`.
6. نطبق القاعدة في المراحل القادمة.

---

# 64. قاعدة التوقف

يجب على Agent أن يتوقف ويطلب قرارًا عندما:

- Business Rule غير محسومة.
- source format غير معروف.
- mapping غير حاسم.
- duplicate policy غير محددة.
- security behavior غير واضح.
- destructive migration غير موثقة.
- dependency choice تؤثر في architecture.
- هناك تعارض بين الوثائق.
- الحل المقترح سيؤثر في مرحلة مستقبلية بطريقة غير قابلة للعكس.
- توجد احتمالية فقدان بيانات.

**التوقف أفضل من التخمين.**

---

# 65. المبدأ النهائي

السقاية نظام بيانات إداري وأرشيفي، وليس مجرد واجهة.

لذلك الأولوية:

**Correctness → Data Integrity → Security → Auditability → Maintainability → Testability → Performance → UI polish**

ولا يجوز التضحية بالأولى من أجل الأخيرة.

القاعدة الذهبية:

> **لا تخمّن. لا تخفِ الخطأ. لا تتجاوز الخطة. لا توسّع النطاق. لا تضحِ بسلامة البيانات من أجل نجاح Build. تحقق من الدليل، نفذ أقل تغيير صحيح، اختبره، ثم توقف.**
