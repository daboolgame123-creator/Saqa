# Phase 15 — code audit evidence: 15-A → 15-D

**التاريخ:** 2026-11-23  
**المرشح:** [Draft PR #84](https://github.com/daboolgame123-creator/Saqa/pull/84)، مبني على [#83](https://github.com/daboolgame123-creator/Saqa/pull/83)، [#82](https://github.com/daboolgame123-creator/Saqa/pull/82)، [#81](https://github.com/daboolgame123-creator/Saqa/pull/81).  
**الكود المختبر:** `b6fd066e78352541b7486deb268e59067e2e740e`.  
**الحالة:** `P15_01_REDACTION_PASS / P15_02_SCOPED_ATOMICITY_PASS / INDEPENDENT_SECURITY_REVIEW_PENDING / NO_MERGE / HOST_PENDING`.

## 1. ما كشفته المراجعة

- **P15-01 — تنقية غير مكتملة للمفاتيح السرية:** `auditTypes.isSensitiveKey` لم يتعرف على `Authorization`، `cookie`، `apiKey`، `privateKey` ومشتقات. أصلح CHAT القاعدة وأضاف اختبارًا يتأكد من redaction داخل `old_values/new_values` المتداخلة دون فقد `badgeNumber` والحقول العادية.
- **P15-02 — فقدان حدث التدقيق بعد نجاح المجال:** كانت الكتابة في `transactions` أو الإتاحة أو عمليات إدارية أخرى تكتمل **قبل** كتابة `audit_logs`. أثبت [DIAGNOSTIC CI #45079563990](https://github.com/daboolgame123-creator/Saqa/actions/runs/45079563990) على بيانات اصطناعية حالة **HTTP 500 + كتاب دائم بلا Audit CREATE**؛ نجاح التشخيص لم يكن قبولًا أمنيًا.
- **P15-03 — أذونات DB:** `audit_logs` لا يملك حارس trigger يمنع UPDATE/DELETE من مستخدم PostgreSQL عالي الصلاحية؛ سياسة §31 تُلزم منع المستخدم العادي ومسارات API، وهو متحقق. صلاحيات حساب المضيف والتحقق من عدم اتاحة DB للمستخدمين العاديين تبقى **HOST**.
- **P15-04 — فشل إشعار بعد commit:** بعض مسارات المجال قد تنجح وتُدقق ذريًا، ثم يفشل إنشاء الإشعار بعد commit فيعود خطأ HTTP. لا يترك تغييرًا **بلا Audit** لكنه يؤثر في إمكانية إعادة المحاولة. ليس موضوع هذا الإصلاح؛ يوجّه لمراجعة معمارية مستقلة دون إنشاء Outbox غير مُعتمد.
- **P15-05 — محتوى الأحداث:** الأحداث المطلوبة «عند الحاجة» وفق §31، والاستيراد التاريخي/تغيير الأدوار معلقان على وجود عملية إنتاجية معتمدة؛ لم تُخترع أحداث أو صلاحيات عامة.

## 2. الإصلاح — معاملة SQL واحدة للمجال والتدقيق

أضيف `ApiServices.auditedMutation` باستخدام `withTransaction` الموجود، مع عميل PostgreSQL واحد لكل طلب كتابة حساس. إذا فشل `recordAuditEvent` ترجع **ROLLBACK** لكتابة المجال، وليس استجابة 500 مع بيانات محفوظة بلا تدقيق. يدعم الوضع عندما يكون السياق `Client` داخل معاملة قائمة، فلا يفتح `BEGIN` متداخلًا.

المسارات المشمولة:

| مسار العمليات | أحداث التدقيق |
|---|---|
| إنشاء/تعديل/انتقال حالة/أرشفة/استعادة كتاب | `create/update/status_change/archive` |
| منح إتاحة فردية وجماعية وسحبها | `create/update` |
| نقل حالة المنتسب | `status_change` |
| إنشاء/تعديل طلب وتحريك workflow | `create/update/status_change` |
| إنشاء/إزالة علاقة بين كتابين | `create/update` |

الأحداث تتلقى الفاعل من الجلسة، ولا تقبل `actor` من جسم العميل. **إشعارات Phase21 تُرسَل بعد نجاح COMMIT**؛ لا إرسال خارجي داخل معاملة قاعدة البيانات. لم يتغير `ViewLog` أو زمن ختم «اطلعت» ولا خريطة RBAC أو Access Scope. ولم تُضَف مزايا جديدة.

## 3. الأدلة — اختبارات حقيقية معزولة

- [CI #45080332491](https://github.com/daboolgame123-creator/Saqa/actions/runs/45080332491): **SUCCESS** على الكود `b6fd066e78352541b7486deb268e59067e2e740e`.
- الجمع التجريبي لفروع المراجعة 1–10 مع إصلاحات 11–15 يتم في Runner موقّت فقط، لا Merge.
- **418 server PASS + 243 synthetic PostgreSQL DB PASS + 301 API PASS = 962 PASS / 0 FAIL / 1 SKIP**. الاختبارات الأمنية الموجّهة تكرر بعض الحالات؛ لا تُضاف مرة ثانية إلى 962.
- اختبار تغيير الاسم/البصمة والـRBAC والنطاق والمرفقات ما زال يمر، وكذلك التقارير المحجوبة.
- **حالات failure injection المثبتة** على قاعدة `alsqaya_test` وحدها:
  1. تعطيل Audit CREATE لكتاب: HTTP 500، **لا كتاب بعد ROLLBACK ولا Audit نجاح كاذب**.
  2. تعطيل Audit GRANT لإتاحة: HTTP 500، **لا صف إتاحة يبقى**.
  3. منح طبيعي، ثم تعطيل Audit REVOKE: HTTP 500، **تبقى الإتاحة سارية** وسجل المنح الصحيح محفوظ؛ لا حدث سحب كاذب.
- بقية المسارات (تحديث/أرشفة/طلبات/روابط) شملها نفس الغلاف الذري واجتازت اختبارات الانحدار، **لكن لم تُجرَ حقنة فشل مستقلة لكل مسار**؛ يلزم تحقق مستقل يركز على أخطرها.
- TypeScript/Build و`npm audit --omit=dev --audit-level=high`: PASS، **0 high/critical** و**2 moderate**.

## 4. قرار المرحلة والمهام المتبقية

- **CHAT:** أنجز 15-A الفحص، 15-B تنقية البيانات والتشخيص، 15-C إصلاح إنشاء الكتاب، 15-D تعميم الحارس واختبارات تراجع SQL.
- **OpenCode (مطلوب مراجعة مستقلة، غير مسند):** افحص `ApiServices.auditedMutation` وتفاصيل مسارات `transaction/availability/employee/request/relation`، احتمالات المعاملات المتداخلة، الأحداث أو العمليات غير المغطاة، وتوقيت الإشعارات بعد commit. ابدأ **Plan/Read-only**، ثم نفّذ فقط أخطاء مثبتة على فرع جديد وباختبارات synthetic. [نص التسليم الأصلي](https://github.com/daboolgame123-creator/Saqa/blob/fix/phase15-d-audit-atomic-operations-20261123/docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT.md)؛ الأساس الأحدث **PR #84**.
- **OWNER/HOST:** أذونات مجلد التخزين وقاعدة PostgreSQL، الاختبارات المحلية للملفات وAudit والـLAN، قرار الأدوار. لا تغيير مباشر في `alsqaya_staging`.
- **OC-11-SEC:** مراجعة المصادقة المستقلة من Phase11 ما زالت `NOT_ASSIGNED`.

**بوابة الإغلاق:** لا `PHASE15_FINAL_SECURITY_CLOSED` قبل مراجعة OpenCode والاختبارات التشغيلية المطلوبة، ولا `RELEASE_GO`؛ ولا ننتقل إلى Phase16 audit قبل إغلاق ما يمنعها من ثغرات مثبتة. بعد إضافة هذا التقرير يلزم تأكيد CI جديد على HEAD النهائي.

**التزامات:** `DRAFT / NO MERGE / NO STAGING / NO PRODUCTION DATA`.
