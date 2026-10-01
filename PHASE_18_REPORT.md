# PHASE_18_REPORT — Personnel Rules Engine: Leaves + Time Permissions

> المرجع الملزم: `ALSQAYA_PLAN.md` §34 (مع §7.9 · §7.10 · §7.11 · §14 · §15 ·
> §31 · §32 · §33 · §53 · §54 · §56 · §57).
> هذا التقرير يتبع بروتوكول §53 (عشرة بنود) ولا يعيد تعريف المرحلة ولا يوسّعها.
> **لا تُنفَّذ أي مرحلة لاحقة** (§60: لا انتقال تلقائي).

---

## 1. حالة المرحلة

**مكتملة ومختبرة.** المتطلبات المنصوص عليها في §34 نُفِّذت على الخادم، بلا
اختيار لأي قرار لم تحسمه الخطة:

| بند §34 | الحالة | الموضع |
|---|---|---|
| منفَّذ عن React | ✅ | `server/src/services/personnelRules.ts` — لا React ولا `localStorage` ولا مكوّنات عرض (حارس بنيوي في `tests/scope.test.ts`) |
| Service Records → Accrual Engine → Leave Balance → Leave Ledger | ✅ | `accrueAnnual` من `employees.joined_date` → `annual_*` → حركة `accrual` |
| Time Permission → Minutes Engine → 420 minutes → Emergency Conversion → Emergency Balance | ✅ | `registerTimePermission` → `convertMinutesForRecord` |
| الاعتيادية: كل 10 أيام = +1 | ✅ | `annualAccrualFromServiceDays` |
| remainder محفوظ | ✅ | `annual_remainder_days` (CHECK `0..9`) ولا يُصفَّر بتغيّر السنة |
| carry over سنوي | ✅ | `openYear` ينسخ رصيد السنة السابقة + حركة `opening_balance` |
| max 180 | ✅ | `applyAnnualCap` + قيود CHECK على الأرقام في القاعدة |
| «لا قرار آلي عند تجاوز 180» | ✅ | الفائض في `annual_pending_days` كحالة صريحة + حركة تسجيل بقيمة صفر (§56.1) |
| الطارئ: reset إلى 15 سنوياً | ✅ | `openYear` + حركة `accrual` مقدارها 15 |
| no carryover للرصيد نفسه | ✅ | `openYear` يضبط 15 دائماً؛ الدقائق المتبقية وحدها تُرحَّل (§14.3) |
| الزمنيات: مدة بالدقائق | ✅ | `duration_minutes` محسوبة في المحرّك ومخزّنة، **غير مقبولة من العميل** |
| 420 دقيقة = يوم طارئ | ✅ | `minutesToEmergencyDays` |
| remainder minutes carry forward | ✅ | `emergency_remainder_minutes` يُرحَّل في `openYear` |
| تجاوز 4 ساعات أسبوعياً يسجَّل ولا يمنع | ✅ | `exceedsWeeklyLimit` في الاستجابة؛ لا رفض ولا حذف (اختبار صريح) |
| نفاد الطارئ | ✅ | `splitEmergencyConversion` + عدّاد `unpaid_days` |
| المرضية 45/45/الباقي | ✅ | `sickBandSplit` — **بلا تراكم ولا reset** (الفترة غير محسومة) |
| الحج والعمرة 30/12 مرة واحدة | ✅ | `assertOncePerService` ⇒ 409 `ONCE_PER_SERVICE_ALREADY_USED` |
| بدون راتب: نوع مستقل | ✅ | عدّاد `unpaid_days` بلا سقف (§14.10 غير محسوم) |
| افتتاح الرصيد | ✅ | `recordOpeningBalance` — نقطة موثّقة، ولا إعادة ضبط صامتة |
| Leave Ledger: حركة قابلة للتتبع والعكس | ✅ | كل كتابة رصيد داخل معاملة واحدة مع صف `leave_ledger` |

---

## 2. الملفات التي تغيرت

### جديد — القاعدة (1)
`server/migrations/0011_leave_rules.sql` — إضافة فقط فوق 0003: تسعة أعمدة
رصيد محسوبة في `leave_balances` · `unit` · `reverses_ledger_id` ·
`time_permission_id` · `year` (مولَّد) في `leave_ledger` · توسيع قائمة أنواع
الإجازة المعتمدة في §14.

### جديد — الخادم (7)
`server/src/services/personnelRules.ts` (المحرّك كاملاً: الثوابت + الدوال
الخالصة + العمليات الذرّية) · `server/src/services/personnelErrors.ts` ·
`server/src/services/index.ts` · `server/src/repositories/leaveBalanceRepository.ts` ·
`server/src/repositories/leaveLedgerRepository.ts` ·
`server/src/api/validation/leaveBalanceValidators.ts` · `.gitkeep` المحذوف.

### جديد — الاختبارات (4)
`server/tests/personnelRules.test.ts` (القواعد الخالصة) ·
`server/tests/db/leaveRulesEngine.test.ts` (المعاملات والـledger) ·
`server/tests/api/leaveRules.test.ts` (المسار الكامل عبر HTTP) ·
`server/tests/transactionPatchPayload.test.ts` (انحدار الإصلاح القديم الأول).

### مُعدَّل — نموذج المجال (3)
`src/core/models/employeeLeave.ts` (أنواع مستقلة: `emergency` · `hajj` ·
`umrah` · `study` · `BALANCE_BEARING_LEAVE_TYPES` · الرصيد بحقوله المحسوبة ·
`LeaveLedgerEntry` · `LeaveMovementType` · `LeaveLedgerUnit`) ·
`src/core/models/employeeTimePermission.ts` (`durationMinutes` في النموذج —
مصدر الحقيقة الوحيد) · `src/core/models/personnelCatalogs.ts`.

### مُعدَّل — المستودعات (5)
`repositories/contracts.ts` · `leaveRepository.ts` (ترويسة فقط) ·
`timePermissionRepository.ts` (`sumMinutesBetween` · `listUnconverted`) ·
`index.ts` (تصدير المستودعين الجديدين).

### مُعدَّل — الـAPI (12)
`services/personnelService.ts` · `services/index.ts` · `dto/personnel.ts` ·
`controllers/personnelController.ts` · `routes/personnelRoutes.ts` ·
`routes/resourceRoutes.ts` · `routes/index.ts` ·
`validation/personnelValidators.ts` · `validation/catalogs.ts` ·
`validation/fields.ts` (`integerCount`) · `validation/index.ts` ·
`validation/transactionValidators.ts` (تصدير `TRANSACTION_PATCH_FIELDS`).

### مُعدَّل — الواجهة (3)
`src/App.tsx` (بناء جسم PATCH في نقطة واحدة — الإصلاح القديم الأول) ·
`src/services/transactionPatchPayload.ts` (جديد) · `src/services/index.ts`.

### مُعدَّل — الاختبارات (5)
`tests/db/migrations.test.ts` (11 إصدارات + تراجع 0011) · `tests/scope.test.ts`
(حارس `services` صار منفَّذاً + حارس «لا حساب رصيد في الواجهة») ·
`tests/api/personnel.test.ts` · `tests/api/availability.test.ts` ·
`tests/api/apiTestData.ts`.

---

## 3. الملفات التي لم تُمسّ عمداً

- **`server/migrations/0003_personnel.sql`** — مُطبَّق؛ تعديله يكسر `checksum`.
  كل إضافة في `0011`.
- **`PHASE_17_REPORT.md`** — لم يُعدَّل لتغيير التاريخ؛ إصلاحات الصيانة في §9.
- **`authorization/permissions.ts`** و`requirePermission.ts` — **لا صلاحية ولا
  دور جديد**: المسارات الجديدة على خريطة §28 القائمة
  (`GET`←`view` · `POST`←`create`).
- **مكوّنات React** — لا شاشة جديدة. المحرك على الخادم، والواجهة تقرأ ناتجه.
- **`src/api/apiDataAdapter.ts` · `localDataAdapter.ts`** — عقد القراءة لم يتغيّر.
- **`audit/`** — لم تُضَف أحداث تدقيق لقواعد الإجازات: §31 لم تحدّد أنواعاً
  جديدة، و`AuditEventKind` مقفول على قائمة المراحل السابقة.
- **`README.md` المخطّط** — انظر §7 و§12.

---

## 4. قرارات تقنية (داخل حدود الخطة)

| القرار | السند |
|---|---|
| المحرك في `server/src/services/personnelRules.ts` | §34 «يجب أن ينفَّذ منفصلاً عن React»؛ `services/` كانت محجوزة صامتة منذ Phase 8 |
| `annual_pending_days` عمود في القاعدة | §14.1 «لا يُخترع سلوك» ⇒ الاستحقاق يُحفظ كحالة صريحة بدل حذفه أو تجاوز السقف |
| `unit` في الـledger (`day`/`minute`) | §14.3 المدة بالدقائق؛ بدون الوحدة تختلط 420 دقيقة بيوم في `amount`/`balance_after` |
| `year` عمود مولَّد من `occurred_on` | كل حركة تُنسب لسنة رصيدها من تاريخها؛ لا يُرسل العامل ولا يمكن أن يتعارض |
| `reverses_ledger_id` مفتاح أجنبي على نفسه | §15 «رابط صريح» بين الحركة والعكس — قيد علاقة في القاعدة لا اصطلاح في التطبيق |
| `updateNumeric` بشروط القيم الحالية | مبدأ Phase 17 على صف الرصيد: لا كتابة فوق الأحدث |
| كل كتابة مركّبة داخل `withTransaction` | §33 «database transactions للعمليات المركبة» |
| الاستحقاق يُقاس من `employees.joined_date` | §7.2 «تاريخ الخدمة/الانتساب» — الحقل الموجود فعلاً في المشروع |
| `durationMinutes` محذوف من مُحقِّق الإدخال | §14.3 «المدة المحسوبة» + قاعدة «لا مصدرين للحقيقة» |
| `timeOut`/`timeIn` غير قابلين للتعديل بعد التسجيل | التحويل تمّ؛ تغييره يحتاج عكساً وتحويلاً جديدين موثّقين (§15) لا تعديلاً صامتاً |
| `notes` إلزامي في الافتتاح والتصحيح | §34 «نقطة بداية موثّقة» · §15 «تصحيح إداري موثق» |
| القوائم تُقرأ بلا رصيد مكرر لكل صف | الرصيد سنة واحدة لا صفاً لكل سجل؛ تكراره في كل صف يخالف «لا تكرار للبيانات» (§9) |
| `PATCH /leaves/:id {status:'cancelled'}` يولّد العكس | مسار واحد للإلغاء بدل مسارين يختلفان في الأثر |
| فحص «مرة واحدة في الخدمة» قبل إنشاء السجل | الفحص بعده يجعل السجل الجديد سبباً لرفضه ويترك صفاً يتيم |

---

## 5. قرارات غير محسومة — ما **لم** يُنفَّذ

هذه بنود نصّت الخطة على أنها غير محسومة، ولم يُخترع لها سلوك:

1. **ما فوق 180 يوماً (§14.1 · §56.1).** لم يُمنح فائضاً ولا يُهدر ولا
   يُلغى: يُحفظ في `annual_pending_days` كحالة صريحة. القرار معلّق بانتظار
   المرجع الرسمي.
2. **فترة قياس شرائح المرضية (§14.6).** لم يُفترض سنة ولا دورة خدمة ولا
   `lifetime`، ولا يوجد أي `reset` تلقائي ولا تراكم عبر السجلات.
   `sickBandSplit` دالة خالصة بلا حالة: تأخذ عدد الأيام صراحةً وتُعيد
   التقسيم فقط. **الفترة تبقى غير محسومة** ومكتوبة كذلك في توثيق الدالة.
3. **الحد العام للإجازة بدون راتب (§14.10 · §56.2).** `unpaid_days` عدّاد
   بلا سقف ولا حد.
4. **التفاصيل الرقمية للإجازة الدراسية (§14.9 · §56.3).** لا رصيد تلقائي:
   اختبار صريح يُثبت أن التسجيل ينجح و`balance === null`.
5. **الزمنية التي تعبر منتصف الليل.** الخطة لم تحسم سياسة، فـ`timeIn <= timeOut`
   لا يُشتق لها مدة ولا تُضاف 24 ساعة افتراضياً: تبقى بلا مدة ولا تحويل.
6. **تعريف «خدمة المنتسب» للحج/العمرة.** لم يُخترع سجل تواريخ خدمة منفصل:
   المعيار وجود إجازة سابقة **غير ملغاة** من نفس النوع في سجلات المنتسب
   (مصدره سجل الإجازات نفسه وهو ما نصّت عليه الخطة).
7. **لحظة اقتطاع الإجازة من الرصيد.** الخصم يقع عند إنشاء السجل ما لم تكن
   حالته `cancelled` — قرار تقني داخل حدود النص وموثّق هنا. **Workflow
   الاعتماد مرحلة لاحقة (§35 · Phase 19) ولم يُنفَّذ.**

---

## 6. الاختبارات

| الملف | ما يغطّيه |
|---|---|
| `server/tests/personnelRules.test.ts` | الثوابت · الاستحقاق (0/9/10/20/remainder/سقف 180) · 420/840/مثال 16 ساعة · نفاد الطارئ · شرائح المرضية · الحد الأسبوعي · المدة · أنواع الإجازة |
| `server/tests/db/leaveRulesEngine.test.ts` | المعاملات · الترحيل السنوي · الاستحقاق التراكمي · التحويل ومنع التحويل المزدوج · الحركات والإلغاء والعكس والربط · الافتتاح والتصحيح · الحج/العمرة · الدراسة · قفل صف الرصيد · الفشل لا يترك نصف كتابة |
| `server/tests/api/leaveRules.test.ts` | المسار الكامل: قراءة الأرصدة/الحركات · الافتتاح والتصحيح (400/409) · المدة المحسوبة ورفض الإرسال · مؤشر الأسبوع بلا منع · الخصم والنقص · الإلغاء والرابط · الحج/العمرة · الدراسة · انعدام مسار التعديل المباشر |
| `server/tests/transactionPatchPayload.test.ts` | الإصلاح القديم الأول (انحدار) |
| `server/tests/db/migrations.test.ts` | ترحيل 0011 صعوداً وهبوطاً |

### تغطية المتطلبات المطلوبة

| المطلوب | مغطّى في |
|---|---|
| 0 · <10 · 10 · 20 · remainder · carryover · 180 · ما بعد 180 | `personnelRules` + `db` |
| الطارئ: 15 · استخدام جزئي · لا ترحيل · لا سالب | `db` |
| المدة: حسابها · تخزينها · <420 · 420 · 840 · تحويل+باقٍ · ترحيل الباقي · تجاوز الأسبوع بلا منع | `personnelRules` + `db` + `api` |
| نفاد الطارئ: كامل · جزئي · بلا رصيد · بدون راتب · لا سالب | `personnelRules` + `db` |
| المرضية: 1–45 · 46–90 · >90 · لا reset تلقائي | `personnelRules` |
| الحج/العمرة: أول استخدام · رفض الثاني | `db` + `api` |
| الدراسية: نوع مستقل · بلا رصيد مخترَع | `db` + `api` |
| Opening Balance: الإدخال · الظهور في السجل · التأثير · لا تعديل مباشر | `db` + `api` |
| Ledger: كل الحركات السبع · الربط · بقاء التاريخ | `db` + `api` |
| الذرّية | `db` (معاملة + قفل شرطي) |

---

## 7. نتائج التشغيل

| الأمر | قبل Phase 18 | بعد Phase 18 |
|---|---|---|
| `npm run test:server` | ✅ 117 | ✅ 162 |
| `npm run test:db` | ✅ 57 | ✅ 92 |
| `npm run test:api` | ✅ 156 | ✅ 173 |
| `npx tsc --noEmit` | ❌ 6 أخطاء قديمة | ✅ **صفر** |
| `npm run lint` | ❌ (= tsc، الأخطاء نفسها) | ✅ نجح |
| `npm run build` | ✅ نجح | ✅ نجح |

لا regressions: كل اختبارات المراحل 0–17 السابقة ما زالت تنجح. الفروقات
في العدّ محصورة في اختبارات Phase 18 الجديدة وفي تحديثات عقد موثّقة
(انظر §8).

---

## 8. الواجهة البرمجية وتغييرات العقد

### المسارات (الحد الأدنى اللازم لـ Phase 18)

```text
GET  /api/leave-balances?employeeId&year    قراءة الأرصدة        → view
POST /api/leave-balances/opening           نقطة بداية موثّقة    → create
POST /api/leave-balances/adjustment        تصحيح إداري موثّق    → create
GET  /api/leave-ledger?employeeId&year…    قراءة سجل الحركات    → view
POST /api/leaves/:id/cancel                إلغاء: حركة عكسية   → create
```

**لا صلاحية ولا دور جديد**، ولا مسار لتعديل رقم رصيد مباشرة (§15): كل كتابة
تمرّ بالافتتاح أو التصحيح، وكلاهما ينشئ حركة في السجل.

### تغييرات عقد (مقصودة وموثّقة)

| التغيير | السبب |
|---|---|
| `POST/PATCH/GET /api/leaves[/:id]` تعيد `{ leave, balance, unpaidDays }` | المحرك يحسب الرصيد على الخادم، فيقرأه العميل من مصدر واحد (§34) |
| `POST/PATCH/GET /api/time-permissions[/:id]` تعيد `{ record, balance, weeklyMinutes, exceedsWeeklyLimit, … }` | المدة محسوبة ومؤشر الأسبوع قياس لا قرار (§14.3 · §14.4) |
| `durationMinutes` لم يعد مقبولاً في جسم الطلب ⇒ 400 | §14.3 «المدة محسوبة ومخزّنة» — لا مرسل ولا مشتقّ في مكانين |
| `timeOut`/`timeIn` غير قابلين للتعديل بعد التسجيل ⇒ 400 | تغيير المدة بعد التحويل يحتاج عكساً وتحويلاً جديدين موثّقين (§15) |

### حدود الـAPI التي لم تُتجاوز
- `EmployeeRepository` و`LeaveRepository` و`TimePermissionRepository` و
  `LeaveBalanceRepository` و`LeaveLedgerRepository`: **بلا `delete`** — لا حذف
  ولا محو (§15/§32).
- لا مسار `POST /leaves/:id/approve`: **Workflow مرحلة لاحقة** (§35 · Phase 19).

---

## 9. Legacy fixes outside Phase 18

إصلاحات قديمة **خارج نطاق قواعد Phase 18**، لا تُنسب إليها:

### 9.1 إصلاح `handleSaveTransaction` (الواجهة)

- **العيب:** `src/App.tsx` كان يرسل
  `updateTransaction(normalized.id, { ...normalized, expectedVersion })` — أي
  كائن `Transaction` كاملاً — فيرفضه مُحقِّق `PATCH` على الخادم بـ400
  `noUnknownFields` لحقول `id` · `month` · `createdAt` · `updatedAt` ·
  `employeeIds` (وحقول قراءة أخرى). قائم منذ **Phase 10** وموثّق في تقرير
  Phase 17 كقيد مفتوح لم يُعالَج.
- **الإصلاح:** دالة `buildTransactionUpdatePatch` في
  `src/services/transactionPatchPayload.ts` تبني الجسم من قائمة حقول صريحة
  + `expectedVersion: transaction.version` + المرفقات بصيغة `AttachmentInput`
  (بلا معرّفات ولا حقول عرض). `App.tsx` يناديها في `handleSaveTransaction`.
- **لماذا لم نضعف `noUnknownFields` ولم نوسّع `UpdateTransactionDto`:** تلك
  حقول للقراءة أو مشتقّة (`month` يُشتق في الخادم من `date`)؛ قبولها يجعل
  العميل صاحبها فينشأ مصدران للحقيقة، وتعطيل `noUnknownFields` يزيل
  بالضبط الحارس الذي كشف العيب.
- **لماذا دالة مستقلة لا حقلاً حقلاً داخل component:** قائمة الحقول يجب أن
  تكون مصدراً واحداً مُختبَراً. البناء في دالة يجعل أي كسر لاحق (حقل جديد
  بلا تحديث القائمة) خطأ اختبار ظاهراً، وهو ما لا يوفّره `...normalized`.
- **الاختبار:** `server/tests/transactionPatchPayload.test.ts` — يمرّر الجسم
  الناتج على **مُحقِّق الخادم الحقيقي** `updateTransactionBody` ويتوقع
  `valid`، ويمرّر السلوك القديم `{...transaction}` ويتوقع `invalid` (إثبات
  أن الاختبار يلتقط العيب فعلياً)، ويقارن قائمة الحقول بعقد الخادم.
  **بلا `as any` وبلا إسكات.**

### 9.2 إصلاح أخطاء TypeScript الستة في `availability.test.ts`

| # | الخطأ (Phase 13) | الإصلاح |
|---|---|---|
| 1 | `phoneNumber` غير موجود في `NewAccountOptions` | `phone` — الاسم الصحيح في العقد منذ Phase 11 |
| 2 | `visibility` غير موجود في `TransactionBody` | أُضيف `visibility?: string` إلى `TransactionBody` — حقل **قراءة** في `TransactionDto` منذ Phase 10 |
| 3 | `JsonResponse<TransactionBody>` غير قابل للإسناد إلى `JsonResponse<ApiErrorBody>` | متغيّر لكل قراءة بنوعه الصحيح: `hiddenBefore` (خطأ) ثم `visibleAfter` (كتاب) |
| 4 | `.id` على `ApiErrorBody` | تابِعة للسلوك السابق: المتغيّر الصحيح `visibleAfter.body.id` من نوع `TransactionBody` |
| 5–6 | `subject` غير موجود في `TransactionBody` | أُضيف `subject: string` — حقل **قراءة** في `TransactionDto` |

**لم يُستخدم** `as any` ولا `@ts-ignore` ولا تعطيل `strict` ولا تعديل
`tsconfig`. الإصلاحان في `apiTestData.ts` **يضيفان حقول قراءة ناقصة فقط** ولا
يمسّان عقد الـPATCH ولا دلالة الاختبار (403/404 وتسرّب النطاق). النتيجة:
**صفر أخطاء TypeScript** على كامل المشروع.

---

## 10. مثبّتات صريحة (Checklist)

- [x] المحرك على الخادم؛ **لا** `if minutes >= 420` ولا `if balance > …` ولا
      نسخة من ثوابت §14 في `src/` — حارس بنيوي جديد في `tests/scope.test.ts`
      يفحص مجلد الواجهة كاملاً.
- [x] لا تعديل لأي migration مُطبَّق؛ كل إضافة في `0011` مع تراجع نظيف.
- [x] لا كتابة رصيد بلا حركة `leave_ledger` (اختبار صريح).
- [x] الإلغاء ينشئ حركة عكسية **مرتبطة** بـ`reverses_ledger_id`، ولا يحذف
      ولا يمحو السجل ولا الحركة الأصلية.
- [x] `leave_balances` خرج من التعريف الهيكلي وصار يحمل الرصيد المحسوب.
- [x] المدة بالدقائق **مصدر حقيقة واحد** (نموذج + عمود)، لا مرسل ولا مشتقّ.
- [x] **لا** Phase 19/20 · لا Workflow · لا طلبات · لا إشعارات · لا OCR · لا
      حضور/بصمة · لا باحثون · لا نشر عن بُعد · لا نسخ احتياطي جديد.
- [x] **لا** صلاحية أو دور جديد · **لا** واجهة React جديدة.

---

## 11. تحليل صريح لقرارات الواجهة

**ما لم يُنفَّذ ولم يُخفى:** لم يُبنَ أي شاشة تعرض الرصيد في React. القراءة
متاحة على `/api/leave-balances` و`/api/leave-ledger`، والواجهة ستستهلكها في
مرحلة واجهة لاحقة. هذا مقصود: §34 يشترط استقلال المحرك عن React، وPhase 18
لا تذكر أي شاشة.

---

## 12. Git

- **Branch:** `phase-10-api-data-layer` (كما في كل المراحل السابقة) — لا تغيير
  فرع ولا `reset` ولا `rebase`.
- **Commits:** يُسجَّلان هنا بعد التنفيذ.

**STOP** — لا تبدأ أي مرحلة لاحقة.