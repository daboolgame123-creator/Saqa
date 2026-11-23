# Phase 12-B — قبول إعادة تقييم الصلاحيات على جلسة نشطة

**التاريخ:** 2026-11-23
**المرحلة:** 12-B؛ مبنية على 12-A [PR #75](https://github.com/daboolgame123-creator/Saqa/pull/75) و11-C [PR #74](https://github.com/daboolgame123-creator/Saqa/pull/74).
**المراجعة:** [Draft PR #76](https://github.com/daboolgame123-creator/Saqa/pull/76)؛ لا دمج أو بيانات حقيقية.
**الحالة:** `PHASE12_SCOPED_CODE_AUDIT_PASS / HOST_ACCEPTANCE_PENDING / PHASE11_EXTERNAL_REVIEW_PENDING / NO_MERGE`.

## نتيجة اختبار P12-01

أضيف اختبار HTTP حقيقي للملف `server/tests/api/phase12RoleChange.test.ts`، على قاعدة PostgreSQL اصطناعية مستقلة، دون تعديل أي منطق إنتاجي أو منح صلاحية جديدة.

1. جلسة المسؤول الحالية تقرأ `/api/audit-logs` و`/api/reminders` وتُنشئ سجلاً؛ النجاح 200/201.
2. خفض دور صاحب **نفس Bearer** من `admin` إلى `employee` بقاعدة الاختبار يحفظ الجلسة لكنه يغير دور `/api/auth/me` فورًا، ويرفض قراءة السجلات والتذكيرات والأرشيف الإداري، وإنشاء منتسب، وإعادة ضبط حساب آخر بـ403 `PERMISSION_DENIED`.
3. الانتقال إلى `director` يسمح بالقراءة المصرح بها ويرفض إنشاء منتسب، دون فتح صلاحيات الإدارة.
4. الانتقال إلى الدور التاريخي `archivist` يغلق الوصول إلى الموارد (fail-closed).
5. إعادة الدور إلى `admin` تعيد الحقوق على الجلسة نفسها، دون ظهور أي سجلات من محاولات الكتابة المرفوضة.

**الحكم:** `P12-01 TEST_GAP_CLOSED / PASS` على اختبار API، ولا دليل من هذا الاختبار على تجاوز فعلي. فحص السباقات الدقيقة داخل الطلب الجاري لم يُدّعَ أنه مُحكم ضد كل سباق ممكن، وقد يخضع لمراجعة المصادقة الخارجية المؤجلة.

## دليل CI الفعلي

- **الالتزام الوظيفي المختبر:** `52c73f186130f6387c60fd9f1f1c3ab1d8e60402`.
- [Cumulative CI #45077339502](https://github.com/daboolgame123-creator/Saqa/actions/runs/45077339502): **SUCCESS**. دمج اختباري غير منشور لمرشحي PR #60–69 داخل runner مع 11-C/12-A/12-B:
  - Server: **417 PASS**، اختبار واحد متخطى.
  - PostgreSQL اصطناعية: **243 PASS**.
  - API: **297 PASS** (الاختبار الجديد ناجح).
  - **المجموع 957 PASS، صفر FAIL، 1 SKIP**.
  - أعيدت حالات أمان Phase11 (4+3) واختبار Phase12 الجديد (1) منفصلة، ولا تُضاف ثانيةً إلى مجموع 957 منعًا للعد المكرر.
  - `npm ci`، `npm run lint`، `npm run build`: PASS؛ `npm audit --omit=dev --audit-level=high` لا تنبيه high أو critical، وتنبيهان moderate.
- [CI المصادقة المتوازي #45077339420](https://github.com/daboolgame123-creator/Saqa/actions/runs/45077339420): نجاح مهمة الأمان، مع نتيجة باقي الوظائف تُتحقق على SHA النهائي في وصف PR.

## المهام والقيود

| المعرّف | الحالة | المسؤول |
|---|---|---|
| P12-01 — إعادة قراءة دور الجلسة | `VERIFIED_PASS` | CHAT |
| P12-02 — إسناد دور عند إنشاء حساب | `OWNER_POLICY_PENDING`؛ لا مسار لإسناد الدور في المواصفة الأصلية | OWNER |
| P12-03 — مصير `archivist` | `FAIL_CLOSED / OWNER_POLICY_PENDING` | OWNER |
| P12-04 — method غير معروف دون handler | `LOW_WATCHLIST / NO_CONFIRMED_BYPASS` | CHAT عند دليل جديد فقط |
| P12-05 — صلاحيات أفعال صاحب الطلب | `PHASE19_BUSINESS_POLICY_PENDING` | OWNER |
| OC-11-SEC — مراجعة Auth مستقلة | `WAITING_EXTERNAL / NOT_ASSIGNED` | OpenCode لاحقًا، لا تعطيل اختبارات CHAT الممكنة |

**الانتقال:** من حيث كود RBAC والاختبارات المطلوبة، **12-B مُجتازة ضمن نطاقها** ويمكن الانتقال إلى **13-A فحص Access Scope**، دون دمج أو نشر أو إعلان `RELEASE_GO`. تظل مراجعة أمن المصادقة المستقلة، تحديد سياسة الأدوار، واعتماد المضيف حواجز مستقلة موثقة، ولا يُتجاوز أي خلل أمني مثبت إن ظهر.
