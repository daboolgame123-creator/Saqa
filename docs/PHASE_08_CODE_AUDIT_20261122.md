# Phase 8 — Backend Foundation — تدقيق الشيفرة

**التاريخ:** 22 نوفمبر 2026  
**الخطة:** `ALSQAYA_PLAN.md` §24، Phase 8  
**الفرع:** `audit/phase8-backend-foundation-20261122`  
**PR:** [#67](https://github.com/daboolgame123-creator/Saqa/pull/67) — Draft / NO MERGE  
**الحالة قبل CI النهائي:** `PHASE8_PATCH_CANDIDATE / FINAL_CI_PENDING / HOST_ACCEPTANCE_PENDING`

## نطاق الفحص
- `server/src/app.ts` و`server.ts`: Express middleware ordering، نقطة التشغيل، إنشاء الخادم، الإغلاق والإشارات
- `config/env.ts`: NODE_ENV، PORT، LOG_LEVEL، DATABASE_URL، حدود المرفقات، عدم طباعة أسرار الإعدادات
- `routes/` و`api/routes/`: عزل health عن مسارات API المحمية وتدرج controllers/services/repositories/validators
- `middleware/`: الطلب ومعرّفه و404، تصنيف الأخطاء التشغيلية/الداخلية، شكل الرد والتسجيل
- `health/`: health للفحص الحيوي وreadiness لحالة lifecycle واتصال PostgreSQL
- `logging/`: structured JSON logs وفصلها عن Audit Log وتنقية البيانات الحساسة
- `jobs/`: JobRegistry وJobRunner ومنع التراكب والوظائف الجارية عند الإغلاق
- ضمان تكامل الإصلاحات مع مرشحي Phase1–7، دون تحوير قواعد الأعمال أو ترحيل قاعدة حقيقية

## العيوب المثبتة وإصلاحاتها

| العيب | الأثر | الإصلاح |
|---|---|---|
| `createShutdownHandler` يردّ فورًا على الطلب الثاني أثناء استمرار الإغلاق الأول | الإغلاق قد يُعتقد مكتملًا بينما الوظائف والاتصالات ما تزال تعمل | Promise واحد محفوظ لكل النداءات حتى نهاية التنظيف |
| فشل `jobRunner.stop` كان يوقف تسلسل التنظيف قبل إغلاق HTTP وPool | موارد قد تبقى مفتوحة | محاولة كل خطوة تنظيف مستقلة بالترتيب، تسجيل الخطأ، ووضع Exit Code فاشل |
| `JobRunner.stop` يتجاهل `runNow` عندما لم يبدأ المؤقت | يمكن إغلاق قاعدة البيانات بينما وظيفة يدوية تعمل | انتظار جميع الأعمال الجارية حتى في الوضع اليدوي؛ منع تنفيذ جديد أثناء الإغلاق |
| حدث `listening` قد يعيد `ready` بعد بدء الإغلاق | نشر readiness خاطئ | لا يُستدعى `markReady` إن كانت الحالة `shutting-down` |
| `redactFields` لا يفحص المصفوفات | OTP/Token/Password في كائنات ضمن مصفوفات تصل إلى السجل | تنقية recursive للكائنات والمصفوفات بلا تعديل المدخل |
| readiness يعيد أخطاء PostgreSQL الخام إلى عميل مجهول | كشف اسم مستخدم/عنوان مضيف/معلومة بنيوية | رسالة 503 عامة؛ يبقى التشخيص في السجل التقني |
| انتهاء مهلة readiness يترك استعلامًا جاريًا ثم ينشئ استعلامًا جديدًا كل مرة | استهلاك متراكم للـPool إذا تعطّل DB | إعادة استخدام محاولة probe واحدة حتى تستقر، وتحرير Timer عند اكتمال الرد |

## الفحص الوظيفي المُخطط
- `npm run lint` (TypeScript) و`npm run build` (Vite)
- اختبار health 200/readiness 503/الأخطاء المنظمة ومعرّف الطلب
- اختبار `shutdown` مزدوج لنفس Promise أثناء وظيفة مجدولة يدويًا، وأن HTTP لا يغلق قبل انتهاء العمل
- اختبار تنقية OTP وToken وكلمة المرور داخل مصفوفات nested
- اختبار فشل PostgreSQL على `127.0.0.1:1` (بيانات اصطناعية فقط، بلا خادم أو شبكة خارجية)، مع منع كشف اسم مستخدم/كلمة مرور في 503
- `npm run test:server`, `npm run test:db`, `npm run test:api`
- دمج **تجريبي غير منشور** للمراحل 1–8 داخل GitHub Actions بمراجع ثابتة والتحقق من `npm audit --omit=dev --audit-level=high`
- أحدث React/Vite مع TypeScript 5.8 فقط على Runner مؤقت؛ عدم فرض TypeScript7 حتى تعالج مشكلات الترقية العامة

## حدود الحكم
المشروع لا يُطلق أو يُدمج لأن اجتياز CI عن بُعد لا يساوي اختبار التشغيل المحلي. PR #60–67 كلها منفصلة وغير مدمجة. لا اتصال بـ`alsqaya_staging` ولا ملف شخصي حقيقي ولا تعديل لتغييرات UI-04/A2.3 الموجودة خارج GitHub. يبقى تطبيق migration 0016 مع preflight على قاعدة اختبار محلية منفصلة عند توفر الحاسوب.

**لا يُعتمد الإغلاق البرمجي حتى تنجح جميع الوظائف على آخر commit واحد.**
