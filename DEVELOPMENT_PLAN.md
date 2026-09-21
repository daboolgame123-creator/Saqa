# DEVELOPMENT_PLAN.md

خطة التطوير الهندسية الشاملة لنظام الذاتية والأرشفة — **الوثيقة المرجعية المعتمدة (Authoritative Development Roadmap)**

> **حالة الوثيقة (Document Status):** حُدِّثت ضمن **PHASE 0** (تدقيق المعمارية والتوثيق فقط — دون أي تعديل على الكود المصدري أو التبعيات) بناءً على فحص فعلي لكل ملفات المستودع، لا على الوثائق القديمة.
> **هذه الوثيقة هي المرجع الوحيد المعتمد لمراحل التطوير المستقبلية.** `Roadmap.md` يوثق مراحلَ تاريخية مكتملة بترقيم قديم ولا يُعتمد في التخطيط المقبل (انظر المسائل غير المحسومة أدناه).

## الهدف النهائي

تحويل المشروع من Prototype محلي (React + localStorage) إلى نظام مركزي حقيقي (Backend + PostgreSQL)

## CURRENT STATE — الوضع الحالي الفعلي (مُدقَّق على الكود المصدري)

> تم التحقق من كل بند أدناه عبر فحص مباشر لملفات المستودع في إطار PHASE 0، وليس عبر الوثائق القديمة.

### 1.1 حزمة التقنيات (Tech Stack)
- React 19 + TypeScript ~5.8 + Vite 6 + Tailwind CSS 4 (عبر `@tailwindcss/vite`) + lucide-react.
- واجهة عربية RTL (خط Tajawal) مع دعم الوضع الليلي/النهاري.
- تطبيق صفحة واحدة (SPA) **خالص الواجهة**: لا يوجد أي Backend أو قاعدة بيانات في المستودع (لا `server.js`، لا مجلد خادم، لا كود Node نشِط).
- أوامر npm: `dev` (Vite على المنفذ 3000)، `build`، `preview`، `lint` (=`tsc --noEmit`)، `clean`. **لا يوجد أي إطار اختبارات** (لا Vitest ولا Jest).

### 1.2 التخزين (localStorage فقط)
- ثلاثة مفاتيح: `zatiya_prototype_transactions_v2`، `zatiya_prototype_employees_v3`، `zatiya_prototype_dark_mode_v1`.
- المرفقات تُخزن كـ **Base64 data URLs** داخل سجل المعاملة نفسه، مع ضغط الصور من جهة العميل (Canvas، أقصى بعد 1600px، JPEG بجودة 0.82) لتجنّب تجاوز حصة localStorage.
- `StorageService` يُطبّع البيانات عند التحميل عبر `AuthService.normalizeTransaction` (ربط `employeeIds`، مزامنة `employeeName`، تعيين `visibility` الافتراضي).
- **ملاحظة معمارية (عقد غير منفذ):** الواجهة `IDataStorage` المعلنة في `src/core/interfaces/storage.ts` **غير مُنفَّذة فعلياً** بواسطة `StorageService` (اختلاف التواقيع: `exportBackup`/`restoreFromBackup` مقابل `exportBackupJson`/`restoreFromBackupJson`). العقد موجود في الكود لكنه غير مستخدم من أي طرف.

### 1.3 مسؤوليات `App.tsx` (حاوية الحالة المركزية الوحيدة)
- يملك كل الحالة العامة: `employees`، `transactions`، `userRole` (الافتراضي `director`)، `currentView`، `navigationTarget`، المعاملة المحددة/قيد التحرير، حالة النوافذ المنبثقة، الوضع الليلي.
- تبديل الأدوار عبر الترويسة (Header) **وأيضاً** عبر معاملات الرابط `?role=director` أو `?role=archivist` (وكذلك `?user=`) دون أي تحقق.
- تسجيل المنتسبين تلقائياً من أسماء المعاملات (`registerEmployeeIfNew`)، وتحديث/حذف منتسب مع فك ارتباطه من المعاملات، وتتبع المقروء/غير المقروء، وتوجيه داخلي بين الشاشات.

### 1.4 الخدمات الحالية (`src/services/`)
- **StorageService**: قراءة/حفظ localStorage، نسخ احتياطي JSON (`exportBackup`/`restoreFromBackup`)، تطبيع البيانات عند التحميل.
- **StatisticsService**: حساب مؤشرات لوحة القيادة (`DashboardMetrics`) من مصفوفة المعاملات.
- **AuthService**: `getUserForRole` من `MOCK_USERS`، `hasPermission`، `filterTransactionsForUser`، `normalizeTransaction`.

### 1.5 النماذج الحالية (`src/core/models/` — سبعة ملفات)
- **transaction.ts**: `Transaction` (العدد، التسلسل، التاريخ، الشهر، الاتجاه صادر/وارد/داخلي، التصنيف، النوع الفرعي، الجهة، الموضوع، `employeeIds[]` + `employeeName` للتوافق التراجعي، `visibility: AccessScope`، `targetScope`، الأولوية، `directorDirective`، الحالة جديد/قيد الإنجاز/مكتمل، `isRead`/`readAt`، `attachments[]`، `isDailySituation` + `dailySituationData`، `specificDetails`) + `Attachment` + `DirectorDirective`.
- **employee.ts**: `Employee` (المعرف، الاسم، المسمى، الشعبة، رقم الشارة، تاريخ الانتساب، الفئة منتسب/باحث، الدرجة العلمية، الاختصاص، `userId` للربط بحساب مستخدم).
- **dailySituation.ts**: `DailySituationEntry` (يعتمد **اسم المنتسب النصي** `employeeName` وليس معرفاً) + `DailySituationData` بستة أقسام (إجازات/ساعات/تحويل دوام للدائمين، ومثلها للمكافأة والأجر اليومي والمتطوع) + تأييد المشرف.
- **navigation.ts**: `UserRole = RoleId` و`NavigationTarget` للتوجيه الداخلي.
- **permission.ts**: **22 صلاحية** و**4 أدوار** (`admin`, `director`, `archivist`, `employee`) مع مصفوفة `ROLE_PERMISSIONS` ودوال `roleHasPermission`/`roleHasAnyPermission`/`roleHasAllPermissions`. صلاحيات الحضور (`attendance.*`) وإدارة المستخدمين محفوظة مسبقاً للمراحل القادمة.
- **user.ts**: `User` (بما فيه `employeeId` و`customPermissions`) ودوال `userHasPermission`/`userHasAnyPermission`/`userHasAllPermissions`.
- **accessScope.ts**: أربعة نطاقات (`PublicToEmployees`, `SpecificEmployees`, `Administrative`, `DirectorOnly`) + `ACCESS_SCOPE_OPTIONS` + الواجهة الوسيطة **`TransactionEmployeeRelation`** (معرَّفة لكنها **غير مستخدمة** بعد) + الدالة النقية `canUserAccessTransaction`.

### 1.6 التوثيق والصلاحيات الحالي (Mock Authentication)
- لا يوجد تسجيل دخول حقيقي: المستخدم يُشتق من `MOCK_USERS` (4 مستخدمين تجريبيين) حسب الدور المختار من الترويسة أو من معامل الرابط؛ مستخدم دور المنتسب مرتبط بـ `emp-1`.
- **كل** فرض الصلاحيات ونطاق الرؤية يحدث من جهة العميل فقط (`roleHasPermission` + `canUserAccessTransaction`) — قابل للتجاوز من المتصفح.
- دور المنتسب يرى المعاملات المفلترة فقط؛ صلاحية `employees.view.personal` معرَّفة لكن **لا توجد شاشة ملف شخصي مستقلة** بعد.

### 1.7 المعاملات وعلاقتها بالمنتسبين
- العلاقة الأساسية: `employeeIds[]`؛ و`employeeName` محفوظ للتوافق التراجعي والعرض؛ التطبيع عند التحميل يحوّل الأسماء القديمة إلى معرفات.
- تعديل/حذف منتسب يفك الارتباط ويُزامن أسماء المعاملات تلقائياً (منطق داخل `App.tsx`).
- `TransactionEmployeeRelation` (جدول العلاقة المستقبلي المقترح) معرف في `accessScope.ts` لكنه غير مربوط بأي منطق بعد.

### 1.8 المواقف اليومية (Daily Situations)
- تُخزن **مدمجة داخل `Transaction` نفسه** (`isDailySituation` + `dailySituationData`) — ليست كياناً مستقلاً.
- مدخلات الإجازات/الساعات/التحويلات تعتمد **الاسم النصي** للمنتسب وليس `employeeId` — ازدواجية بيانات وعدم ربط بسجلات شؤون المنتسبين.

### 1.9 المرفقات (Attachments)
- `Attachment` يحمل الاسم/النوع/الحجم/التاريخ و`previewUrl` (Base64 data URL) و`isImage`.
- الرفع يمر عبر `processUploadedFile` (ضغط Canvas) أو توليد SVG مؤقت للمعاينة (`generateDocumentSvg`). **لا يوجد تخزين ملفات مركزي**.

### 1.10 القيود الحالية (Current Limitations)
1. `App.tsx` حاوية حالة واحدة ضخمة — مقبولة للنموذج الأولي، وتتطلب تفكيكاً قبل الربط بالـ Backend.
2. localStorage فقط — لا تعدد مستخدمين حقيقي، لا مزامنة بين الأجهزة، وسعة محدودة (المرفقات Base64 تستهلك الحصة سريعاً).
3. توثيق وهمي — تبديل أدوار بلا كلمة مرور أو جلسة أو خادم.
4. فرض الصلاحيات من جهة العميل فقط — قابل للتجاوز.
5. لا سجل تدقيق (Audit Log) ولا تاريخ تعديلات.
6. لا معالجة لتعارض التعديلات المتزامنة (آخر حفظ يكسب).
7. لا اختبارات آلية ولا CI.
8. تبعيات غير مستخدمة في `package.json` (`express`, `dotenv`, `@google/genai`, `motion`) وملف `.env.example` بمفاتيح Gemini لا يستخدمها الكود — بقايا قوالب وليست بنية خادم قائمة.
9. هذا المجلد **ليس مستودع Git** (لا يوجد `.git`) — لا يمكن تشغيل `git diff` للتحقق من التغييرات.
10. `README.md` يذكر مجلد `public/` غير الموجود فعلياً.

### 1.11 جرد الوثائق كما وُجدت (Documentation Inventory)
- `ARCHITECTURE.md`: وصف معماري قديم يغفل `permission.ts` و`user.ts` و`accessScope.ts` و`authService.ts` — **حُدِّث ضمن هذه المرحلة**.
- `Roadmap.md`: مراحل "1/2/3" تاريخية لإنجاز النموذج الأولي، يتعارض ترقيماً مع مراحل هذه الخطة — **وُضِّح بأنها مراحل تاريخية**.
- `PHASE_0_AUDIT_REPORT.md`: مسودة تدقيق سابقة جزئية تحتوي معلومات غير دقيقة (وصف المرفقات بأنها بيانات وصفية فقط؛ وعدد المعاملات 8 بدلاً من 7) — **أُشير إليها كوثيقة تاريخية مُستبدلة بهذا القسم**.
- `docs/PROJECT_PLAN.md`: جدول مكونات دقيق إلى حد كبير لكنه لا يذكر الطبقة الأمنية (لم يُعدَّل؛ خارج قائمة المراجعة المطلوبة).
- `README.md` و`PROJECT_RULES.md` و`PROJECT_VISION.md`: صحيحة في جوهرها مع تحديثات توضيحية طفيفة.

## TARGET STATE — المعمارية المستقبلية المستهدفة (غير منفَّذة بعد)

> **تنبيه:** كل ما في هذا القسم **رؤية مستقبلية فقط**. لم يُنفَّذ أي بند منه في الكود الحالي، ويُمنع تنفيذه قبل بلوغ مراحله المحددة في خطة الانتقال أدناه.

### 2.1 البنية المستهدفة

```text
React (SPA — تبقى واجهة العرض)
        ↓  HTTP/JSON (REST)
Backend API  (Node.js + Express + TypeScript — PHASE 12)
        ↓
PostgreSQL   (قاعدة البيانات المركزية — PHASE 13)
        ↓
تخزين ملفات مركزي للمرفقات (بدل Base64 في localStorage)
        ↓
سجلات تدقيق (Audit Logs) لكل عملية تغيير
        ↓
نظام نسخ احتياطي منظم ومجدول
```

- واجهة React الحالية تبقى طبقة العرض، وتُعاد توجيه استدعاءات `StorageService` إلى استدعاءات API بدل localStorage.
- **كل** فرض الصلاحيات ونطاق الرؤية ينتقل إلى الخادم (Middleware/Policy) — دوال النطاق النقية الحالية (`canUserAccessTransaction` وغيرها) مصممة أصلاً لتكون قابلة للنقل المباشر.
- `IDataStorage` يصبح عقد التحوّل: تنفيذ `LocalStorageAdapter` حالي + `ApiStorageAdapter` مستقبلي بنفس العقد (بعد توحيد تواقيعه — انظر المسائل غير المحسومة).

### 2.2 المعالجة المستقبلية لمجالات النظام

| المجال | المعالجة المستهدفة |
| :--- | :--- |
| **Authentication** | توثيق حقيقي على الخادم (جلسات/Tokens، كلمات مرور مُعمّاة) — PHASE 14؛ إلغاء تبديل الأدوار من الرابط والترويسة |
| **RBAC** | مصفوفة `ROLE_PERMISSIONS` الحالية تنتقل إلى الخادم ويُفرض فيها مركزياً — PHASE 15؛ الأدوار الأربعة تبقى نفسها قابلة للتوسعة |
| **Access Scope** | فصل "الصلاحية" (ماذا يستطيع) عن "نطاق الرؤية" (ماذا يرى)؛ فحص `visibility` يُنفَّذ على الخادم لكل استعلام — PHASE 16 |
| **Employees** | كيان مستقل في PostgreSQL؛ `Employee.id` هو الرابط الأساسي لكل شيء؛ يُحفظ ملف المنتسب وتاريخه |
| **Personnel Affairs** | طبقة `personnelService` توحّد منطق الإجازات/الساعات/التكليفات/الدورات — PHASE 2 (لوجيك العميل) ثم تُنقل للخادم معه |
| **Transactions** | جدول معاملات مرجعي مع حالة صريحة وضبط تزامن؛ الفلترة والبحث على الخادم |
| **TransactionEmployee** | جدول علاقة وسيط `TransactionEmployees` (transactionId, employeeId, relationshipType) مطابق للواجهة `TransactionEmployeeRelation` الموجودة أصلاً في الكود — PHASE 6؛ يحل محل `employeeIds[]` + `employeeName` |
| **Leaves** | كيان `EmployeeLeave` مستقل مرتبط بـ employeeId — PHASE 1 |
| **Time permissions** | كيان `EmployeeTimePermission` مستقل — PHASE 1 |
| **Assignments** | كيان `EmployeeAssignment` مستقل — PHASE 1 |
| **Courses** | كيان `EmployeeCourse` مستقل — PHASE 1 |
| **Daily situations** | ربط مدخلاتها بمعرفات المنتسبين (لا الأسماء) وبسجلات الإجازات، مع الحفاظ على شكل الاستمارة الرسمية — PHASE 4 |
| **Reports** | تقارير متقدمة تُحسب من قاعدة البيانات — PHASE 9؛ تصدير PDF/Excel — PHASE 10 |
| **Attachments** | ملفات فعلية على تخزين مركزي مع فهرس في قاعدة البيانات (بدل Base64) وروابط موقعة/آمنة — PHASE 17 |
| **Audit logs** | سجل تدقيق لكل إنشاء/تعديل/حذف/اطلاع حساس (من، متى، ماذا، القيمة السابقة/اللاحقة) — PHASE 8 |
| **Future attendance** | صلاحيات `attendance.view/manage` محفوظة مسبقاً في `permission.ts`؛ كيان الحضور يُدرس بعد استقرار كيانات الموظفين (خارج المراحل 0–25 الحالية) |
| **التحديثات المتزامنة** | منع تعارض المستخدمين (قفل تفاؤلي/أعلام إصدار) — PHASE 19 |

## القواعد غير القابلة للكسر

1. Architecture > Features
2. Correctness > Speed
3. لا تعديل بلا سبب
4. الحفاظ على البيانات الحالية
5. مرحلة واحدة في كل مرة
6. عدم الافتراض
7. employeeId هو الرابط الأساسي
8. الأمان على الخادم
9. بيانات تطوير فقط

## 25 مرحلة للتطوير (خطة الانتقال — المرجع المعتمد، الترتيب محفوظ)

> **ملاحظة حول المراحل:** الخطة تحوي **26 قيداً** مرقمة من PHASE 0 إلى PHASE 25 (العدد "25" في العنوان يعبّر عن أرقام الفهارس وليس عدد العناصر). **يُحتفظ بالترقيم والترتيب كما هما دون أي حذف أو إعادة ترتيب.**
> **المسألة غير المحسومة #1 (Open Question):** لم يُسأل صاحب القرار بعدُ عما إذا كان المقصود "25 مرحلة فعلياً" (بمعنى الحاجة إلى دمج مرحلتين). لن يُتخذ أي إجراء دمج إلا بقرار صريح، وتُعد هذه الخطة **صحيحة كما هي** في انتظار ذلك.

### اعتماديات المراحل (Phase Dependencies — توضيح، دون إعادة ترتيب)

| المرحلة | تعتمد على | ملاحظات |
| :--- | :--- | :--- |
| 0 تثبيت المعمارية | — | هذه المرحلة (توثيق فقط) |
| 1 نماذج شؤون المنتسبين | 0 | يبني على نماذج `src/core/models` الحالية |
| 2 Personnel Services | 1 | تستهلك نماذج المرحلة 1 |
| 3 ملف المنتسب | 1, 2 | |
| 4 الموقف اليومي | 1 | ربط المواقف بالكيانات الجديدة |
| 5 Timeline | 3, 4 | يحتاج بيانات ملف المنتسب والمواقف |
| 6 TransactionEmployee | 1 | يستبدل `employeeIds[]`/`employeeName` |
| 7 نظام حالات المعاملات | 0 | فصل المفاهيم |
| 8 AuditLog | 7 | يسجل التغييرات على الحالات وغيرها |
| 9 التقارير | 1–8 | تُحسب من البيانات المكتملة |
| 10 التصدير | 9 | PDF/Excel |
| 11 الانتقال من LocalStorage | 1–10 | استقرار البيانات قبل الهجرة |
| 12 Backend | 11 | Node.js + Express + TypeScript |
| 13 قاعدة البيانات | 12 | PostgreSQL |
| 14 Authentication | 12, 13 | |
| 15 RBAC | 14 | |
| 16 Access Scope | 15 | |
| 17 المرفقات | 12, 13 | تخزين مركزي |
| 18 الحذف (Soft Delete) | 13 | |
| 19 منع تعارض المستخدمين | 12, 13 | |
| 20 الشبكة الداخلية | 12–17 | نشر مبدئي |
| 21 HTTPS | 20 | |
| 22 النسخ الاحتياطي | 13 | نظام Backup منظم |
| 23 الاختبارات | 12–19 | Unit/Integration/Permission |
| 24 بيانات الاختبار | 23 | Seeding |
| 25 الانتقال للإنتاج | 20–24 | قائمة التحقق النهائي |

### PHASE 0: تثبيت المعمارية — **منجزة ✅ (توثيق وتدقيق فقط)**
- تحديث الوثائق
- توضيح الطبقات
- خارطة الانتقال

### PHASE 1: نماذج شؤون المنتسبين
- EmployeeLeave
- EmployeeTimePermission
- EmployeeAssignment
- EmployeeCourse

### PHASE 2: طبقة Personnel Services
- src/services/personnelService.ts

### PHASE 3: ملف المنتسب
- تطوير EmployeesView

### PHASE 4: الموقف اليومي
- ربط البيانات بشكل صحيح

### PHASE 5: Timeline
- عرض السجل الزمني للموظف

### PHASE 6: تحسين نموذج المعاملات
- TransactionEmployee

### PHASE 7: نظام حالات المعاملات
- فصل المفاهيم

### PHASE 8: سجل التدقيق
- AuditLog

### PHASE 9: التقارير
- تقارير متقدمة

### PHASE 10: التصدير
- PDF و Excel

### PHASE 11: الانتقال من LocalStorage
- إعداد Backend

### PHASE 12: Backend
- Node.js + Express + TypeScript

### PHASE 13: قاعدة البيانات
- PostgreSQL

### PHASE 14: Authentication
- نظام توثيق حقيقي

### PHASE 15: RBAC
- نظام صلاحيات

### PHASE 16: Access Scope
- فصل العلاقة والصلاحية

### PHASE 17: المرفقات
- نظام مرفقات آمن

### PHASE 18: الحذف
- Soft Delete

### PHASE 19: منع تعارض المستخدمين
- معالجة التحديثات المتزامنة

### PHASE 20: الشبكة الداخلية
- النشر على الشبكة

### PHASE 21: HTTPS
- تشفير البيانات

### PHASE 22: النسخ الاحتياطي
- نظام Backup منظم

### PHASE 23: الاختبارات
- Unit, Integration, Permission Tests

### PHASE 24: بيانات الاختبار
- Test data seeding

### PHASE 25: الانتقال للإنتاج
- قائمة التحقق النهائي

## طريقة العمل مع Copilot

```
IMPLEMENT PHASE X ONLY.

Read the repository first.

Do not implement future phases.

After implementation:
1. Run type check
2. Run build
3. Report results
4. STOP
```

## المسائل غير المحسومة (Unresolved Documentation Issues)

| # | المسألة | القرار المتخذ في PHASE 0 |
| :- | :--- | :--- |
| 1 | عدد المراحل: 26 قيداً (0–25) مقابل عبارة "25 مرحلة" | **الحفاظ على الخطة كما هي**؛ أي دمج يحتاج قراراً صريحاً |
| 2 | تعارض ترقيم `Roadmap.md` (مراحل 1/2/3 تاريخية) مع ترقيم هذه الخطة | الإبقاء على `Roadmap.md` وثيقة تاريخية، وتوثيق أن `DEVELOPMENT_PLAN.md` هو المرجع المعتمد؛ لا إعادة تسمية ولا نقل (لا سبب معماري لذلك) |
| 3 | `PHASE_0_AUDIT_REPORT.md` موجود ومحتواه جزئي وغير دقيق (المرفقات "بيانات وصفية فقط"، و8 معاملات بدلاً من 7) | بقي دون حذف، واعتُبر مسودة تاريخية؛ قسم CURRENT STATE في هذه الوثيقة هو التدقيق المعتمد |
| 4 | تواقيع `IDataStorage` لا تطابق `StorageService` (عقد غير منفذ) | توثيقه فقط — تصحيح الكود يُؤجل لمرحلة تخص الكود (لا تعديل كود في PHASE 0) |
| 5 | مجلد المشروع ليس مستودع Git | لا يمكن تشغيل `git diff`؛ التحقق تم بمقارنة الأرشيف النصي للملفات قبل/بعد التعديل |
