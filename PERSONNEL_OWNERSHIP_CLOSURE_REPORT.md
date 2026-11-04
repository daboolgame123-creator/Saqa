# ALSQAYA — تقرير إغلاق إصلاح Personnel Ownership / IDOR

- **التاريخ:** 2026-11-03
- **الحالة:** مغلق ومُعتمد ضمن نطاق الاختبارات المحدد.
- **الفرع:** `phase-10-api-data-layer` — HEAD `aab11f404a58d7b78885a26596f59f241b4d6409`
- **ملاحظة نطاق:** هذا اعتماد لنجاح الإصلاح في الاختبارات المحددة (22/22)، و**ليس** تدقيقًا أمنيًا شاملًا للسقاية.

---

## 1. سبب المشكلة

قراءات المنتسبين (Personnel) كانت تُبنى من معرّفات ومرشّحات قادمة من الطلب، دون اشتقاق سياق ملكية إلزامي من هوية الحساب المصادَق. النتيجة: إمكانية قراءة/استنتاج بيانات منتسب آخر (IDOR) عبر:

- تمرير `employeeId` أجنبي في القوائم أو التفاصيل أو المرشّحات المشتقة.
- حذف المرشّح أو تعارضه فيُعاد النطاق إلى قراءة أوسع.
- مسارات مشتقة (أرصدة، سجل، خط زمني، بحث) تجمع مصادر قبل التحقق من الملكية.

## 2. المسارات الأحد عشر التي عولجت

1. قائمة المنتسبين (`GET /api/employees`)
2. تفصيل منتسب (`GET /api/employees/:id`)
3. سجل حالة المنتسب (`GET /api/employees/:id/status-history`)
4. قائمة الإجازات (`GET /api/leaves`)
5. تفصيل إجازة مع الرصيد (`GET /api/leaves/:id`)
6. قائمة الأذونات الزمنية (`GET /api/time-permissions`)
7. تفصيل إذن زمني مع `weeklyMinutes`
8. الأرصدة (`GET /api/leave-balances`)
9. سجل الحركات (`GET /api/leave-ledger`)
10. الخط الزمني (`GET /api/timeline`)
11. البحث بنطاق الموظفين (`GET /api/search?q=…&type=employee`)

كما شمل الإصلاح القراءات المشتقة المرتبطة: الإجازات، الأذونات الزمنية، الأرصدة، الحركات، سجل الحالة، والبحث — ضمن الخدمات والمستودعات المعنية.

## 3. التصميم الأمني: `all / owner / empty`

سياق مركزي واحد (`server/src/authorization/personnelScope.ts`) يُشتق من `req.auth.employeeId`:

| السياق | متى | الأثر |
|---|---|---|
| `all` | `admin` أو `director` صراحةً | قراءة كل المنتسبين، دون اختراع تسلسل هرمي ودون منح كتابة إضافية |
| `owner(employeeId)` | حساب مرتبط بمنتسب | قصر كل قراءة على `employeeId` المعتمد من الجلسة |
| `empty` | لا سياق صالح (جلسة مفقودة/دور غير معروف/تعارض) | لا قراءة إطلاقًا (fail-closed)، ولا فتح قراءة عامة |

قواعد مكملة:

- **fail-closed:** غياب الهوية أو تعارض النطاقات يوقف القراءة **قبل** SQL، لا بعد الجمع.
- **الحجب 404:** تفاصيل مورد أجنبي تُعاد كـ`RESOURCE_NOT_FOUND` نفسه للمورد غير الموجود (حجب الوجود).
- **تطبيع UUID:** الصيغ المتكافئة (حالة الأحرف/الشرطات/الأقواس) تُقارن موحّدة، مع إعادة فرض معرّف المالك المعتمد.
- **الكتابة الإدارية:** بعد الكتابات الإدارية تُعاد القراءة صراحةً بسياق `all`، دون توسيع صلاحية الكتابة.
- **التقارير:** تبقى محجوبة بـ`503 REPORTS_UNAVAILABLE` (لم تُرفع).

## 4. الملفات

مقارنةً بالنسخة الاحتياطية `ALSQAYA-backup-before-personnel-ownership-20261103-200144` (ملفات المصدر فقط، بلا `node_modules`/`.git`/`dist`/`.env*`): **13 معدّلًا + 7 جديدة + 0 محذوف**.

### معدّلة (13)

- `server/src/api/controllers/employeeController.ts`
- `server/src/api/controllers/personnelController.ts`
- `server/src/api/controllers/searchController.ts`
- `server/src/api/controllers/timelineController.ts`
- `server/src/api/services/employeeService.ts`
- `server/src/api/services/personnelService.ts`
- `server/src/api/services/searchService.ts`
- `server/src/api/services/timelineService.ts`
- `server/src/repositories/contracts.ts`
- `server/src/repositories/employeeRepository.ts`
- `server/src/repositories/leaveRepository.ts`
- `server/src/repositories/searchRepository.ts`
- `server/src/repositories/timePermissionRepository.ts`

### جديدة (7)

- `server/src/authorization/personnelScope.ts`
- `server/tests/helpers/personnelIsolation.cjs`
- `server/tests/helpers/personnelIsolationPreflight.cjs`
- `server/tests/helpers/personnelTestSuite.ts`
- `server/tests/personnelOwnership.test.ts`
- `server/tests/runPersonnelOwnershipChecks.ps1`
- `server/tests/security/personnelOwnership.integration.test.ts`

`server/src/api/routes/reportRoutes.ts` لم يتغيّر: السطر 24 ما زال `res.status(503).json({`.

## 5. نتائج الفحوص

التشغيل المعتمد: sandbox `ALSQAYA-personnel-checks-20261103-230221-418` — **رمز خروج المشغّل 0**.

| # | الفحص | ExitCode | السجل | النتيجة |
|---|---|---|---|---|
| 1 | P0 isolation preflight | 0 | `p0-preflight.log` | `guardPreloaded:true`، 8 عمليات محظورة |
| 2 | HTTP/SQL isolation negative preflight | 0 | `personnel-preflight.log` | `passed (no connections)` |
| 3 | Fail-closed units + P0 regressions | 0 | `unit-tests.log` | 13/13، fail 0 |
| 4 | Personnel HTTP + SQL integration | 0 | `integration-tests.log` | 9/9، fail 0 |
| 5 | TypeScript (`tsc --noEmit`) | 0 | `typescript.log` | 0 بايت (لا تشخيصات) |
| 6 | Vite build | 0 | `build.log` | 1732 module، built in 10.93s |

- الوحدوية الخمسة: 5/5 (fail-closed، حدود الخدمة، الهوية من الحساب، استعلامات الملكية، تطبيع UUID).
- التكاملية التسعة: T1–T8 (T6 مرتان) — 9/9.
- P0 الثمانية: 8/8 داخل `unit-tests.log` (نفس عملية `node --test`، `--test-concurrency=1`).
- `build.stderr.log` = 342 بايت: تحذير Rollup فقط عن chunk > 500kB (غير قاتل).
- بقية ملفات stderr = 0 بايت.

## 6. دليل عزل Employee A عن Employee B

- T1–T4 تقارن استجابة A تجاه سجلات B باستجابة معرّف غير موجود ⇒ حجب وجود (404) ومنع كشف البيانات.
- T2/T3: قوائم وأرصدة وسجلات B لا تظهر ولا تُوسَّع بحذف المرشّح أو تعارضه.
- T4: إضافة المسؤول لسجل لـB لا تغيّر أعداد A في الخط الزمني.
- T5: البحث يقيّد الموظفين قبل الترتيب/pagination.
- الوحدوية: نطاقات فارغة/متعارضة توقف القراءة قبل SQL.

## 7. Admin / Director / الحساب غير المرتبط

- **Admin وDirector:** كلاهما يقرأ المسارات الأحد عشر المعتمدة لسجلات B (T6).
- **Director:** رفض الكتابة (403) على `POST /api/employees` و`PATCH /api/leaves/:id`.
- **Detached (`employee_id = NULL`):** قوائم فارغة، تفاصيل تُعاد كغير موجودة، `role=admin` مزوّر ⇒ 400، بلا جلسة ⇒ 401، دور غير معروف ⇒ 403.
- **التقارير:** T8 يثبت بقاء 503 مع صفر استدعاءات لـ`report.run`.

## 8. ملاحظات Reviewer (F1–F4) والتحسينات المؤجلة

| # | الملاحظة | الشدة | التحسين المؤجل |
|---|---|---|---|
| F1 | تأكيدا منع الكتابة في T6 يُنفَّذان بجلسة Director (آخر عنصر في الحلقة)، فلا دليل مباشر على منع Admin من الكتابة | منخفضة | تكرار التأكيدين داخل حلقة `[admin, director]` أو إعادة تسمية الاختبار |
| F2 | `personnel-results.json` يُكتب قبل إعادة تجزئة المصدر في `finally`، فJSON وحده لا يثبت سلامة المصدر | منخفضة/متوسطة للتدقيق | تسجيل نتيجة تجزئة المصدر في JSON أو ملف مستقل |
| F3 | `postmaster.pid` قديم داخل sandbox + بقاء نسخ مؤقتة وبيانات اعتماد | منخفضة | تنظيف آلي بعد الاعتماد (نُفِّذ يدويًا في هذا الإغلاق) |
| F4 | الحراس اعتراض على مستوى Node (net/tls/dgram/pg) ولا يحجبون `child_process`/`dns` | منخفضة (دفاع في العمق) | عزل على مستوى النظام أو حجب spawn/DNS |

فجوة تغطية معروفة: مسارات **الكتابة** مغطاة جزئيًا (إجازة/إذن/إنشاء منتسب)، ولا تشمل المعاملات/المرفقات. هذا لا يغيّر نتيجة بوابة الملكية القرائية.

### N1 — نطاق غير مغطى يحتاج تدقيقًا أمنيًا مستقلًا

لم تكن قراءات `dailySituationService` ولا مسارات التكليفات والدورات ضمن المسارات الأحد عشر التي عولجت في هذا الإصلاح، ولم تُختبر ضمن نطاقه. هذا **نطاق غير مغطى** يحتاج تدقيقًا أمنيًا مستقلًا للتحقق من تطبيق نطاق الملكية عليه. لا يثبت هذا التقرير وجود ثغرة في تلك المسارات، ولا يدّعي إغلاقها.

## 9. واقعة التشغيل المكرر غير المقصود

- محاولة Tester الأولى أرجعت خطأ نقل `getaddrinfo ENOTFOUND opencode.ai` **بعد** بدء التنفيذ، فأنتجت sandbox مكتملًا `ALSQAYA-personnel-checks-20261103-225149-273` (6/6، 13/13، 9/9، exit 0).
- بعد الخطأ أُنشئت جلسة Tester ثانية فأنتجت التشغيل المعتمد `...230221-418` (6/6، 13/13، 9/9، exit 0).
- التشغيلان مستقلان (sandbox/قاعدة/منافذ منفصلة)، ولا تلوث متبادل؛ لكنهما يخالفان تعليمة «مرة واحدة» من ناحية الانضباط التشغيلي.
- **الإجراء الوقائي المطلوب مستقبلًا:** قبل إعادة إرسال أمر «مرة واحدة» بعد خطأ في طبقة النقل، افحص وجود آثار تنفيذ (مجلدات sandbox جديدة، `personnel-results.json`، عمليات/منافذ) وانتظر استقرارها. ويُفضّل إضافة قفل تشغيل (run lock/run-id) في المشغّل يرفض تشغيلًا ثانيًا لنفس الموافقة.

## 10. Git والنسخة الاحتياطية

- **Git:** لا commit/tag/push. الفرع `phase-10-api-data-layer`، HEAD `aab11f4`، عدد الملفات المتعقبة المعدّلة = 24 (تشمل إصلاح الملكية وتعديلات سابقة قائمة). ملفات الاختبار/الحراس/المشغّل غير متعقبة.
- **النسخة الاحتياطية القابلة للاسترجاع:**
  `..\ALSQAYA-backup-before-personnel-ownership-20261103-200144`
  - 16,554 ملفًا / 320,886,598 بايت
  - `CopyDifferences: 0`، `RestoreDifferences: 0`، `SourceDifferences: 0`
  - تشمل `.git` وتقرير حجب 503، و`restore-probe` ناجح
  - تحقق: `2026-11-03T20:37:18+03:00`

## 11. حفظ الأدلة والتنظيف

### الأدلة (خارج مجلدات الاختبار)

`C:\Users\dell\AppData\Local\Temp\opencode\ALSQAYA-personnel-evidence-20261103-234913`

وتحتوي: نتائج وسجلات التشغيل المعتمد، والتشغيل غير المقصود، والفحصين التمهيديين، وملاحظة النسخة الجزئية، وإعدادات معقّمة (بلا كلمات مرور)، و`environment.json`، و`manifest-sha256.json` (تحقق: 0 اختلافات).

### التنظيف المنفّذ

حُذفت المجلدات الخمسة التالية فقط، بعد التحقق من: وقوعها داخل `Temp\opencode`، وعدم كونها روابط، وعدم استخدام أي عملية/منفذ لها، وحفظ الأدلة، وعدم مسّ المشروع أو النسخ الاحتياطية:

| المجلد | الحجم قبل الحذف |
|---|---|
| `ALSQAYA-personnel-checks-20261103-214833-415` | 8,551 ملفًا / 143.6MB (نسخة جزئية) |
| `ALSQAYA-personnel-checks-20261103-215551-542` | 16,378 ملفًا / 303.6MB (فحص تمهيدي) |
| `ALSQAYA-personnel-checks-20261103-224027-018` | 16,378 ملفًا / 303.6MB (فحص تمهيدي) |
| `ALSQAYA-personnel-checks-20261103-225149-273` | 19,456 ملفًا / 357.4MB (تشغيل غير مقصود) |
| `ALSQAYA-personnel-checks-20261103-230221-418` | 19,456 ملفًا / 357.4MB (التشغيل المعتمد) |

لم يُحذف: المشروع، النسخ الاحتياطية، لقطة التحقق `ALSQAYA-personnel-verification-20261103-213350-888`، ولا مجلدات `ALSQAYA-phase23-p0-checks-*`.

## 12. إعادة الاختبارات

```powershell
powershell -NoProfile -File .\server\tests\runPersonnelOwnershipChecks.ps1
```

يتطلب: Windows، PowerShell 5.1، Node v24.21.0، `node_modules` موجودة (بلا تثبيت)، ومسار عمل ASCII للـsandbox. لا يحتاج اتصالًا بقاعدة العمل.

## 13. القيود الملتزم بها

- لم تُعدَّل شيفرة التطبيق أو الاختبارات في مرحلة الإغلاق.
- لم تُعَد الاختبارات.
- لا commit/tag/push.
- حجب التقارير 503 سليم.
- لم يبدأ أي إصلاح جديد.
