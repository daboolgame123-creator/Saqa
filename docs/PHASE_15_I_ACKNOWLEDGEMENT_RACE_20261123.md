# Phase 15-I — قفل سباق الأرشفة والإقرار الرسمي

**التاريخ:** 2026-11-23  
**المرشح:** [Draft PR #89](https://github.com/daboolgame123-creator/Saqa/pull/89)، HEAD `8320d749d7d62fcf131e6f0a10d5c02a81914a32`  
**الأساس:** [15-H PR #88](https://github.com/daboolgame123-creator/Saqa/pull/88)  
**الحكم:** `P15_08_CODE_FIX_VERIFIED / INDEPENDENT_SECURITY_REVIEW_PENDING / NO_MERGE / RELEASE_NO_GO`.

## A — خلل TOCTOU المثبت

خدمة `ViewLogApiService.acknowledge` كانت تتحقق من نطاق الكتاب وكونه **إعمامًا واردًا عامًا غير مؤرشف** عبر `transactions.findById`، ثم تُنفّذ `INSERT INTO view_logs` مستقلًا. في الفاصل بينهما يمكن لمستخدم إداري أرشفة الكتاب أو تغيير نطاق رؤيته، فلا يضمن النظام أن حالة الكتاب التي سُمح لأجلها بالإقرار بقيت صحيحة لحظة حفظ الإقرار.

**RED — [CI #45137606374](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137606374)** على `3f9ad28c2e3099b522b70e09ac553e6e73434299`: اختبار HTTP متزامن يوقف `INSERT INTO view_logs` بقفل اصطناعي في trigger، ثم يطلب الأرشفة. نجحت الأرشفة **قبل فك قفل كتابة الإقرار**؛ فشل الاختبار الجديد: `expected: blocked, actual: archived`. هذا دليل تشغيل فعلي على خلل الترتيب، لا افتراض نظري. لا يوجد دليل على استغلاله في بيانات المستخدم.

## B — إصلاح صغير ومحدد

تعديل **كود إنتاج واحد**: `server/src/api/services/viewLogService.ts`.
- إذا استخدمت الخدمة `Pool`، فتُنفَّذ العملية كلها داخل `withTransaction` على Client مشترك، دون فتح معاملة جديدة إذا استُدعيت أصلًا داخل Client.
- التحقق الموجود للنطاق وقاعدة `وارد + PublicToEmployees` يبقى قبل الإقرار.
- أُضيفت إعادة فحص SQL **داخل المعاملة مع `FOR SHARE OF t`** قبل `INSERT`، تتحقق من المعرّف وعدم الأرشفة والاتجاه والنطاق الإداري/الفعلي نفسه (`transactionScopeCondition`)، مع إبقاء قفل صف الكتاب حتى COMMIT. بذلك يتسلسل إما الإقرار ثم الأرشفة، أو الأرشفة ثم رفض إقرار غير مؤهل.
- بقي `ON CONFLICT` ووقت الإقرار الأول وفاعل الجلسة وحقول DTO كما هي؛ لا تغيير على صلاحيات RBAC أو migrations أو قاعدة Audit أو إشعارات PostgreSQL.

**اختبار واحد** أضيف إلى `server/tests/api/acknowledgement.test.ts`: يحتجز إدراج الإقرار باستخدام advisory gate مؤقت داخل PostgreSQL اصطناعية، يتحقق من أن الأرشفة لا تكتمل قبله، ثم يرفع القفل ويتأكد من نجاح الإقرار والأرشفة بالتسلسل وبقاء صف ViewLog واحد.

## GREEN — دليل آخر SHA

[GitHub Actions #45137856092](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137856092) **SUCCESS على HEAD `8320d749d7d62fcf131e6f0a10d5c02a81914a32`**:
- Server: **418 PASS / 1 SKIP**.
- PostgreSQL synthetic: **243 PASS**.
- API: **310 PASS**.
- إجمالي **971 PASS / 0 FAIL / 1 SKIP** (الاختبارات الموجهة المعادة لا تُضاف للإجمالي).
- اختبار السباق الجديد ناجح، وكذلك اختبارات الإقرار والأرشفة وAuth/RBAC/Scope والذرية السابقة. TypeScript/lint/build ناجحة.
- `npm audit --omit=dev --audit-level=high`: **0 high/critical** و**2 moderate** معروفتان.

## قرار المرحلة / توزيع المسؤوليات

- **CHAT:** أغلق ثغرة السباق المحددة برمجيًا واختبرها، ولا يقترح فتح اختبارات جديدة بلا عيب مثبت؛ المرحلة 15 الآن **CODE_CANDIDATE_PASS**.
- **OpenCode `OC-15-ATOMIC-AUDIT`:** `READY_TO_SEND / NOT_ASSIGNED`؛ المراجعة المستقلة تشمل الآن ذرية الإقرار وقفل `FOR SHARE` وتسلسل الأرشفة وتغيّر الصلاحية، إلى جانب Audit والإشعارات. لا تختزل مراجعة OpenCode في تكرار CI.
- **OpenCode `OC-11-SEC`:** مراجعة أمن المصادقة المستقلة `NOT_ASSIGNED`.
- **OWNER/HOST:** أذونات سجل Audit التشغيلية، تجربة Windows/LAN الحقيقية، قبول سياسة هوية المنتسب وتفاصيل الإقرار الاستثنائية، وإقرار قرار الدمج.
- **Phase16:** لم يبدأ وفق شرط المشروع «لا انتقال قبل إغلاق المرحلة»؛ لا يُساوى نجاح CI باعتماد مستقل أو قبول تشغيل.

**القيود:** `NO MERGE / NO PUSH TO BASE / NO STAGING / NO REAL DATA / RELEASE_NO_GO`.
