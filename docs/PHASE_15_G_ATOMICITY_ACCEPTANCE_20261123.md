# Phase15-G — تحقق تراجع الإشعارات الجماعية وقرار المدير

**التاريخ:** 2026-11-23  
**PR:** [#87 (Draft)](https://github.com/daboolgame123-creator/Saqa/pull/87)  
**SHA النهائي المختبر:** `4bf7c9832b854b6e1035bacef1dec5c32839a386`  
**الأساس:** [PR #86](https://github.com/daboolgame123-creator/Saqa/pull/86) — Phase15-F، ذرية الإشعارات الداخلية والمجال وAudit.  
**الحالة:** `PHASE15_G_SCOPED_TEST_PASS / INDEPENDENT_SECURITY_REVIEW_PENDING / NO_MERGE / RELEASE_NO_GO`.

## الفحص والنتيجة

أضاف CHAT **اختبارين HTTP + PostgreSQL اصطناعية فقط** في `server/tests/api/phase15MultiRecipientRollback.test.ts`. لا تغيير لكود الإنتاج أو صلاحيات الأدوار أو نطاق الرؤية.

1. **منح إتاحة جماعية لمنتسبين:** ينجح INSERT الإشعار الأول `book_available` داخل المعاملة، ثم يرفض trigger اصطناعي INSERT الثاني. أثبت الاختبار أن الاستجابة 500، **والمنحان وحدث Audit والإشعار الأول جميعها ROLLBACK**. بعد رفع الخطأ ينجح المنح لكليهما ويصل إشعار واحد لكل مستلم. تكرار bulk بلا إتاحة جديدة يُعيد مجموعة فارغة ولا يُكرر الإشعارات.
2. **اعتماد المدير لطلب مرسل:** يتغير الطلب من `draft` إلى `submitted` بعد إرسال نظامي، ثم يمنع trigger اصطناعي إدراج إشعار `request_update` للمالك عند `approve` من المدير. أثبت الاختبار أن الاستجابة 500 و**الحالة تبقى submitted، والنسخة 2، وتاريخ الطلب لا يتضمن approve، ولا يوجد Audit قرار وهمي**. عند إعادة الاعتماد بعد إزالة trigger، تنجح العملية ويصل إشعار واحد للمالك.

## إثبات CI

- [Run #45132203899](https://github.com/daboolgame123-creator/Saqa/actions/runs/45132203899): **SUCCESS على SHA النهائي المذكور**.
- Server: 418 PASS / 1 SKIP، Synthetic PostgreSQL: 243 PASS، API: 308 PASS.
- الإجمالي بدون تكرار إعادات الاختبارات الموجهة: **969 PASS / 0 FAIL / 1 SKIP**.
- TypeScript/lint، Build، اختبارات Auth/RBAC/Scope وPhase15 الموجهة: PASS؛ فحص إنتاجي للاعتماديات 0 high/critical و2 moderate.
- أول تشغيل على SHA `ce5a3dce2282e9ad6332b7b6d43539a404cec842` فشل لا بسبب كود الإنتاج بل **خطأ في الاختبار**: استعمل `request_status_history.occurred_at` بينما العمود الصحيح `created_at`. صُحِّح على SHA النهائي `4bf7c...` وأعيد CI بالكامل حتى النجاح.

## توزيع المهام وقيود الإغلاق

- **CHAT:** أغلق فجوة الاختبارات P15-G، ولم يكتشف تجاوزًا جديدًا في التنفيذ المختبر لـPR #86.
- **OpenCode — OC-15-ATOMIC-AUDIT:** `READY_TO_SEND / NOT_ASSIGNED`. ما يزال التدقيق الأمني المستقل للتكامل `Pool → Client → domain + Audit + notifications` مطلوبًا قبل إغلاق Phase15 النهائي. اختبارات CHAT لا تحل محل مراجعة مستقلة.
- **OpenCode — OC-11-SEC:** تدقيق المصادقة المستقل السابق ما زال `NOT_ASSIGNED`.
- **OWNER/HOST:** أذونات PostgreSQL على `audit_logs`، UAT على Windows/LAN وملفات المؤسسة، وقرارات الأدوار وسياسة الهاتف المشترك ما زالت خارج CI.
- **لا دمج أو نشر:** جميع الفروع Draft، ولا اتصال بـ`alsqaya_staging` أو ملفات المؤسسة، وتقارير 503 المحجوبة تبقى كذلك. **Phase16 لم تبدأ.**

**الحكم:** `PHASE15_CODE_CANDIDATE_PASS / SECURITY_REVIEW_PENDING / HOST_ACCEPTANCE_PENDING / RELEASE_NO_GO`. لا جدوى من إعادة الاختبارات نفسها مرة أخرى ما لم يظهر سبب جديد.
