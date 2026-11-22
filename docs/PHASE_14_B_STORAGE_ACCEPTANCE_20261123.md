# Phase 14-B — اختبار فشل كتابة التخزين المركزي

**التاريخ:** 2026-11-23.  
**المراجعة:** [Draft PR #80](https://github.com/daboolgame123-creator/Saqa/pull/80)، مبنية على [14-A Draft PR #79](https://github.com/daboolgame123-creator/Saqa/pull/79).  
**آخر SHA كود اختُبر قبل إضافة التقرير:** `6dd4f7bce3f01ca65beff62af0400249313659a4`.  
**الحالة:** `PHASE14_SCOPED_CODE_ACCEPTANCE_PASS / NO_MERGE / HOST_ACCEPTANCE_PENDING`.

## نتيجة الاختبار الجديد P14-01

أضاف CHAT اختبارًا محددًا `server/tests/api/phase14StorageFailure.test.ts` على خادم Express وPostgreSQL اصطناعية. تم حقن `FileStorage({rootDir:''})` صراحةً **دون لمس أي مسار حقيقي**، ثم إرسال ملف PDF اصطناعي صالح إلى API بحساب مسؤول اختباري:

1. الخادم يعيد **HTTP 503** بالرمز `ATTACHMENT_STORAGE_NOT_CONFIGURED`، ولا يعيد 201 نجاحًا كاذبًا.
2. صف المرفق المُنشأ مسبقًا في PostgreSQL باقٍ للتشخيص؛ `integrity_state='missing'` وليس `verified`؛ `storage_key` مشتق من المعرّف المستقر، و`content_hash` بصمة `sha256:` لا بايتات.
3. GET لقائمة مرفقات الكتاب للمسؤول يُظهر حالة `missing`، ولا يوجد ملف محفوظ في التخزين غير المهيأ.
4. لا تغيير لكود الإنتاج ولا تفعيل خدمة أرشفة/تقارير أو ملفات المؤسسة. النتيجة تؤكد السلوك المقصود في تصميم Phase14، ولا تزيل الحاجة لتجربة تشغيل المضيف.

## CI المتراكم

- [CI #45078794287](https://github.com/daboolgame123-creator/Saqa/actions/runs/45078794287): **SUCCESS**، مع تجميع المراحل 1–14 داخل Runner مؤقت من فروع PR #60–69 المثبتة وإصلاحات 11–14.
- **417 server PASS / 1 SKIP + 243 synthetic DB PASS + 299 API PASS = 959 PASS / 0 FAIL / 1 SKIP**.
- إضافة إلى ذلك، أعيدت اختبارات الأمان الموجّهة: Phase11 (4+3)، Phase12 (1)، Phase13 attachments (13)، Phase14 storage failure (1)؛ جميعها PASS **ولا تُضاف مجددًا إلى 959**.
- TypeScript/build و`npm audit --omit=dev --audit-level=high`: PASS، صفر high/critical، تنبيهان moderate معروفان.
- لا `push/merge` إلى الفرع الأساسي، ولا قواعد أو بيانات حقيقية، ولا ملفات staging.

## التصنيف والحدود

- `P14-01`: **TEST_GAP_CLOSED / VERIFIED PASS**.
- `P14-02`: بقاء مجلد تخزين المضيف دون صلاحية كتابة لغير الخادم، وتجنب مشاركة volumes تسمح بإدخال symlink — شرط **HOST/UAT** لا ثغرة API مثبتة.
- `P14-03`: قرار هل تُمنع تنزيلات ملف ثبت تلفه أم يسمح به لأغراض الاسترجاع — **POLICY_DEFERRED**، لم يتغير سلوك التنزيل.
- استيراد حزم الجود الحقيقية وWindows/LAN/النسخ والاستعادة: **HOST_ACCEPTANCE_PENDING**.
- OpenCode غير متاح؛ لا مهمة لازمة له في 14-A/B؛ مراجعة Auth المستقلة `OC-11-SEC` ما زالت `NOT_ASSIGNED`.

**بوابة المرحلة:** اختبار المرفقات مكتمل برمجيًا ضمن هذه المراجعة، لكن `CODE_AUDIT_CLOSED` النهائي يُثبت على آخر SHA بعد نجاح CI مجددًا. التقدم التالي في سلسلة مراجعات الكود `Phase15-A`، لا دمج أو إطلاق.
