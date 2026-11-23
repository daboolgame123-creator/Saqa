# Phase 15-H — منع الإقرار الرسمي للكتب غير المؤهّلة

**التاريخ:** 2026-11-23  
**المرشح:** [Draft PR #88](https://github.com/daboolgame123-creator/Saqa/pull/88)، SHA نهائي مختبر `f13fd2923ebe5aaf47b9a675a752901d88729f40`.  
**الأساس:** [15-G PR #87](https://github.com/daboolgame123-creator/Saqa/pull/87).  
**الحكم:** `P15_07_SCOPED_CODE_PASS / OC-15_INDEPENDENT_REVIEW_PENDING / NO_MERGE / RELEASE_NO_GO`.

## A — الفحص والدليل

`server/src/api/services/viewLogService.ts` كان ينفذ فحص **المرئية فقط** بـ`transactions.findById(transactionId, scope)`، ثم يُسجل `view_logs` عبر `acknowledgeView`. لذلك كانت استدعاءات `POST /api/transactions/:id/acknowledge` المباشرة قادرة على إصدار «اطلعت» رسمي **لكتاب صادر عام أو كتاب وارد إداري** ما دام الفاعل يستطيع رؤيته، رغم أن إجراء الإقرار في UI-06 مخصص للإعمامات.

- **RED:** [CI #45134122362](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134122362) على SHA `95939c821762d640c9ac66936e9582adefac7f3e`: الاختبار الجديد لرفض الإقرار على كتاب عادي توقع HTTP 404 لكن تلقى **HTTP 200** — كشف خللًا في فرض قاعدة العمل على الخادم، لا في صلاحية القراءة.
- هذه الحالة تلوّث `view_logs` وقد تؤثر على مؤشرات الاطلاع إذا لم تُصفِّ التقارير السجلات غير المؤهلة. لا يُثبت من هذا الاختبار وحده تلوث تقرير منشور أو وصول غير مخول إلى كتاب.

## B — أصغر إصلاح برمجي

في `ViewLogApiService.acknowledge` وبعد فحص النطاق، يجب أن يكون الكتاب **واردًا** (`direction='وارد'`) وبإتاحة عامة للمنتسبين (`visibility='PublicToEmployees'`) قبل حفظ «اطلعت». هذا يطابق الشرط المستعمل أصلًا في `transactionController.emitNewBroadcastNotification` لإعمام عام. أي كتاب مرئي لكنه ليس إعمامًا عامًّا يحصل على HTTP 404 بدون إنشاء `view_logs`؛ والكتاب المحجوب يبقى 404 أيضًا. لا تغيير لخريطة RBAC أو هوية الجلسة أو طابع أول إقرار أو بيانات الأرشيف أو قواعد PostgreSQL.

في `server/tests/api/acknowledgement.test.ts` جُعلت حالات النجاح تستعمل إعمامًا واردًا عامًا، وأضيف اختبار واضح لرفض كتاب صادر عام وكتاب وارد إداري، مع التحقق من عدم إنشاء `view_logs`. تغير fixture واحد في `server/tests/api/softDelete.test.ts` لاستخدام إعمام صحيح قبل الأرشفة. ظل اختبار بقاء سجلات الاطلاع بعد الأرشفة قائمًا دون تخفيف.

**تمييز السياسة:** معيار «الإعمام العام» هنا هو `وارد + PublicToEmployees` الموجود في النظام، وليس `subType` الحر. إذا طلب المالك لاحقًا إقرارًا لكتاب خاص أو سياسة لإعمام غير عام، فيجب قرار تصميم مستقل قبل فتح الاستثناء؛ لا يُخمَّن من حقل الوصف.

## نتائج GREEN والتسلسل

- المحاولة الوسيطة [CI #45134233949](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134233949) أثبتت نجاح الحارس الجديد لكنها فشلت فقط في اختبار أرشفة قديم كان يفترض «اطلعت» على كتاب صادر عادي؛ صُححت **بيانات الاختبار**، وليس قاعدة الأرشفة.
- [CI #45134802099](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134802099) **SUCCESS على SHA النهائي `f13fd2923ebe5aaf47b9a675a752901d88729f40`**:
  - **418 server PASS / 1 SKIP**؛
  - **243 PostgreSQL synthetic PASS**؛
  - **309 API PASS**؛
  - **970 PASS / 0 FAIL / 1 SKIP** إجمالي دون إعادة عدّ الاختبارات الموجهة.
- TypeScript/lint، Build، جميع اختبارات Auth/RBAC/Access Scope والأرشفة والتدقيق والإشعارات: PASS. **0 high/critical** و**2 moderate** في اعتماديات الإنتاج.

## المتبقي والتوزيع

- **CHAT:** 15-H مثبت ومصحح ومختبر ضمن نطاقه؛ لا حاجة لاختبارات مكررة بلا سبب.
- **OpenCode — `OC-15-ATOMIC-AUDIT`:** مراجعة مستقلة غير منفذة، تشمل الآن اشتراط إعمام عام في `viewLogService` وتوافقه مع قواعد الأدوار والنطاق والتقارير، إضافةً لذرية المجال + Audit + إشعارات PostgreSQL. `NOT_ASSIGNED`.
- **OpenCode — `OC-11-SEC`:** مراجعة المصادقة المستقلة `NOT_ASSIGNED`.
- **OWNER/HOST:** قرار الإقرار للكتب الخاصة *إذا كان مطلوبًا مستقبلًا*، أذونات PostgreSQL لـ`audit_logs`، قبول تشغيل Windows/LAN والملفات.
- **المرحلة 16:** لم تبدأ، ولا يسمح هذا CI وحده بإغلاق أمان Phase15 أو دمج مرشحات المراجعة.

**قيود:** `DRAFT / NO MERGE / NO STAGING / NO REAL DATA / RELEASE_NO_GO`.
