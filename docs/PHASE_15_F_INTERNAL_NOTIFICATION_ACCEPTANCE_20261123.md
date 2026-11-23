# Phase 15-F — إغلاق خلل الإشعارات الداخلية غير الذرّية ضمن مرشح الكود

**التاريخ:** 2026-11-23  
**المرشح المختبر:** [Draft PR #86](https://github.com/daboolgame123-creator/Saqa/pull/86)، HEAD `29aa53d8dd7e8581056c4e6fb2a34b9872a0ef02`.  
**الأساس:** [Phase 15-E PR #85](https://github.com/daboolgame123-creator/Saqa/pull/85).  
**الحالة:** `P15_06_SCOPED_FIX_VERIFIED / PHASE15_INDEPENDENT_SECURITY_REVIEW_PENDING / NO_MERGE / RELEASE_NO_GO`.

## P15-06 — الخلل المثبت

كان `auditedMutation` يحفظ تعديل المجال وحدث Audit داخل `withTransaction` ثم ينفّذ `NotificationEventService` **بعد COMMIT** في:
- إنشاء إعمام وارد عام (`new_broadcast`)؛
- منح إتاحة للكتاب (`book_available`) الفردية والجماعية؛
- حركة الطلب `submit` (`new_request`) وقرارات المدير (`request_update`).

الخطر المحدد: `NotificationEventService` لا يستدعي بريدًا أو SMS خارجيًا؛ يكتب صفوف `notifications` عبر SQL على PostgreSQL نفسها. إذا فشل هذا `INSERT` بعد COMMIT، يعود HTTP 500 بينما تظل المعاملة أو الإتاحة أو حركة الطلب محفوظة ومعها Audit؛ وقد يعيد المستخدم العملية وهو يعتقد أنها فشلت.

**إثبات RED:** [GitHub Actions #45130019980](https://github.com/daboolgame123-creator/Saqa/actions/runs/45130019980)، على SHA `40f34ad91071da63a3d149c3e50f28877b92b479` قبل إصلاح الإنتاج:
1. عند منع `book_available`: رد HTTP 500، وبقيت إتاحة الكتاب محفوظة رغم توقع ROLLBACK.
2. عند منع `new_request`: رد HTTP 500، وبقي طلب المدير في حالة `submitted` رغم توقع بقائه `draft`.
  
فشلت حالتا الاختبار على الكود القديم كما هو متوقع. هذا دليل تشخيصي لخلل حقيقي، لا فشل غير مرتبط.

## الإصلاح المحدود

عدّل CHAT ثلاثة controllers فقط: `transactionController.ts` و`availabilityController.ts` و`requestController.ts`.

أصبحت **كتابة الإشعارات الداخلية** في callback `scoped` من `auditedMutation`، وهو نفس PostgreSQL Client الذي ينفّذ العملية وAudit. فشل أي INSERT يسبب ROLLBACK للكل؛ لا نجاح كاذب ولا صف إشعار جزئي. لم تتغير شروط المستلمين أو الحارس التاريخي أو خريطة الأدوار أو نطاق الرؤية أو الـDTO. لا إدخال Outbox جديد ولا إرسال خارجي داخل المعاملة.

ملاحظة معمارية: القاعدة السابقة التي تفصل **الآثار الخارجية** لما بعد COMMIT تبقى سليمة للاتصالات الخارجية؛ ما نقلناه إلى المعاملة هو **إشعار داخلي عبارة عن INSERT في قاعدة البيانات ذاتها**.

## نتيجة GREEN — على HEAD النهائي نفسه

[GitHub Actions #45130471066](https://github.com/daboolgame123-creator/Saqa/actions/runs/45130471066): **SUCCESS** على SHA `29aa53d8dd7e8581056c4e6fb2a34b9872a0ef02`.

- الخادم: **418 PASS / 1 SKIP**.
- PostgreSQL الاختبارية: **243 PASS**.
- API: **306 PASS**.
- **الإجمالي 967 PASS / 0 FAIL / 1 SKIP** (لا تعاد إضافة الاختبارات الموجهة).
- الاختبارات الجديدة الثلاثة `phase15InternalNotificationAtomicity.test.ts` **3/3 PASS**: `book_available`، `new_request`، `new_broadcast`. لكل حالة: فشل INSERT الصناعي يؤدي إلى ROLLBACK، ثم تنجح المحاولة النظيفة لاحقًا مع إشعار واحد.
- كل اختبارات Audit/RBAC/Access Scope السابقة والتجميع التراكمي على GitHub runner معزول نجحت. TypeScript/build و`npm audit --omit=dev --audit-level=high` PASS (0 high/critical، تنبيهان moderate معروفان).

## فرز المهام والإغلاق

| البند | الحالة | من يُنجزه |
|---|---|---|
| P15-06 — رد مضلل عند فشل إشعار داخلي | `FIXED_AND_TESTED_IN_PR86` | CHAT |
| مراجعة ذرية المجال + Audit + صفوف Notifications داخل Client واحد | `INDEPENDENT_REVIEW_PENDING / NOT_ASSIGNED` | OpenCode لاحقًا، في وضع Plan/read-only |
| فشل إشعارات خارجية أو رسوم الإرسال | `NOT_IN_SCOPE` | لا يوجد إرسال خارجي في `NotificationEventService` الحالي |
| حماية `audit_logs` بصلاحيات DB التشغيلية، اختبار Windows/LAN الحقيقي | `HOST_PENDING` | المالك والمضيف |
| مراجعة أمان Phase11 المستقلة | `OC-11-SEC NOT_ASSIGNED` | OpenCode لاحقًا |

**الحكم:** `PHASE15_CODE_CANDIDATE_PASS / SECURITY_REVIEW_PENDING / HOST_ACCEPTANCE_PENDING / NO_MERGE / RELEASE_NO_GO`. لا يفتح هذا الإصلاح المرحلة 16 ولا يصرّح بدمج فروع المراجعة أو لمس `alsqaya_staging`.
