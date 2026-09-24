# PHASE 7 REPORT — Timeline

**التاريخ:** 2026-09-24
**المرجع الوحيد:** `ALSQAYA_PLAN.md`
**الفرع:** `phase-0-baseline` — آخر commit: `c9a88b7 docs: sync project archives with ALSQAYA plan`
**الحالة:** ✅ مكتملة ومُختبرة (لا Git commit — حسب التعليمات)
**المصدر:** تكملة تنفيذ بدأها Continue ثم أُكملت واختُبرت وأُصلحت عيوبها هنا.

---

## 1. نطاق المرحلة من الخطة

| المرجع | النص |
|--------|------|
| `Phase 7 — Timeline` | «تنفيذ طبقة تجميع الأحداث وعرضها زمنيًا. لا يتم إنشاء نسخة مكررة من السجلات الأصلية.» |
| `BR-14 — Timeline` | «الخط الزمني طبقة تجميع وعرض، وليس جدولًا مستقلًا يكرر البيانات.» — يجمع من: التعيين، النقل، التكليف، الدورات، الإجازات، الأذونات، الكتب، الموقف اليومي، الأحداث الإدارية الأخرى. |
| `BR-12` | التكليفات والدورات تظهر في ملف المنتسب **وفي الخط الزمني**. |
| `Phase 3` (ملف المنتسب) | يشمل «الخط الزمني عند توفره». |

---

## 2. ما الذي تم تنفيذه

### 2.1 نموذج الخط الزمني (مشتق — لا يُخزَّن)

`src/core/models/timeline.ts`
* `TimelineSourceType` — أنواع المصادر: `leave`, `timePermission`, `assignment`, `course`, `transaction`, `dailySituation` + `appointment`, `transfer`, `other` (معلنة للاستعداد المستقبلي فقط).
* `TimelineEntry` — حدث مشتق: `id`, `sourceType`, `sourceId`, `employeeId`, `date`, `endDate?`, `title`, `description?`, `status?`, `metadata?`. يعرَّف صراحةً بأنه **لا يُخزن** ويُحسب عند الطلب.
* `TimelineMappers` — تحويل الكيانات الأصلية إلى أحداث: `fromLeave`, `fromTimePermission`, `fromAssignment`, `fromCourse`, `fromTransaction`, `fromDailySituation`.
* **إصلاح (نطاق Phase 7):** كانت العناوين والحالات تُبنى من القيم البرمجية الخام (`إجازة annual`، حالة `registered`) — أصبح العرض العربي من كتالوجات `personnelCatalogs` و`TRANSACTION_STATUS_LABELS` المعتمدة في المرحلة 1، فلا تظهر أي قيمة إنجليزية خام للمستخدم ولا نصوص مخترعة.

### 2.2 خدمة التجميع (React-free / Storage-free)

`src/services/timelineService.ts`
* `TimelineService.buildForEmployee({...})` — يبني الخط الزمني لمنتسب واحد من المصادر الأصلية، مرتّبًا تنازليًا، مع `countsBySource` و`totalCount` (قبل الفلاتر).
* `TimelineService.groupByPeriod(entries, 'day' | 'week' | 'month')` — تجميع زمني لفترات يوم/أسبوع (ISO week)/شهر مع تسميات عربية.
* `TimelineService.getSourceTypeLabels()` و`getSourceTypeStyle()` — تسميات وأيقونات/ألوان للعرض.
* `TimelineFilterOptions` — `sourceTypes`, `dateFrom`, `dateTo`, `searchText`, `limit`.
* المصادر: `PersonnelService.getByEmployee` للمجموعات الفردية، و`DailySituationService.getByEmployee` للمواقف (Rule 7)، والمعاملات بالنطاق الممرَّر.
* **إصلاح (نطاق Phase 7):** كان نطاق المعاملات يستخدم رجوعًا ضعيفًا وغير صحيح `tr.employeeName.includes(employeeId)` (مطابقة معرّف داخل نص الاسم). استُبدل بـ:
  1. `transactionIds` — نطاق صريح يمرّره المستدعي (يشمل علاقة `TransactionEmployee` في المرحلة 5 + الروابط القديمة الآمنة — Rule 3)،
  2. وإلا المرآة `employeeIds` على المعاملة (Rule 7).
  لا مطابقة بالاسم النصي داخل الخدمة.
* **إصلاح:** الأحداث بلا تاريخ صالح (مثل دورة مسجّلة بلا تاريخ بداية) كانت تُنتج تسمية مجموعة مشوّهة (`unknown/undefined/undefined`) — أصبحت مجموعة «بدون تاريخ» بتسمية عربية وتُرتَّب دائمًا في نهاية الخط الزمني، بدون حذف أي سجل وبدون اختلاق تاريخ.

### 2.3 واجهة العرض

`src/components/views/TimelineView.tsx` (تصدير من `views/index.ts`)
* ترويسة باسم المنتسب وزر «عودة إلى الملف الشخصي» (`onBack` اختياري).
* شريط تحكم: إظهار/إخفاء لوحة التصفية، اختيار التجميع (يومي/أسبوعي/شهري)، الترتيب (الأحدث/الأقدم)، وعبارة «`X` من `Y` حدث».
* لوحة تصفية: أنواع المصادر المتاحة فقط (تلك التي لها أحداث فعلية، مع استثناء `appointment`/`transfer` غير المُنتَجة)، نطاق تاريخي، بحث نصي، ومسح الفلاتر.
* عرض مجمّع حسب الفترة، وكل حدث: نوع المصدر، العنوان، التاريخ (وصيغة `→` للنطاق)، الوصف، والحالة.
* النقر على الحدث ينقله إلى سجله الأصلي عبر `onNavigateToSource(sourceType, sourceId)`.
* حالة «لا توجد أحداث زمنية مسجلة لهذا المنتسب».
* **إصلاح:** مفتاح React للعنصر أصبح `${sourceType}-${id}` لتجنّب تعارض المفاتيح بين مصادر مختلفة.

### 2.4 الربط بملف المنتسب (آخر نقطة كانت ناقصة)

`src/components/views/EmployeesView.tsx`
* زر `btn-toggle-timeline` («الخط الزمني» / «إخفاء الخط الزمني») مع عدّاد الأحداث داخل شريط إجراءات ملف المنتسب.
* `employeeTimeline = useMemo(...)` — يستدعي `TimelineService.buildForEmployee` على نفس بيانات المراحل 3/5/6:
  * `employeeLeaves`, `employeeTimePermissions`, `employeeAssignments`, `employeeCourses` (Phase 3)،
  * `linkedTransactions` + `transactionIds` (نطاق المرحلة 5: علاقة `TransactionEmployee` ثم الرجوع الآمن للموروث)،
  * `dailySituations` (Phase 6).
* لوحة `employee-timeline-panel` تُعرض داخل الملف عند التبديل، مع بقاء كل أقسام الملف (الإجازات/الأذونات/التكليفات/الدورات/الموقف اليومي/سجل المعاملات) كما هي.
* عند تغيير المنتسب المحدد يُغلق الخط الزمني تلقائيًا (لا يُعرض خط زمني لمنتسب آخر).
* التنقّل من الحدث إلى مصدره:
  * `transaction` ⇒ فتح ملف الكتاب من نفس بيانات المرحلة 5 (`onSelectTransaction`).
  * `dailySituation` / `leave` / `timePermission` ⇒ الانتقال إلى عرض الموقف اليومي بالمُعرّف `employeeId` والقسم المناسب (`موقف يومي` / `إجازة` / `زمنية`) عبر `onNavigate`.
  * `assignment` / `course` ⇒ تمرير المؤشر إلى قسمهما داخل ملف المنتسب (`profile-section-assignment`, `profile-section-course`) — لا يوجد عرض مستقل لهما بعد.

---

## 3. الملفات التي تغيّرت

| الملف | الحالة | numstat | ملاحظة |
|-------|--------|---------|--------|
| `src/core/models/timeline.ts` | **جديد** | 134 سطرًا | ‏`TimelineEntry`, `TimelineSourceType`, `TimelineMappers` |
| `src/services/timelineService.ts` | **جديد** | 347 سطرًا | ‏`TimelineService` (بناء/فلاتر/تجميع/كتالوجات عرض) |
| `src/components/views/TimelineView.tsx` | **جديد** | 391 سطرًا | واجهة الخط الزمني (مكوّن مستقل عن المصدر) |
| `src/core/models/index.ts` | معدّل | +1 | تصدير `./timeline` |
| `src/services/index.ts` | معدّل | +1 | تصدير `./timelineService` |
| `src/components/views/index.ts` | معدّل | +1 | تصدير `./TimelineView` |
| `src/components/views/EmployeesView.tsx` | معدّل | +109 / −3 | الربط بالملف + مراسي الأقسام (الـ3 المحذوفة هي استبدال سطر الاستيراد وسطرَي `<section>`) |
| `src/components/views/_TimelineView_rewrite.tsx` | **محذوف** | — | ملف بقايا (محتواه «placeholder») كان **يكسر** `npm run lint` بـ `TS2304: Cannot find name 'placeholder'` وغير مرجع في أي مكان |

**ملفات لم تُلمس:** `src/App.tsx`, `src/services/storageService.ts`, `src/data/mockData.ts`, وكل نماذج/خدمات المراحل 1–6، ولا `ARCHITECTURE.md`/`ALSQAYA_PLAN.md`.

---

## 4. ما الذي لم يتم تنفيذه (داخل Phase 7)

| البند | السبب |
|-------|-------|
| مصادر `appointment` (تعيين) و`transfer` (نقل) و`other` | مُعلنة في النوع للاستعداد المستقبلي، لكنها **لا تُنتَج** لأن لا كيانات فعلية لها بعد — Rule 5 (لا تنفيذ مراحل مستقبلية) وRule 6 (لا افتراض قواعد غير محسومة). |
| صلاحيات/نطاق رؤية للخط الزمني | تُعالج في مراحل Access Scope / RBAC اللاحقة (Rule 8). الخط الزمني يعرض فقط بيانات المستخدم الممرَّرة إليه أصلًا (`visibleTransactions`). |
| عرض مستقل/مدخل في التنقّل الرئيسي للخط الزمني | الخطة تربطه بملف المنتسب (BR-12 وPhase 3) — لم تُضف شاشة/تبويب جديد في الترويسة. |
| تصدير/طباعة الخط الزمني | غير مطلوب في Phase 7 (التقارير والتصدير مرحلة لاحقة). |

---

## 5. الاختبارات التي أُجريت

لعدم وجود إطار اختبارات في المستودع (لا `test` script)، كُتبت **ثلاث مجموعات اختبار تشغيلية مؤقتة** داخل `src/`، تُصرَّف بـ `tsc` إلى `_phase7_out` (CommonJS) وتُنفَّذ بـ Node، **ثم حُذفت بالكامل** بعد النجاح:

```
npx tsc <file> --outDir _phase7_out --rootDir src --module commonjs --target ES2022 \
  --moduleResolution node --jsx react-jsx --skipLibCheck --esModuleInterop --types node
node _phase7_out/<file>.js
```

### 5.1 اختبار منطق التجميع — `_phase7_smoke.ts` ⇒ **33/33 PASS**
* التجميع من المصادر: إجازات/أذونات/تكليفات/دورات/مواقف + إحصاءات `countsBySource` و`totalCount`.
* عزل المنتسب: لا حدث واحد من منتسب آخر (Rule 7).
* نطاق المعاملات: `transactionIds` مصدر حصري، والرجوع للمرآة `employeeIds` عند غيابه.
* الفلاتر: نوع المصدر، النطاق التاريخي، البحث النصي، الحد الأقصى، وثبات `totalCount`/`countsBySource` قبل الفلاتر.
* التجميع الزمني: يومي (`YYYY-MM-DD`) أسبوعي (`YYYY-Www`) شهري بتسمية عربية، ترتيب المجموعات تنازليًا.
* الدورة بلا تاريخ ⇒ مجموعة «بدون تاريخ» بتسمية عربية وفي نهاية القائمة (لا اختلاق تاريخ ولا حذف سجل).
* الترتيب تنازلي، وفرادة مفاتيح العرض.
* العرض العربي: لا رموز خام (`annual`, `registered`, `permanent_` …).
* منتسب بلا أحداث ⇒ نتيجة فارغة والتجميع لا ينكسر.

**النتيجة:** `ALL CHECKS PASSED` (exit 0).

### 5.2 اختبار عرض المكوّن — `_phase7_view_smoke.tsx` (SSR عبر `react-dom/server`) ⇒ **16/16 PASS**
رسم فعلي لـ `TimelineView` والتحقق من: الترويسة واسم المنتسب، زر العودة، عناوين الأحداث (إجازة اعتيادية / كتاب صادر / موقف يومي)، تفاصيل عربية، تسمية نوع المصدر، «4 من 4 حدث»، زر التصفية، مجموعة «بدون تاريخ»، التاريخ `08/01/2025`، حالات عربية (`معتمدة`, `مسجلة`, `مكتمل`)، غياب الرموز الإنجليزية، وحالة «لا توجد أحداث» مع غياب زر العودة (اختياريته تعمل).

**النتيجة:** `ALL VIEW CHECKS PASSED` (exit 0).

### 5.3 اختبار عدم الكسر (المراحل 1–6) — `_phase7_regression_smoke.tsx` ⇒ **12/12 PASS**
SSR فعلي لـ `EmployeesView` ببيانات `mockData` الحقيقية + `TransactionEmployeeService.seedFromTransactions` + `DailySituationService.seedFromTransactions`:
* الملف يُرسم بلا انهيار، وزر الخط الزمني ومراسي الأقسام موجودان.
* أقسام Phase 3 (الإجازات، الأذونات الزمنية، التكليفات، الدورات والمشاركات) وPhase 6 (الموقف اليومي) وPhase 5 (سجل المعاملات الشامل) سليمة.
* الخط الزمني لا يظهر افتراضيًا، والتنقّل العميق بالمعرّف يعمل، ودور `employee` لا يكسر العرض.

**النتيجة:** `ALL REGRESSION CHECKS PASSED` (exit 0).


---

## 6. نتائج TypeScript / Lint / Build

| الفحص | الأمر | النتيجة |
|-------|-------|---------|
| Type checking + Lint | `npm run lint` (`tsc --noEmit`) | ✅ PASS — `exit 0` |
| Build | `npm run build` (`vite build`) | ✅ PASS — `built in 12.33s`, `dist/assets/index-D0EKAJeZ.js 633.05 kB` |
| تحذير البناء | — | تحذير قائم مسبقًا: حجم الحزمة > 500 kB (ليس من Phase 7، ولم يُعالج تجنّبًا لتغيير غير مطلوب) |

*(أُعيد تشغيل الفحصين بعد آخر تعديل على الكود للتأكد من أن النتائج تخصّ الحالة النهائية.)*

---

## 7. التحقق من عدم وجود تخزين مستقل للخط الزمني

| الفحص | النتيجة |
|-------|---------|
| `STORAGE_KEYS` في `storageService.ts` | ✅ لا يوجد أي مفتاح Timeline |
| دوال `saveTimeline` / `loadTimeline` | ✅ لا توجد في المستودع |
| مفتاح `zatiya_prototype_timeline*` في `src` | ✅ غير موجود |
| `src/App.tsx` | ✅ لا يحتوي أي مرجع إلى Timeline — لا State ولا Sync ولا حفظ |
| مصدر الأحداث | ✅ مشتق عند الطلب داخل `EmployeesView` عبر `useMemo` من Props المراحل 3/5/6 فقط، بدون أي نسخة مخزّنة |

> لا يوجد أي جدول/مجموعة تكرار للخط الزمني — مطابق تمامًا لـ BR-14 وPhase 7.

---

## 8. التحقق من عدم كسر المراحل 1–6

| الدليل | التفصيل |
|--------|---------|
| نطاق التغيير | `git diff` يمسّ ملفات Phase 7 + سطر ربط في `EmployeesView` فقط؛ التغييرات على `EmployeesView` إضافية (109 إضافة / 3 أسطر مستبدلة). |
| ملفات المراحل 1–6 | `src/data/mockData.ts`, `storageService.ts`, `personnelService.ts`, `requestService.ts`, `transactionService.ts`, `transactionEmployeeService.ts`, `dailySituationService.ts`, `src/App.tsx` وكل النماذج — **بدون أي تعديل**. |
| اختبار انحدار تشغيلي | §5.3 — رسم فعلي لملف المنتسب وتأكيد أقسام المراحل 3/5/6 (12/12 PASS). |
| فحص الأنواع والبناء | §6 — كلاهما ناجح، وهو ما يكشف أي كسر في العقود بين المكوّنات. |
| التوافق الرجعي للبيانات | لم يُحذف أو يُعدّل أي سجل؛ الربط القديم بالاسم في الكتب محفوظ عبر `linkedTransactions` (Rule 3) ولم تُضف كتابة أي بيانات جديدة. |

---

## 9. المشاكل والعيوب التي أُصلحت (ضمن نطاق Phase 7 فقط)

1. **عيب منطقي في نطاق المعاملات:** `tr.employeeName.includes(employeeId)` — مطابقة معرّف داخل نص الاسم (لا معنى لها، وكانت تهدد بظهور/إخفاء أحداث عشوائيًا عند تطابق نصي). استُبدلت بنطاق صريح `transactionIds` ثم المرآة `employeeIds`.
2. **تسمية فترات مشوّهة:** `unknown/undefined/undefined` للأحداث بلا تاريخ ⇒ «بدون تاريخ» + ترتيبها في النهاية.
3. **قيم إنجليزية خام في العرض** (`إجازة annual`, `registered`) ⇒ كتالوجات المرحلة 1 العربية.
4. **مفاتيح React غير مستقرة** في قائمة الأحداث ⇒ `${sourceType}-${id}`.
5. **Prop ميت:** `employeeId` في `TimelineView` كان مُعلنًا وغير مستخدم ⇒ أُزيل.
6. **ملف بقايا يكسر البناء:** `src/components/views/_TimelineView_rewrite.tsx` (محتواه `placeholder`، وغير مرجع) ⇒ حُذف؛ بدونه `npm run lint` كان يفشل بـ `TS2304: Cannot find name 'placeholder'`.

---

## 10. قرارات ما زالت تحتاج اعتمادًا

| # | القرار المطلوب | الوضع الحالي |
|---|----------------|--------------|
| 1 | كيف يُنمذج «التعيين» و«النقل» كمصادر خط زمني (BR-14 يذكرهما) | النوعان معلنان ولا يُنتَجان — يحتاج قرار مرحلة مستقبلية |
| 2 | الوجهة عند النقر على حدث تكليف/دورة | حاليًا تمرير داخل قسم الملف (لا عرض مستقل لهما) — يحتاج اعتمادًا إن أُريد وجهة أخرى |
| 3 | هل يحصل الخط الزمني على مدخل في التنقّل الرئيسي أو صفحة تجميع لكامل الشعبة | غير منفَّذ (الخطة تربطه بملف المنتسب) |
| 4 | صلاحيات/نطاق رؤية الخط الزمني | مؤجّل إلى مراحل RBAC / Access Scope |
| 5 | «الأحداث الإدارية الأخرى» في BR-14 | لا كيان مخصص بعد؛ `other` جاهز للاستعمال عند اعتماد الكيان |

---

## 11. Git Checkpoint

* لا commit ولا push — حسب التعليمات.
* الفرع: `phase-0-baseline` — آخر commit ثابت: `c9a88b7`.
* حالة العمل (غير مثبّتة):

```
 M src/components/views/EmployeesView.tsx
 M src/components/views/index.ts
 M src/core/models/index.ts
 M src/services/index.ts
?? src/components/views/TimelineView.tsx
?? src/core/models/timeline.ts
?? src/services/timelineService.ts
?? PHASE_7_REPORT.md
?? .continue/            (غير متعلق بالمرحلة)
```

---

## 12. التوقف

تم إنجاز **Phase 7 — Timeline** بالكامل: التجميع من المصادر الأصلية، العرض الزمني، الربط بملف المنتسب، والتنقّل إلى السجلات الأصلية — مع `lint` و`build` ناجحَين وثلاث مجموعات اختبار تشغيلية ناجحة، وبدون أي تخزين مستقل، وبدون كسر المراحل 1–6.

**لا يبدأ Phase 8 (Backend Foundation) — بانتظار تعليمات صريحة.**

