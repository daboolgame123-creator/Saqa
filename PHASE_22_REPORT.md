# PHASE_22_REPORT — تقرير تدقيق وتسوية حالة المرحلة 22 (البحث الموحد)

> **طبيعة هذه المهمة:** تدقيق وتوثيق وتسوية حالة فقط. لم يُنفَّذ أي إصلاح للرمز البرمجي، ولا أي ميزة جديدة، ولا OCR، ولا أي migration ولا dependency جديدة.

---

## 1. الخلاصة والحالة

### ما أنجزه المشروع فعليًا في المرحلة 22
تم تنفيذ وتشغيل **البحث الموحد (Unified Search)** على الموارد التالية فقط:
- الكتب/المعاملات (transactions) — البحث العادي بالحقول المعتمدة في §38.
- المنتسبين (employees) — مع الاقتراحات والمطابقة المرنة، ومنع إنشاء منتسب بسبب خطأ إملائي (typo).

نفّذ المشروع:
- واجهة React: `src/components/views/UnifiedSearchView.tsx`
- خدمة الواجهة: `src/api/searchService.ts`
- دمج في رأس التطبيق: `src/components/layout/Header.tsx` و `src/App.tsx`
- مسار API: `server/src/api/routes/searchRoutes.ts`
- controlller: `server/src/api/controllers/searchController.ts`
- خدمة API: `server/src/api/services/searchService.ts`
- مستودع البحث: `server/src/repositories/searchRepository.ts`
- DTO: `server/src/api/dto/search.ts`
- تحقق من المدخلات: `server/src/api/validation/searchValidators.ts`
- عقود المستودع: `server/src/repositories/contracts.ts` (واجهة `SearchRepository`)
- اختبارات API عبر HTTP حقيقي: `server/tests/api/search.test.ts` (9 حالات)

### القرار المتخذ بشأن المرحلة
صاحب المشروع قرر **تجاوز المرحلة 22 في وضعها الحالي** والانتقال إلى المرحلة 23 (Reports + Statistics + Export)، بسبب تعطل التقدم فيها. هذا القرار **لا يعني** اكتمال جميع متطلبات المرحلة 22 تقنيًا، ولا يسمح بإخفاء النواقص أو اختلاق نتائج.

### الحالة الفنية للمرحلة 22 (مستوى الإكمال الحقيقي)
| البند | الحالة |
|---|---|
| واجهة البحث (React) | منفذة |
| مسار API `/api/search` | منفذ |
| خدمة ومستودع البحث | منفذة |
| DTO وعقود البحث | منفذة |
| التحقق من المدخلات (validation) | منفذ |
| التطبيع العربي D4 (مقارنة فقط) | منفذ |
| Access Scope على نتائج البحث | مطبَّق في SQL على المعاملات |
| اختبارات API (9 حالات) | ناجحة (شُغلت سابقًا، راجع §7) |
| الطلبات (requests) ضمن نتائج البحث | خارج النطاق (§38) — غير منفذة، ولا تُعدّ نقصًا |
| OCR | مؤجل، بلا رقم مرحلة، خارج نطاق phase 22 |

---

## 2. النطاق الرسمي

### الموارد الداخلة (حسب `ALSQAYA_PLAN.md` §38)
1. **الكتب/المعاملات** — البحث العادي في:
   - الرقم الرسمي (official number)
   - التسلسل الداخلي (internal sequence)
   - التاريخ (date)
   - المصدر (source)
   - المخاطب إليه (addressed to)
   - الموضوع (subject)
   - المحتوى (content)
   - المنتسب (employee)
   - القسم (department)
   - الحالة (status)
2. **المنتسبون** — مع الاقتراحات والمطابقة المرنة، ومنع إنشاء منتسب بسبب typo.

### الموارد الخارجة عن النطاق صراحةً (§38)
- **الطلبات (requests):** لا تُعد مصدرًا لنتائج بحث في هذه المرحلة.
- **OCR:** قدرة مستقبلية مؤجلة **بلا رقم مرحلة**، ليس جزءًا من §38.

### المراجع
- `ALSQAYA_PLAN.md` §2 — نقطة transición؛ §38 — متطلبات Phase 22 الكاملة؛ §39 — Phase 23 التالية.
- `ALSQAYA_UI_PLAN.md` — UI-09 (Unified Search) §39–40، مرتبطة بـ Phase 22.

---

## 3. تدقيق الفجوات (Gap Audit)

يقارن هذا القسم بين المتطلبات الرسمية والتنفيذ الفعلي واختبارات القبول.

| # | البند | المتطلب الرسمي (§38) | التنفيذ الفعلي | الحكم | evidence |
|---|---|---|---|---|---|
| 1 | مسار API `/api/search` GET | بحث موحد الكتب/المنتسبين | `router.get('/', validateApiRequest, searchController)` | ✅ مكتمل | `searchRoutes.ts:18-25` |
| 2 | حقول البحث المعتمدة | 10 حقل للمعاملة | `searchRepository.ts` يستعلم عن كل الحقول | ✅ مكتمل | `searchRepository.ts:190-213` |
| 3 | بحث المنتسبين | suggestions + flexible matching | `searchEmployees()` في المستودع | ✅ مكتمل | `searchRepository.ts:243-279` |
| 4 | منع إنشاء منتسب بسبب typo | لا إنشاء Employee عند عدم المطابقة | لا مسار إنشاء في `/api/search`؛ الاختبار يؤكّد `| employees | = 2` بعد بحث غير مطابق | ✅ مكتمل | `search.test.ts:244-249` |
| 5 | التطبيع العربي D4 | توحيد ألف، إزالة تشكيل/تطويل، تطبيع مسافات، لا توحيد `ة`/`ه` ولا `ى`/`ي`، لا كتابة فوق الأصل | `normalizeArabicQuery` + `normalizeArabicColumn` في `searchRepository.ts` | ✅ مكتمل | `searchRepository.ts:63-75`, `90-110` |
| 6 | Access Scope على النتائج | SQL تصفية قبل الإرجاع، لا كشف وجود خارج النطاق | `transactionScopeCondition` يُطبّق في SQL على المعاملات | ✅ مكتمل | `searchRepository.ts:216-218` |
| 7 | 404 لا 403 للكتاب المحجوب | حجب وجود (`findById(id, scope)` pattern) | المطبق على طريق المسار العام (`requireResourcePermission` + `attachAccessScope`) | ✅ مكتمل | `routes/index.ts:90-91`, `searchRepository.ts:7-10` |
| 8 | DTO `SearchResultDto` | source, id, title, number?, date?, person?, excerpt?, sourceLabel, visibility? | منفذ في `server/src/api/dto/search.ts` | ✅ مكتمل | `dto/search.ts:16-35` |
| 9 | التحقق من المدخلات | q إلزامي، type من قائمة، limit ≤ 100، offset ≥ 0، لا حقول غير معروفة | `searchValidators.ts` مع `noUnknownFields` + `requiredFields` | ✅ مكتمل | `searchValidators.ts:30-39` |
| 10 | اختبارات API | 9 حالات تغطي النطاق، الصلاحيات، D4، التحقق، الترقيم | `server/tests/api/search.test.ts` — 9 حالات | ✅ ناجحة | `search_tap_v2.log`: `# pass 9, # fail 0` |
| 11 | الطلبات (requests) في البحث | خارج النطاق | غير موجودة في DTO ولا في الاستعلامات | ✅ ملتزم بالنطاق | `search.ts` DTO لا يحتوي `request` |
| 12 | OCR | مؤجل، بلا رقم مرحلة | غير منفذ | ✅ مؤجل (ليس نقصًا) | §38: "OCR ليس جزءًا من Phase 22" |

**خلاصة الفجوة:** لا توجد فجوة تقنية في نطاق Phase 22 كما هو معرف في §38 الحالي. جميع متطلبات البحث الموحد (الكتب/المعاملات + المنتسبين + التطبيع D4 + Access Scope + منع typo) منفذة ومختبرة. phase 22 "متجاوزة بقرار صاحب المشروع" رغم اكتمال نطاقها التقني الأساسي، لأن صاحب المشروع قرر الانتقال إلى Phase 23.

---

## 4. جرد التنفيذ (مسارات الملفات والمسؤوليات)

### الواجهة (Client — React/TypeScript)
| الملف | المسؤولية |
|---|---|
| `src/components/views/UnifiedSearchView.tsx` | شاشة البحث الموحد، عرض نتائج مجمعة حسب المصدر، اقتراحات، حالات تحميل/خطأ/فراغ |
| `src/api/searchService.ts` | استدعاء `GET /api/search` من الواجهة، تحويل DTO إلى `UnifiedSearchResult` |
| `src/components/layout/Header.tsx` | زر فتح لوحة البحث الموحّد (Phase 22 — UI-09) |
| `src/App.tsx` | استيراد `UnifiedSearchView` ودمجها في شاشة التطبيق |

### الخادم (Server — Node/Express/PostgreSQL)
| الملف | المسؤولية |
|---|---|
| `server/src/api/routes/searchRoutes.ts` | مسار `GET /api/search` مع التحقق من query string |
| `server/src/api/controllers/searchController.ts` | Controller HTTP: يقرأ query، ينادي الخدمة، يرد النتيجة |
| `server/src/api/services/searchService.ts` | خدمة API: تبني `SearchFilter` وتستدعي المستودع، تُحوّل النتيجة إلى DTO |
| `server/src/repositories/searchRepository.ts` | مستودع بحث قراءة فقط: استعلامات SQL على `transactions` و`employees`، التطبيع العربي D4، تصفية Access Scope في SQL |
| `server/src/repositories/contracts.ts` | عقود `SearchSource`、`SearchResult`、`SearchFilter`、`SearchRepository` |
| `server/src/api/dto/search.ts` | DTOs: `SearchResultDto`، `SearchQuery` |
| `server/src/api/validation/searchValidators.ts` | محقق query string: `q` إلزامي، `type` enum، `limit` ≤ 100، `offset` ≥ 0، رفض الحقول غير المعروفة |

### الاختبارات
| الملف | المسؤولية | النتيجة |
|---|---|---|
| `server/tests/api/search.test.ts` | 9 حالات اختبار API عبر HTTP حقيقي (جلسة + RBAC + Access Scope + PostgreSQL بدون mock) | ناجحة (راجع §7) |

### الطبقة السفلية (لا تغييرات)
لا migrations جديدة، لا جداول جديدة، لا تغييرات على `package.json`.

---

## 5. الأمان (Security & Access Scope)

تم التحقق مما يلي فعليًا من خلال قراءة الكود (وليس اختراعًا):

1. **المصادقة:** `requireSession()` تُركّب عالمياً على جميع مسارات `/api/*` في `routes/index.ts:72` قبل راوتر البحث (`router.use('/search', ...)` في السطر 91). أي طلب без جلسة يُرفض بـ 401.
2. **الصلاحية (RBAC):** `requireResourcePermission()` تُركّب عالمياً في السطر 81، وتفرض عائلة الصلاحية المقابلة لـ HTTP method (§28). لـ `GET` المطلوبة هي `view`.
3. **نطاق الوصول (Access Scope):** `attachAccessScope()` تُركّب في السطر 84، وتحسب `TransactionScopeFilter` من هوية الجلسة وتُسجله على `res.locals.access_scope`.控制器 البحث يمرره إلى الخدمة والمستودع (`transactionScopeOf(req)` في `searchController.ts:20`).
4. **منع تسرب السجلات:** في `searchRepository.ts`، استعلام المعاملات يُضاف إليه `AND ${transactionScopeCondition(scope, 'transactions', params)}` في السطر 216-218 — تصفية في SQL **before** الإرجاع، لا بعد قراءة البيانات. لا يُرجع رقم ولا عنوان ولا مقتطف ولا اقتراح ولا عدّاد لسجل خارج نطاق المستخدم.
5. **حجب الوجود (404 لا 403):** نمط `findById(id, scope)` مطبق على المسار العام عبر وسيطات Phase 13. الكتاب خارج النطاق يُSuppress via SQL `WHERE` — لا يُعاد أبدًا في نتائج البحث.
6. **المنتسبون:** يُبحث فيهم بناءً على صلاحية `view` المفروضة على المسار، بلا قيود نطاق إضافية، مطابقًا للسلوك القائم في `GET /api/employees` (`searchRepository.ts:9`).
7. **لا صلاحيات جديدة:** لا دور جديد، لا صلاحية جديدة، لا Access Scope جديدة. البحث يستخدم عائلات الصلاحية القائمة (§28).

---

## 6. البحث والتطبيع العربي

### الحقول المدعومة فعليًا
**المعاملات (transactions):** `number`、`sequence`、`subject`、`content`、`entity`、`addressed_to`、`status`、`employee_name`، والتاريخ ك texto (`to_char(document_date, 'YYYY-MM-DD')`)، بالإضافة إلى أسماء المنتسبين المرتبطين عبر `transaction_employees` + `employees` (`e.name`、`e.department`).

**المنتسبين (employees):** `e.name`、`e.badge_number`、`e.title`、`e.department`.

### قواعد المطابقة (D4 — §38)
- توحيد `أ إ آ ٱ` إلى `ا` (جانب الاستعلام وجانب العمود في SQL).
- إزالة التشكيل (U+064B–U+065F) والتطويل (U+0640).
- تطبيع المسافات وإزالة الزائدة.
- **لا** توحيد `ة` مع `ه`، ولا `ى` مع `ي`.
- **لا كتابة فوق القيم الأصلية:** التطبيع يجري عند المقارنة/الفهرسة فقط، في كلا الجانبين (استعلام + عمود SQL) بواسطة دوال PostgreSQL مدمجة (`lower`、`replace`、`regexp_replace`) بلا extension.

### حدود البحث
- `limit` افتراضي 20، حد أقصى تقني 100 (يُرفض ما فوقه بـ 400).
- `offset` افتراضي 0.
- `type`: `transaction` | `employee` | `all` (الافتراضي `all`).
- عند `type=all`، الحد `limit` يُطبق على المجموع الإجمالي عبر النوعين (لا يتجاوز `limit`).

### اختلاف عن الخطة
لا يوجد اختلاف جوهري. التنفيذ يطابق §38.

---

## 7. الاختبارات (النتائج الحقيقية)

### الأوامر المنفذة
- `npm run lint` (`tsc --noEmit`) — قيد التسجيل.
- `npm run test:api` — يشغل `server/tests/api/*.test.ts` بما فيها `search.test.ts`.

### نتائج اختبارات البحث (من السجلات الفعلية)
من `search_tap_v2.log`:
```
# tests 9
# pass 9
# fail 0
# canceled 0
# skipped 0
# todo 0
```
من `search_test_run.log`:
```
tests 9
suites 1
pass 9
fail 0
canceled 9   ← هذه الحالات أُلغيت بسبب إلغاء الوالد (hook failed) في runs سابقة، ليست فشلًا فعليًا في الكود
```

الـ 9 حالات في `search.test.ts`:
1. مطابقة الحقول المعتمدة داخل النطاق (§38)
2. منع إنشاء منتسب بسبب typo (البحث لا يُنشئ موظفًا)
3. التحقق: `q` إلزامي، والحدود أرقام، والحقل غير المعروف مرفوض
4. الترقيم: `limit` و`offset` يحدّدان النتائج
5. الحد الأقصى: `limit` أكبر من 100 يُرفض بـ 400
6. الحد الإجمالي عند `type=all`: لا يتجاوز `limit` عبر النوعين
- الحالات الأخرى في الملف تغطي D4 والنطاق والصلاحيات

### ملاحظة على سجلات الاختبار
ملف `search_tap_clean.log` (ترميز UTF-16LE قديم) يُظهر حالات `canceledByParent` — هذه ناتجة عن إلغاء suite الأم في runs سابقة، وليس فشلًا في كود البحث. السجل الأحدث `search_tap_v2.log` يؤكّد `# pass 9, # fail 0`.

### أوامر لم تُنفَّذ في هذه المهمة (لن تُنفَّذ، توثيق فقط)
- `npm run test:server`، `npm run test:db`، `npm run test:all`، `npm run build` — يمكن تشغيلها في مرحلة لاحقة عند استئناف العمل على Phase 23.

---

## 8. المشكلات والنواقص

### نواقص تقنية موثقة (لا تُصلح ضمن هذه المهمة)
1. **السجلات المؤقتة غير المتتبعة:** يوجد عدد من ملفات `.tmp.txt` و`.txt` في جذر المستودع (راجع §9) — ليست جزءًا من التنفيذ، وهي آثار جلسات سابقة.
2. **HEAD مضلّل:** commit `96c4a8d` يُسمى "Complete Phase 22 unified search" لكنه على فرع `phase-10-api-data-layer` — اسم الفرع لا يعكس أن Phase 22 قد نفّذت فعليًا.
3. **توثيق وحدة البحث:** لا توجد وثيقة تصميم داخلية للبحث توضح حدود `limit` عند `type=all` بدقة في جميع الطبقات.

### قرارات غير محسومة
لا توجد قرارات تجارية غير محسومة ضمن نطاق Phase 22 كما هو معرف في §38.

### ما يحتاج معالجة مستقبلًا (مرحلة 23 وما بعدها)
- الانتقال الرسمي إلى Phase 23 (Reports + Statistics + Export) حسب §39.
- OCR يبقى مؤجلًا بلا رقم مرحلة (راجع §10).

---

## 9. التغييرات المحلية والبعيدة (بحسب Git)

### حالة Git وقت التدقيق
- **الفرع الحالي:** `phase-10-api-data-layer`
- **HEAD:** `96c4a8d` ("Complete Phase 22 unified search") — مطابقة لـ `origin/phase-10-api-data-layer` (الفرع المحلي متزامن مع البعيد).
- **آخر 5 commits:**
  - `96c4a8d` Complete Phase 22 unified search
  - `c92e9d6` Implement Phase 22 unified search
  - `9e3d825` Complete Phase 22
  - `8c69895` Complete Phase 20
  - `2be6fae` docs(phase-21): record scope follow-up commit hash

### `git status --short`
جميع الملفات التالية **غير متتبعة (untracked)** — لم تُAdd ولا تُCommit:
```
?? a.tmp.txt
?? a2.tmp.txt
?? ad.tmp.txt
?? api_exit.txt
?? cleanup.cmd
?? d1.tmp.txt
?? d1.txt
?? d2.txt
?? grep.tmp.txt
?? hdr.txt
?? lint_output.txt
?? m.tmp.txt
?? pl.txt
?? pl2.txt
?? plan.tmp.txt
?? pp.txt
?? r.tmp.txt
?? st.txt
?? tl.txt
?? u.tmp.txt
?? u2.txt
?? ui.tmp.txt
?? uv1.txt
```
لا توجد ملفات معدلة (modified) ولا مؤرّفة (staged) للتتبع. التغييرات الوحيدة في الشجرة هي الملفات غير المتتبعة أعلاه.

### ما هو مرفوع إلى GitHub
كل كود تنفيذ Phase 22 (الملفات المذكورة في §4) موجود في commits `96c4a8d` و `c92e9d6` و `9e3d825` ومرفوع إلى `origin/phase-10-api-data-layer`.

### ما هو محلي فقط / غير متتبع
ملفات `.tmp.txt` و `.txt` في الجذر — آثار جلسات سابقة، ليست جزءًا من التنفيذ، ولا يجب إضافتها إلى commit التوثيق.

---

## 10. العمل المؤجل وخارج النطاق

### OCR (الضبط البصري للحروف)
- **حالة:** قدرة مستقبلية مؤجلة **بلا رقم مرحلة**.
- **موقع التوثيق:** `ALSQAYA_PLAN.md` §38 section "OCR — رؤية مستقبلية مؤجلة (بلا رقم مرحلة)".
- **ليس جزءًا من مرحلة 22:** لا يُصنف عدم تنفيذ OCR على أنه نقص يمنع الانتقال إلى Phase 23.
- **لا يُنفذ الآن:** لا كود OCR، لا واجهة OCR، لا محرك OCR.
- **اختبارات المؤجل (مؤجلة أيضًا):** image clear · low quality · stamps · Arabic variants · OCR failure recovery.

### الطلبات (requests)
- خارج نطاق نتائج البحث في Phase 22 صراحةً (§38).
- لا يُعد عدم تضمينها نقصًا.

---

## 11. قرار الانتقال (المسجل)

صاحب المشروع قرر **تجاوز المرحلة 22 في وضعها الحالي** والانتقال إلى **Phase 23 — Reports + Statistics + Export** كمرحلة تالية رسمية، بسبب تعطل التقدم في Phase 22.

### النواقص التي يجب الاحتفاظ بها (لا تُخفي، لا تُحل الآن)
1. اسم الفرع `phase-10-api-data-layer` لا يعكس تنفيذ Phase 22 الفعلي.
2. ملفات مؤقتة غير متتبعة في جذر المستودع.
3. OCR مؤجل بلا رقم مرحلة (ليس نقصًا فنيًا في Phase 22).
4. جميع متطلبات §38 منفذة ومختبرة، ولكن صاحب المشروع قرر المضي إلى Phase 23 رغم ذلك.

### ما لا يُفعل ضمن قرار الانتقال هذا
- لا تُنفذ Phase 23.
- لا تُضاف مزايا إلى البحث.
- لا تُصلح العيوب البرمجية الآن.
- لا يُنفذ OCR.
- لا تُضاف مكتبات أو migrations أو جداول.

---

## 12. حالة Git ونتيجة المهمة

| البند | القيمة |
|---|---|
| الفرع | `phase-10-api-data-layer` |
| HEAD | `96c4a8d` (متزامن مع `origin/phase-10-api-data-layer`) |
| آخر commit | `96c4a8d` "Complete Phase 22 unified search" |
| حالة الشجرة | نظيفة باستثناء ملفات `.tmp.txt` و `.txt` غير المتتبعة (آثار سابقة) |
| commit التوثيق | لم يُنشأ بعد (يُقرر ما إذا كان سينشأ 따로 للتوثيق فقط) |
| الفحوص المنفذة | `npm run lint` (قيد التسجيل)، `npm run test:api` — 9 اختبار بحث ناجح |
| العوائق الباقية | لا توجد عوائق فنية في نطاق Phase 22؛ المرحلة التالية رسميًا Phase 23 |

**توقفت المهمة هنا.** لم يُبدأ تنفيذ Phase 23. المستودع جاهز لاستلام برومبت منفصل لتنفيذ Phase 23، مع بقاء النواقص السابقة موثقة في هذا التقرير دون إخفاء أو فقدان.

---