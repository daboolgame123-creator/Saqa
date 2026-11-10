# PHASE 10 REPORT — API Data Layer / الانتقال من LocalStorage إلى API

**الحالة:** مكتملة ومختبرة ومثبَّتة.
**نقطة الانتقال التالية:** Phase 11 — Authentication / الحسابات / الجلسات.

---

## 1. نطاق Phase 10

المرجع: `ALSQAYA_PLAN.md` §26.

**الهدف:** فصل UI عن التخزين المحلي ونقل القراءة والكتابة بالتدريج.

| بند الخطة | الحالة |
|---|---|
| API client | ✅ `src/api/apiClient.ts` + `apiError.ts` |
| DTOs | ✅ `server/src/api/dto/` (ملف لكل مورد) |
| mapping بين DTO و Domain | ✅ `recordMappers.ts` (←) و `inputMappers.ts` (→) و `src/api/mappers.ts` |
| repository adapters | ✅ `apiDataAdapter.ts` + `localDataAdapter.ts` خلف عقد واحد |
| server-side validation | ✅ `server/src/api/validation/` لكل مورد |
| fallback Local Adapter | ✅ `localDataAdapter.ts` (للتطوير/الاختبار فقط) |

**ترتيب النقل المنفَّذ (6/6):**
1. Employees · 2. Transactions · 3. TransactionEmployee ·
4. Daily Situation · 5. Personnel records · 6. Timeline reads

**لم يُنفَّذ عمداً** (خارج النطاق): Auth · RBAC · Access Scope · استيراد الأرشيف · Soft Delete.

---

## 2. ما تم تنفيذه

### 2.1 الخادم — `server/src/api/`
```
api/
  dto/          ملف لكل مورد + recordMappers + inputMappers + index
  validation/   primitives · objectValidators · fields · catalogs
                + مُحقِّق لكل مورد + validateApiRequest
  services/     index + خدمة لكل مورد فوق مستودعات Phase 9
  controllers/  index + معالجات + shared
  routes/       resources · personnelRoutes · resourceRoutes · index
  serviceContext.ts  حقن الخدمات في الطلب (بلا تفرّع في الإنتاج)
  errors/       ResourceNotFoundError (404 بمستوى المورد)
```

**المسارات:** `/api/employees` · `/api/transactions` · `/api/transaction-employees` ·
`/api/daily-situations` · `/api/leaves` · `/api/time-permissions` ·
`/api/assignments` · `/api/courses` · `/api/timeline`.

### 2.2 الواجهة — `src/api/` + `src/core/interfaces/dataAdapter.ts`
- `apiClient.ts` — غلاف fetch بمهلة و`AbortSignal`، وترجمة الأخطاء إلى `ApiError` برموزها الثابتة.
- `apiError.ts` — عقد الخطأ + تمييز `VALIDATION_ERROR` / `RESOURCE_NOT_FOUND`.
- `mappers.ts` — DTO ← Domain (نقل فقط، بلا اشتقاق ولا fabrication).
- `apiDataAdapter.ts` · `localDataAdapter.ts` — تنفيذان خلف `IDataAdapter` نفسه.
- `index.ts` — نقطة الاختيار: `api` افتراضياً، `local` بإعداد صريح.

### 2.3 توصيل `App.tsx`
- القراءة الافتتاحية صارت غير متزامنة عبر `primeDataSource()` مع مؤشر تحميل.
- الحفظ صار **عمليات مفردة** عبر `persist()` بدل `saveX(كل المجموعة)`.
- عند فشل الكتابة: إعادة قراءة من المصدر (مصدر حقيقة واحد لا نسختان).
- الوضع الليلي بقي على `localStorage` (تفضيل جهاز لا بيانات نطاق المرحلة).

---

## 3. قرارات معمارية

| القرار | السبب |
|---|---|
| عقد جديد `IDataAdapter` غير متزامن بدل تعديل `IDataStorage` | `IDataStorage` متزامن؛ عميل HTTP لا يحقّقه. تعديله يمسّ 28 استدعاءً ويلغي LocalStorage للوضع الليلي. العقدان معاً أنظف. |
| المعرّف يولّده الخادم (uuid) لا الواجهة | القاعدة `uuid PRIMARY KEY`؛ و`emp-1`/`tr-001` ليست uuid. الحالة تُبنى بالمعرّف الحقيقي المُعاد. |
| عمليات مفردة لا استبدال مجموعة | الكتابة تصبح ولاية على سجل واحد بدل إعادة إرسال الجدول كاملاً. |
| `month` مشتق في الخادم وغير مقبول كمدخل | نموذج `Transaction`: الشهر مشتق من التاريخ، لا حقل مستقل. |
| التواريخ التقنية لا تُقبل في Create/Update DTO | فصل «شكل النقل» عن «مدخل التخزين» (انظر `inputMappers.ts`). |
| الخدمات تُحقن عبر `res.locals` | الإنتاج: خدمات مشتركة. الاختبار: خدمات Pool معزول. بلا تفرّع في كود الإنتاج. |

---

## 4. أهم إصلاح: ترميز قاعدة البيانات

**العطل:** كل إنشاء كتاب برقم رسمي عربي (`١٠٠/ص`) يعيد **500**:
`character with byte sequence 0xd9 0xa1 in encoding "UTF8" has no equivalent in encoding "WIN1256"`.

**السبب — مستويان:**

1. **على مستوى الجلسة:** العنقود المُدمج/المحلي يُنشأ بلغة النظام، فيصبح WIN1256 على جهاز
   عربي. وU+0660–U+0669 (الأرقام العربية الهندية — نظام أرقام الكتب الرسمي) **خارج نطاق
   cp1256**، فيرفضها الخادم. حُلّ في `createPool` بـ`options: '-c client_encoding=UTF8'`
   (حقل `pg` يُرسل كـstartup parameter، ولا يصلح وضعه في الرابط النصي).

2. **على مستوى التهيئة:** `initdb` يقرأ مسار التنفيذ نفسه. على مسار مشروع عربي
   (`F:\حامل الواء\…`) يفشل بـ«invalid byte sequence for encoding UTF8». **تحقّق ذلك
   عملياً**: تشغيل نفس `initdb.exe` من مسار ASCII نجح. حُلّ في `testDb.ts` بنسخ
   `node_modules` إلى مرآة ASCII وتشغيل `embedded-postgres` منها (لا يفعل شيئاً إن كان
   المشروع أصلاً في مسار ASCII).

> Phase 9 لم يظهر هذا العطل لأن اختباراته كانت ببيانات ASCII فقط.

**حارس دائم:** اختبار في `server/tests/scope.test.ts` يرفض محارف Presentation Forms
ومحتوى اللاتيني بلا حروف عربية — يمنع تكرار تلف الترميز الصامت.

---

## 5. الاختبارات

| المجموعة | العدد | النتيجة |
|---|---|---|
| `npm run test:server` | 56 | ✅ |
| `npm run test:db` | 43 | ✅ |
| `npm run test:api` | 60 | ✅ |
| **المجموع** | **159** | **✅** |

**تغطية الـAPI (43 اختباراً على PostgreSQL مدمجة فعلية):** round-trip لكل مورد من الستة،
تصفية، 400 للتحقق (ناقص/زائد/قيمة غير معروفة)، 404 للغياب، قيد FK، اشتقاق الشهر،
إلزامية سبب انتهاء الخدمة، حذف الرابط لا يلمس طرفَيه، الخط الزمني بلا جدول،
ورفض المصدر المحجوز.

**تغطية الواجهة (17 اختباراً):** تحويل DTO ← Domain (وغياب الحقول لا ينتج مفاتيح
`undefined`)، بناء الروابط وترميزها، ترجمة الأخطاء، 204 بلا جسم، الشبكة الفاشلة،
ومسارات `ApiDataAdapter` مقابل fetch مزيف.

`npm run lint` (tsc) و`npm run build` يمرّان بلا أخطاء.

---

## 6. تغيّرات على اختبارات سابقة (مبرَّرة)

| الملف | التغيير | السبب |
|---|---|---|
| `tests/health.test.ts` | readiness صار يفحص `database` | فحص القاعدة مؤجَّل من Phase 9 إلى Phase 10 |
| `tests/errors.test.ts` | حُذف `/api/employees` و`/api/transactions` من قائمة «المسارات غير الموجودة» | صار لهما مسار في Phase 10 |
| `tests/scope.test.ts` | `services/` و`validation/` لم يعودا `.gitkeep` + حارس الترميز | نُفِّذت طبقة `api` |

---

## 7. الملفات المهمة

### جديد — الخادم
`server/src/api/` بالكامل: `dto/` · `validation/` · `services/` · `controllers/` ·
`routes/` · `serviceContext.ts` · `errors/`.

### جديد — الواجهة
`src/api/apiClient.ts` · `apiError.ts` · `mappers.ts` · `apiDataAdapter.ts` ·
`localDataAdapter.ts` · `index.ts` · `src/core/interfaces/dataAdapter.ts` · `src/vite-env.d.ts`

### جديد — الاختبارات
`server/tests/api/`: `apiTestHelpers.ts` · `apiTestSuite.ts` · `apiTestData.ts` ·
`employees.test.ts` · `transactions.test.ts` · `links.test.ts` ·
`dailySituations.test.ts` · `personnel.test.ts` · `timeline.test.ts` · `apiClient.test.ts`

### مُعدَّل
`server/src/routes/index.ts` · `server/src/database/pool.ts` ·
`server/src/health/readinessService.ts` · `server/src/controllers/healthController.ts` ·
`server/tests/db/testDb.ts` · `package.json` · `.gitignore` · `.env.example` ·
`src/App.tsx` · `src/components/views/EmployeesView.tsx` · `src/core/models/employee.ts`

---

## 8. تقييدات معروفة (موثّقة لا مُخفاة)

| البند | الحالة | المرحلة المسؤولة |
|---|---|---|
| **لا مصادقة على المسارات** | أي طلب يصل بلا هوية — `auth`/`authorization` محجوزتان | Phase 11/12 |
| **لا RBAC ولا Access Scope** | لا تحقق من صلاحية ولا من نطاق رؤية | Phase 12/13 |
| **حذف الكتاب غير منفذ** | لا مسار DELETE في الـAPI (الخطة §13 تمنعه). الحذف في الواجهة **محلي فقط** ولا يُحفظ في القاعدة | Phase 16 (Soft Delete) |
| **حذف الموظف = نقل إلى «موظف سابق»** | مع سبب إلزامي يُختار من القيم المعتمدة (§13) | — (منفَّذ) |
| **بيانات الاختبار لا تُزرع في القاعدة** | `localStorage` القديمة لا تُرحَّل تلقائياً؛ القاعدة تبدأ فارغة | Phase 33 (Test Seed) |
| **mock data نصية** | `emp-1`/`tr-001` غير uuid فلا تصلح للقاعدة — للـLocal Adapter فقط | — |
| **مرفقات Base64** | حقول `previewUrl`/`isImage` لا تُنقل عبر الـAPI | Phase 14/17 |
| **fallback التلقائي للمحلي** | عند فشل أول تحميل فقط، مع تحذير صريح. بعد نجاح أول تحميل لا تبديل صامت | — (مقصود) |

---

## 9. حالة الإغلاق

- ✅ **نطاق Phase 10 كامل** — كل بند من بنود الخطة، وترتيب النقل الستة، والمعيار:
  الواجهة تقرأ وتكتب عبر API/DB بلا فقد بيانات في round-trip.
- ✅ **التحقق على الخادم** لكل مورد؛ `month` مرفوض كمدخل؛ سبب انتهاء الخدمة إلزامي.
- ✅ **لا اختراع** — كل قيمة من كتالوج معتمد أو قيد CHECK؛ القيم مشتقة من مفاتيح
  كتالوجات النماذج.
- ✅ **الترميز** — الأرقام العربية الهندية تمرّ عبر القاعدة فعلياً (مختبَرة).
- ✅ **اختبارات** — 159/159 خضراء؛ `tsc` و`build` نظيفان.
- ✅ **لا بيانات حقيقية** — كل ما يُزرع اصطناعي داخل `alsqaya_test` المعزولة.
- ✅ **لا أسرار** — `VITE_*` توثيق في `.env.example` بلا قيم حساسة.
- ✅ **لم تُنفَّذ** أي مرحلة من Phase 11+.

**Phase 10 = مكتملة.**

---

## 10. ملاحظة على التنفيذ

أعطت التحريرات المجمّعة للملفات العربية مواضع **فاسدة بصمت** (نص يبدو سليماً في
الطرفية لكن قيمته مختلفة عن الأصل). كُشف ذلك بمقارنة قيمة اختبار بقيم الكتالوج،
وأُصلح بتمرير الترميز العكسي عبر cp1256، ثم أُضيف حارس ترميز دائم في
`scope.test.ts` — راجِعه عند أي إعادة كتابة مجمّعة لاحقة.
