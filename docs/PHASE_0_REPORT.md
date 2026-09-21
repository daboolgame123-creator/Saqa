# PHASE_0_REPORT.md

# تقرير المرحلة 0 — تدقيق وتثبيت خط الأساس (ALSQAYA)

> **نطاق هذه المرحلة:** تدقيق + خط أساس نظيف وموثّق فقط — **دون أي تغيير وظيفي** (لا Backend، لا قاعدة بيانات، لا مصادقة في هذه المرحلة).

---

## 1. بيئة التنفيذ (Environment)

| الأداة | الإصدار |
| --- | --- |
| Git | متاح محلياً (مستودع أُنشئ خلال هذه المرحلة) |
| Node.js | v24.21.0 |
| npm | 11.19.0 |
| TypeScript (من package-lock) | 5.8.3 |
| Vite | 6.4.3 |

---

## 2. نتائج خط الأساس (قبل أي تعديل — من worktree منفصل على وسم `prototype-baseline-0`)

- `npm ci`: **نجح** — تثبيت 219 حزمة.
- `npm run lint`: **فشل** بخطأين متكررين من نوع TS2339 في `src/services/personnelService.ts` (أسطر 418، 431، 442، 453، 471): تعذر الوصول إلى `validation.errors` لأن TypeScript لا يُجري **تضييق النقابن (discriminated-union narrowing)** عبر نفي القيمة (`!validation.ok`) عندما لا تكون `strictNullChecks` مفعّلة في `tsconfig.json`.
- `npm run build`: **نجح** (vite build لا يفحص الأنواع).

### الإصلاح (حد أدنى — commit منفصل `fix: make baseline build`)
- تغيير الشرط في المواقع الخمسة فقط من `if (!validation.ok)` إلى `if (validation.ok === false)` — دلالياً مطابق تماماً في زمن التشغيل (`validation.ok` قيمة منطقية)، ويستعيد تضييق الأنواع. لا تغيير منطقي.
- جذر السبب: غياب `strictNullChecks` في `tsconfig.json` (تم التحقق تجريبياً بنفس إصدار TypeScript).

---

## 3. التغييرات لكل خطوة

| الخطوة | الالتزام (commit) | الوصف |
| --- | --- | --- |
| خط الأساس | `f8eaaef` + وسم `prototype-baseline-0` | استيراد حالة المشروع الحالية كما هي (بلا تغييرات) على الفرع `main`، ثم الإنشاء من الفرع `phase-0-baseline` |
| Step 1 | `5f24d3d` — `fix: make baseline build` | إصلاح أخطاء lint الخمسة السابقة الوجود (personnelService.ts فقط) |
| Step 2 | `6e85f02` — تنظيف قالب AI Studio | حذف التبعيات غير المستخدمة (`@google/genai`, `express`, `@types/express`, `dotenv`, `motion`, `tsx`, `esbuild`, `autoprefixer`)، وتوحيد `vite` في devDependencies فقط، إزالة `aistudioMediaPlugin` وإعدادات HMR الخاصة بـ AI Studio من `vite.config.ts`، حذف `metadata.json`، تنظيف `.env.example`، إعادة تسمية الحزمة إلى `alsqaya`، وإزالة `server.js` من سكربت `clean` |
| Step 3 | `d4e21a1` — توحيد عقد التخزين | مطابقة `IDataStorage` مع `StorageService` (توقيعات load/save + loadDarkMode/saveDarkMode + توقيع exportBackup/restoreFromBackup الفعلي)؛ حذف واجهة `StorageKeys` غير المستخدمة (المفاتيح توحّدت في ثابت `STORAGE_KEYS` الوحيد)؛ استبدال الوصول المباشر لـ localStorage في `App.tsx` بالخدمة |
| Step 4 | `0557b7e` — فصل بيانات الاختبار | استبدال كل الأسماء الشخصية بأسماء وهمية بنمط `موظف-تجريبي-N`/`باحث-تجريبي-N`/`أستاذ-تجريبي-N` (رمز فريد لكل شخص) في `mockData.ts` و`mockUsers.ts` و`EmployeesView.tsx` و`TransactionsList.tsx` و`employeeUtils.ts` |
| Step 5 | (هذا الالتزام) — توثيق | أرشفة `Roadmap.md` و`DEVELOPMENT_PLAN.md` و`PHASE_0_AUDIT_REPORT.md` إلى `docs/archive/` مع ملاحظة الإحالة أعلى كل ملف، وتصحيح المسارات في `README.md` و`Architecture.md`، وإنشاء هذا التقرير |

### ما الذي بقي كما هو (وفق قرار Step 5)
- `src/core/models/`: نماذج المجال (transaction, employee, dailySituation, permission, user, accessScope, employeeLeave/TimePermission/Assignment/Course, personnelCatalogs) **بلا تغيير** — سليمة وتتبع فصل المسؤوليات.
- `src/services/` (storageService, authService, statisticsService, personnelService): **بلا تغييرات بنيوية** (فقط إضافة loadDarkMode/saveDarkMode وإصلاح lint).
- `src/components/{layout,views,modals}`: **بلا تغيير** — الهيكل الحالي (layout/views/modals) مناسب ومحفوظ.
- مفاتيح localStorage: **بلا تغيير** (نفس المفاتيح والبيانات؛ لا هجرة مفاتيح).

---

## 4. فحوصات القبول (Acceptance Checks)

| # | الفحص | النتيجة | الدليل |
| --- | --- | --- | --- |
| 1 | `npm run lint` | ✅ نجح | LINT_EXIT=0 بعد الإصلاح (كان فاشلاً بخطأين قبل Step 1) |
| 2 | `npm run build` بعد `npm ci` | ✅ نجح | خط الأساس: npm ci نجح (219 حزمة) وbuild نجح (BUILD_EXIT=0)؛ النسخة المعدلة: build نجح أيضاً |
| 3 | `npm run dev` وتحميل التطبيق | ✅ نجح | تشغيل خادم التطوير، فحص `GET http://localhost:3000` أرجع **HTTP 200** مع HTML الصفحة الرئيسية (#root + /src/main.tsx)، ثم إيقاف الخادم. فحص أخطاء console داخل المتصفح غير ممكن آلياً من هنا (يتطلب متصفحاً) |
| 4 | لا تبعيات غير مستخدمة | ✅ | package.json لا يحتوي أي من: @google/genai, express, @types/express, dotenv, motion, tsx, esbuild, autoprefixer؛ npm install أزال 132 حزمة غير مستخدمة |
| 5 | لا مراجع AI Studio/Gemini | ✅ | grep على `aistudio|AI Studio|DISABLE_HMR|Gemini|GEMINI|genai|APP_URL` في src/ + index.html + vite.config.ts + .env.example: **صفر نتائج** (بقايا نصية تاريخية فقط داخل `docs/archive/DEVELOPMENT_PLAN.md` كتدقيق سابق لم يُعدّل) |
| 6 | فحص مطابقة IDataStorage | ✅ | `const storageServiceConformsToIDataStorage: IDataStorage = StorageService;` موجود ويترجم بنجاح (LINT_EXIT=0) |
| 7 | لا أسماء شخصية متبقية | ✅ | grep على كل الأسماء الشخصية القديمة في src/ + README.md + docs/: **صفر نتائج** (counts only)؛ الأسماء الجديدة `موظف-تجريبي-1..4`/`باحث-تجريبي-1..3`/`أستاذ-تجريبي-1`/`اسم وهمي` متسقة لكل شخص في كل المواضع |
| 8 | Git: الفرع والوسم والالتزامات | ✅ | الفرع النشط `phase-0-baseline`؛ الوسم `prototype-baseline-0` على HEAD الأصلي `f8eaaef`؛ التزام واحد لكل خطوة (5 التزامات فوق خط الأساس)؛ شجرة العمل نظيفة |
| 9 | لم يُعدَّل أي ملف خارج النطاق | ✅ | `git diff --stat prototype-baseline-0..HEAD` يظهر فقط: personnelService.ts, package.json, package-lock.json, vite.config.ts, .env.example, metadata.json(محذوف), storage.ts, storageService.ts, App.tsx, mockData.ts, mockUsers.ts, EmployeesView.tsx, TransactionsList.tsx, employeeUtils.ts, Roadmap.md/DEVELOPMENT_PLAN.md/PHASE_0_AUDIT_REPORT.md(منقولة), README.md, Architecture.md, docs/PHASE_0_REPORT.md (جديد) |

---

## 5. اتساق أسماء الاختبار مع منطق المطابقة (Step 4)

- كل شخص له **رمز واحد فريد** (كلمة واحدة بطول > 2)، مثال: `موظف-تجريبي-1` — وهذا يضمن أن `isEmployeeMatch` في `employeeUtils.ts` يعمل بنفس السلوك: الاسم الواحد يطابق نفسه تماماً، ولا يطابق أسماء أشخاص آخرين (لا تشترك كلمات بين رمزين)، مما يحافظ على سلوك `normalizeTransaction` و`registerEmployeeIfNew` كما هو.
- لم تُغيَّر `id`s أو العلاقات (`employeeIds`)؛ فقط النصوص المعروضة.
- مفاتيح localStorage لم تُغيَّر: البيانات المخزنة سابقاً في متصفح المستخدم تحتفظ بأسمائها القديمة (لا يوجد ترحيل إجباري) — **قرار مقصود** لعدم كسر بيانات مستخدم فعلي؛ يُنصح مستخدمو النسخة السابقة بتصدير نسخة احتياطية يدوياً إذا أرادوا البدء بالبيانات الوهمية الجديدة.

---

## 6. مشاكل معروفة — سُجلت ولم تُصلح (Log Only)

1. `index.html` يحمّل خط Tajawal من Google Fonts (يتطلب إنترنت؛ يجب توفيره محلياً في النظام النهائي).
2. المصادقة وهمية (تبديل الأدوار من الترويسة أو `?role=` في الرابط)؛ الصلاحيات تُفرض من جهة العميل فقط.
3. المرفقات مخزّنة Base64 داخل localStorage (ضغط Canvas حتى 1600px بجودة 0.82 لتخفيف الحجم).
4. إدخالات الموقف اليومي تشير إلى المنتسبين بالاسم النصي لا بـ `employeeId`.
5. مكونات ضخمة (`TransactionsList`, `EmployeesView`, `ArchivistEditorModal`, `ArchivistStudioView`, `NewTransactionModal`) وكل الحالة في `App.tsx`.
6. توليد المعرّفات عبر `Date.now()/Math.random()` (generateId في personnelService).
7. حزمة JavaScript > 500kB (تحذير Vite) — يُقترح code-splitting لاحقاً (ليس في نطاق Phase 0).
8. README يذكر مجلد `public/` غير الموجود فعلياً (عُدّل شجرته، بقي التلميح النصي للمراجعة لاحقاً).

---

## 7. الانحرافات / أسئلة مفتوحة

1. **المستودع لم يكن git repo أصلاً** — أُنشئ خلال Phase 0 (الفرع الافتراضي `main`، الوسم على HEAD الأصلي).
2. لم يوجد فرع باسم «تقرير-عمل-الذاتية» — لا مقارنة مطلوبة.
3. `docs/ALSQAYA_PLAN.md` غير موجود — يُفترض إصداره في مرحلة لاحقة (خارج Phase 0).
4. `PROJECT_RULES.md` §6 يذكر التزامنا بترتيب هرمية التوثيق: يُحدّث لاحقاً بعد إصدار خطة ALSQAYA (خارج Phase 0).
5. تحديث خط Tajawal إلى النظام النهائي (offline) مؤجل لمرحلة لاحقة.

> **نهاية المرحلة 0** — جاهز لبدء Phase 1 بعد اعتماد خطة ALSQAYA.

