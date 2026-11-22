# تقرير مراجعة المرحلة العاشرة — API Data Layer

**التاريخ:** 22 نوفمبر 2026  
**المرجع:** `ALSQAYA_PLAN.md` §26 — Phase 10  
**المراجعة:** [PR #69](https://github.com/daboolgame123-creator/Saqa/pull/69) — Draft / NO MERGE  
**الفرع:** `audit/phase10-api-data-layer-20261122`  
**الحالة:** `PHASE10_FIX_CANDIDATE / FINAL_CI_PENDING / HOST_ACCEPTANCE_PENDING`

## النطاق
- اختيار مصدر البيانات `getDataAdapter`: API هو الافتراضي؛ `localStorage` تجريبي صريح، ولا fallback بعد 401/403/خادم متوقف.
- `ApiClient`: GET/POST/PATCH/DELETE وJSON وtimeouts والأخطاء والـBearer الداخلي و`requestId`.
- `ApiDataAdapter`: Employees، Transactions مع cursor pagination، M:N links، Daily Situations، Personnel Records، Timeline.
- انتقال DTO إلى Domain ثم واجهة المستخدم، وخاصة حقول `Transaction` التي يضيفها الخادم أو يتحكم في حفظها.
- قواعد المصادقة والجلسات (Phase 11) المتكاملة مع العميل، لكن دون إعادة تصميم التسجيل أو إعادة تعيين الرموز.
- `App.tsx`: بدء التشغيل من API، لا كتابة محلية رسمية للبيانات، واستلام UUID وversion من الخادم قبل تحديث الحالة.

## مشكلات مُثبتة وإصلاحاتها
| العيب | الأثر | الإصلاح |
|---|---|---|
| رد GET/POST/PATCH/DELETE لمورد قد يصل بعد تبديل حساب المستخدم، بينما عميل API يرجعه كنجاح | احتمال عرض بيانات الحساب القديم في جلسة الحساب الجديد | فحص **جيل الجلسة** عند اكتمال قراءة جسم الرد لجميع مسارات الموارد، ورفض بيانات الجيل القديم بخطأ `SESSION_CHANGED` |
| الاعتماد على مقارنة نص الـBearer فقط لا يكشف تسجيل خروج ثم تسجيل دخول برمز مطابق | قبول رد/صفحة قديمة في سياق جديد | إضافة `getBearerRevision` وتحديثها في `setBearerToken` و`invalidateBearerToken`، واستعمالها في cursor pagination |
| `toTransaction` يهمل `targetScope` رغم إرساله من `toTransactionDto` على الخادم | ضياع نطاق الاستهداف من نموذج الواجهة بعد حفظ/قراءة المعاملة | نقل `targetScope` حرفياً عندما يكون موجودًا؛ عدم اختراع قيمة عند غيابه |
| الحظر العام لردود الجيل القديم تداخل مع عقد إلغاء تسجيل الدخول/الـOTP في `/auth/*` | كسر تدفقات المصادقة المتزامنة المراجعة سابقًا | الإبقاء على مسؤولية جيل المصادقة في PilotAuth، مع حظر الردود **البيانية** القديمة فقط؛ حفاظًا على 401 المتأخر كـ401 دون إلغاء رمز جديد |

## ضمانات صحيحة حُفظت
- لا fallback تلقائي إلى localStorage عند فشل API أو المصادقة؛ وضع `local` خيار اختبار صريح.
- إنشاء السجلات عبر الخادم يُعيد ID/UUID الفعلي، والكتب تُعيد شهرها المشتق ونسخة القفل التفاؤلي.
- قراءة الكتب مقسمة إلى صفحات محدودة (100) مع حارس للتكرار والتغير أثناء التحميل؛ لا عرض أرشيف جزئي ناجح إذا فشلت صفحة.
- الحقول غير المعرّفة تُحذف من الجسم قبل الإرسال، والخادم يرفض الحقول غير المسموحة.
- صلاحيات القراءة والكتابة تتحقق في الخادم؛ client-only لا يُعتبر حماية.
- Dark mode وحده قد يبقى في localStorage كتفضيل جهاز، وليس بيانات منتسبين.

## بوابة الاختبار
[GitHub Actions — Phase10](https://github.com/daboolgame123-creator/Saqa/actions/workflows/phase10-api-data-layer-audit.yml)

1. TypeScript 5.8 وبناء React/Vite.
2. اختبارات العميل الفعلية: بيانات حساب قديم بعد logout/login، 401 قديم، إعادة نفس نص Bearer، التبديل أثناء تنزيل جسم HTTP، وتحويل `targetScope` من DTO.
3. اختبار REST PostgreSQL حقيقي على إنشاء/قراءة/تعديل `targetScope` وعرضه في Domain.
4. اختبارات `test:server` و`test:db` و`test:api` كاملة؛ تشمل حالات المصادقة المتزامنة لمنع كسرها.
5. دمج **تجريبي غير منشور** للمراحل 1–10 داخل runner مع SHA مثبتة لكل مرحلة، وفحص `npm audit --omit=dev --audit-level=high`.
6. أحدث React/Vite و`pg` مع TypeScript 5.8 على runner مؤقت فقط؛ لا فرض TypeScript7.

**لا يُغلق تدقيق Phase10 إلا إذا نجحت جميع وظائف CI على الالتزام الأخير.** PR #60–69 غير مدمجة. لم تُستخدم بيانات `alsqaya_staging` ولم تُغيّر ملفات UI-04/A2.3 المحلية. تبقى تهيئة ترحيل Phase1 وUAT المضيف والاعتماد الإنتاجي لاحقًا بموافقة مستقلة.
