# خطة تطوير نظام السقاية — الخطة التنفيذية التفصيلية النهائية

**الإصدار:** 1.0 — صياغة موحّدة بعد مراجعة الخطة والتنفيذ والقرارات المضافة

**الحالة:** معتمدة — المرجع التنفيذي والوظيفي الرئيسي للمشروع

**قاعدة العمل الأساسية:**
> هذه الوثيقة ليست قائمة أفكار عامة. إنها مواصفة تنفيذية. يجب أن يجد Cline داخل المرحلة كل ما يحتاجه لتنفيذها دون اختراع قواعد أعمال أو افتراض سلوك غير موثق.

---

# 1. الغرض من هذه الوثيقة

تهدف هذه الخطة إلى تحويل مشروع **السقاية** من النموذج الأولي الحالي إلى نظام إداري وأرشيفي مركزي يعمل على شبكة العمل المحلية، مع قاعدة بيانات حقيقية، تخزين مركزي للمرفقات، مصادقة وصلاحيات حقيقية على الخادم، سجلات تدقيق واطلاع، نسخ احتياطي واستعادة، بحث موحد وOCR، تقارير، ودعم Windows والهاتف.

هذه الخطة تجمع ثلاثة أشياء في مرجع واحد:

1. ما نُفذ فعليًا حتى نهاية Phase 7.
2. القرارات الوظيفية التي ثُبتت أثناء تطوير المشروع.
3. مراحل التنفيذ المتبقية مع حدود دقيقة لكل مرحلة.

**لا يجوز اعتبار أي نص قديم في وثائق أخرى أعلى من هذه الوثيقة بعد اعتمادها، إلا إذا تم تعديل هذه الوثيقة نفسها أولًا.**

---

# 2. الحالة الفعلية الحالية للمشروع

المراحل المنفذة فعليًا قبل هذه الخطة:

| المرحلة | الحالة | الوصف |
|---|---|---|
| Phase 0 | مكتملة | تدقيق وخط أساس |
| Phase 1 | مكتملة | Domain Models |
| Phase 2 | مكتملة | Personnel Domain & Services |
| Phase 3 | مكتملة | Employee Profile |
| Phase 4 | مكتملة | Transaction Domain |
| Phase 5 | مكتملة | Transaction–Employee Relations |
| Phase 6 | مكتملة | Daily Situation |
| Phase 7 | مكتملة ومختبرة | Timeline |
| Phase 8 | مكتملة | Backend Foundation |
| Phase 9 | مكتملة ومختبرة | PostgreSQL + Migrations + Persistence Foundation |
| Phase 10 | مكتملة ومختبرة | API Data Layer |

**نقطة الانتقال:** يبدأ التنفيذ المستقبلي من **Phase 11**. لا تعاد مراحل 0–10 كتنفيذ جديد إلا إذا ظهرت مشكلة صريحة تتطلب إصلاحًا منفصلًا.

Phase 7 نفذت Timeline كطبقة مشتقة وليست جدولًا مكررًا، وتضم حاليًا مصادر مثل الإجازات والزمنيات والتكليفات والدورات والكتب والموقف اليومي، مع أنواع مستقبلية محجوزة للنقل والتعيين وأحداث أخرى.

Phase 8 نفذت طبقة Backend Foundation، وتشمل البنية الأساسية للخادم، وExpress، وTypeScript، والمسارات، والخدمات، والمستودعات، والتحقق، ومعالجة الأخطاء، وRequest IDs، وHealth/Readiness، وStructured Technical Logging، وبنية Scheduled Operations، مع اختبارات المرحلة ونجاح التحقق والبناء.

Phase 9 نفذت مصدر الحقيقة المركزي على PostgreSQL: أربعة ملفات ترحيل (migrations) مطبَّقة على 18 جدولاً مع المفاتيح الأجنبية والقيود والفهارس، ونظام معاملات (transactions) بمعالجة أخطاء ورجوع كامل، واستراتيجية تاريخ/وقت موحّدة، وطبقة مستودعات (repositories) منفَّذة فعلياً فوق القاعدة، وأدوات ترحيل قابلة للتشغيل والتدحرج، مع اختبارات على قاعدة PostgreSQL مدمجة ومعزولة.

Phase 10 نقلت القراءة والكتابة من localStorage إلى API/PostgreSQL: عقد `IDataAdapter` غير متزامن في الواجهة بتنفيذين (`api` و`local`)، وطبقة `api` في الخادم (dto/validation/services/controllers/routes) تغطي الموارد الستة بترتيب النقل. فحص جاهزية قاعدة البيانات نُفِّذ فيها (مؤجَّل من Phase 9)، وأُضيف تثبيت ترميز الجلسة على UTF8 لأن العنقود الموروث للغة النظام يرفض الأرقام العربية الهندية. لا مصادقة ولا RBAC ولا Access Scope على المسارات — مراحل 11–13.
---

# 3. تعريف مصطلحات أساسية

## 3.1 المنتسب
الشخص المسجل في شؤون المنتسبين ويملك سجلًا إداريًا داخل السقاية.

## 3.2 الباحث
كيان مستقل عن Employee/المنتسب. لا يُعامل على أنه مجرد نوع من أنظمة عمل المنتسبين.

## 3.3 الأستاذ
كيان/تصنيف تشغيلي مستقل حسب القسم الوظيفي والمعاملات الخاصة المعتمدة. لا يُفترض أن كل معاملة أستاذ تكون كتابًا تقليديًا.

## 3.4 الكتاب / المعاملة
وثيقة إدارية أرشيفية لها بياناتها الرسمية واتجاهها وحالتها ومرفقاتها وعلاقاتها.

## 3.5 الزمنية
المصطلح المعتمد في المشروع بدل «الإذن الزمني/الاستئذان». تسجل مدة خروج المنتسب وعودته، وتدخل في محرك التجميع بالدقائق.

## 3.6 الإعمام
كتاب وارد عادي يُعامل كوثيقة أرشيفية، لكن يمكن أن تكون له إتاحة عامة للمنتسبين وإجراء اطلاع رسمي.

## 3.7 إتاحة الكتاب للمنتسب
علاقة/صلاحية تجعل كتابًا معينًا مرئيًا لمنتسب أو مجموعة منتسبين محددين، حتى إذا لم يكن الكتاب إعمامًا عامًا.

## 3.8 الإشعار
حدث موجه للمستخدم داخل السقاية، وليس الوثيقة نفسها.

## 3.9 التذكير
موعد مرتبط بمعاملة/حالة/مهمة يظهر داخل السقاية.

## 3.10 الخط الزمني
طبقة تجميع وعرض مشتقة من السجلات الأصلية، ولا تُنشئ نسخة ثانية من بياناتها.

---

# 4. القواعد غير القابلة للتجاوز أثناء التطوير

1. **لا اختراع لقواعد الأعمال.**
2. إذا كانت قاعدة أعمال ناقصة أو غير محسومة، لا يقررها Cline.
3. إذا كانت النتيجة التقنية واضحة ولا تغير سلوك الأعمال، يجوز اعتماد القرار التقني المبين هنا.
4. كل مرحلة لها نطاق صريح؛ لا تُنفذ مرحلة مستقبلية معها.
5. البيانات الحقيقية منفصلة عن بيانات الاختبار.
6. العلاقات الأساسية تستخدم IDs وليس أسماء نصية.
7. الأمن النهائي يفرضه Backend وليس React.
8. لا تُحذف البيانات التاريخية بسبب تغيّر الواجهة.
9. الحذف المنطقي يستخدم حيث تحدد الخطة ذلك.
10. كل مرحلة: تنفيذ → اختبار → مراجعة → استقرار → Commit → تقرير → توقف.
11. لا يسمح لـCline بتنظيف مشروع واسع أو إعادة هيكلته خارج نطاق المرحلة.
12. أي تعارض بين كود قديم وهذه الخطة يُبلغ عنه، ولا يُحل بالاجتهاد.
13. لا تُزال اختبارات أو حماية موجودة فقط لتسهيل نجاح Build.
14. لا يتم إدخال بيانات العمل الحقيقية في مراحل الاختبار.
15. واجهة عربية RTL هي الافتراضي.
16. النظام يعمل أولًا داخل LAN ولا يعتمد على الإنترنت الخارجي في وظائفه الأساسية.

---

# 5. مبدأ السلطة بين الوثائق

بعد اعتماد هذه الخطة، تكون الأولوية:

1. هذه الخطة التنفيذية النهائية.
2. ملفات نماذج/عقود المجال التي تنشأ أثناء تنفيذ المرحلة الحالية، بشرط عدم تعارضها مع هذه الخطة.
3. PROJECT_VISION.md.
4. PROJECT_RULES.md.
5. التقارير التاريخية للمراحل.
6. الوثائق القديمة المؤرشفة.

**أي وثيقة قديمة تخالف هذه الخطة تعتبر بحاجة إلى تحديث ولا تعدل الخطة لتناسبها.**

---

# 6. المعمارية المستهدفة

```text
[Windows Client / Browser / PWA]
              |
              v
         [React UI]
              |
           HTTPS/HTTP
              |
              v
       [Node.js API]
              |
     +--------+---------+
     |                  |
     v                  v
[Services]        [Authorization]
     |
     v
[Repositories]
     |
     v
[PostgreSQL]

API ------------------> [Central File Storage]
 |
 +--------------------> [Background Jobs]
 |
 +--------------------> [Audit / Technical Logs]
 |
 +--------------------> [Notifications / Reminders]
 |
 +--------------------> [Backup / Recovery]
```

## 6.1 طبقات الخادم

- `routes`: تعريف المسارات.
- `controllers`: تحويل طلب HTTP إلى استدعاء خدمة.
- `services`: منطق الأعمال.
- `repositories`: الوصول للبيانات.
- `validators`: التحقق من المدخلات.
- `authorization`: Permission + Access Scope.
- `auth`: حسابات، جلسات، OTP، استعادة.
- `jobs`: OCR، تذكيرات، نسخ احتياطي، فحوصات مجدولة.
- `audit`: Audit Log وView Log.
- `storage`: إدارة الملفات.
- `config`: إعدادات البيئة.
- `logging`: السجل التقني.

## 6.2 قاعدة
React لا يتصل بقاعدة البيانات مباشرة.

---

# 7. نموذج المجال النهائي

## 7.1 User
يرتبط بحساب الدخول، وليس بالبيانات الوظيفية كلها.

الحقول التفصيلية التي تحتاجها طبقة الحسابات تحدد في Phase 10.

## 7.2 Employee
يحفظ البيانات الأساسية الحالية للمنتسب، ولا يحتوي داخله على كل التاريخ الوظيفي.

يحتوي على/يرتبط بـ:
- المعرف الداخلي.
- الاسم.
- الرقم الوظيفي/رقم الباج.
- الهاتف.
- الصورة عند وجودها.
- تاريخ الخدمة/الانتساب.
- القسم/الحالة.
- بيانات أساسية أخرى موجودة حاليًا في المجال.

## 7.3 Former Employee
ليس حذفًا للـEmployee.

الحالة التاريخية للمنتسب السابق تحفظ مع سبب انتهاء الخدمة من القيم المعتمدة:
- انتهت خدمته.
- تقاعد.
- انفصال.
- استقالة.

الكتب والسجلات السابقة تبقى مرتبطة به.

## 7.4 Researcher
كيان مستقل. لا يسمح بإنشاء حقول أعمال إضافية غير معتمدة. عند تنفيذ هذا المجال، أي حقل غير محدد في هذه الوثيقة يبقى `TBD` حتى اعتماد مواصفة الباحثين.

## 7.5 Transaction
يمثل كتابًا/معاملة أرشيفية.

علاقاته تشمل:
- TransactionEmployee.
- Attachment.
- Status.
- Reminder.
- Related Transactions.
- Availability.
- View/Acknowledgement.
- Notifications.
- Audit.

## 7.6 TransactionEmployee
M:N حقيقية.

لا يستخدم اسم المنتسب كنقطة الربط الأساسية.

## 7.7 Attachment
كيان metadata مستقل عن الملف المادي.

## 7.8 Leave
سجل الإجازة الفعلية.

## 7.9 LeaveBalance
الرصيد الحالي والمعلومات اللازمة لتتبعه.

## 7.10 LeaveLedger
سجل حركات الرصيد.

الرصيد ليس رقمًا حرًا يمكن تغييره دون أثر.

## 7.11 TimePermission / الزمنية
سجل زمني مستقل عن الإجازة.

يخزن المدة بالدقائق.

## 7.12 Request
طلب مقدم من المنتسب أو صادر من النظام حسب النوع.

## 7.13 Notification
حدث موجه للمستخدم.

## 7.14 Reminder
موعد/نص مرتبط بسجل يحتاج متابعة.

## 7.15 AuditLog
سجل إداري/أمني للأفعال الحساسة.

## 7.16 ViewLog / Acknowledgement
سجل الاطلاع الرسمي.

## 7.17 TimelineEntry
ناتج مشتق، وليس جدولًا يكرر المصدر.

---

# 8. قواعد الأعمال المعتمدة

## 8.1 الكتب

### الاتجاهات الحالية
- وارد.
- صادر.
- داخلي.

### الحالة
مستقلة عن اتجاه الكتاب:
- قيد المراجعة.
- مكتمل.

يجب تصميمها بحيث يمكن إضافة حالات مستقبلية دون إعادة بناء النظام.

### الوارد
الحقول الأساسية:
- العدد الرسمي.
- التسلسل الداخلي.
- التاريخ.
- جهة الكتاب.
- معنون إلى.
- الموضوع/العنوان.
- المضمون.
- الملاحظة.
- الكتاب المشار إليه.
- المرفقات.

### الصادر
الحقول الأساسية:
- رقم الكتاب.
- التاريخ.
- معنون إلى.
- الموضوع.
- المضمون.
- الملاحظة.
- الكتاب المشار إليه.
- صورة الكتاب الموقعة.

لا يوجد حقل جهة إضافي مستقل إذا كان «معنون إلى» يؤدي وظيفته.

### الملفات
المستخدم يحفظ/يمسح الملف أولًا ثم يرفقه في السقاية.

Base64 ليس التخزين النهائي.

---

# 9. قواعد الإتاحة والأعمام

## 9.1 الإعمام العام
الكتاب يصنف ككتاب وارد، ثم يمنح نطاق رؤية `PublicToEmployees`.

كل المنتسبين يرونه تلقائيًا ما دام نطاق الرؤية عامًا للمنتسبين.

المنتسب:
- يرى الكتاب.
- يستطيع فتح المرفق.
- يستطيع تنزيله إذا سمحت الصلاحية.
- يستخدم «اطلعت» عند التصميم الذي يتطلب تأكيدًا صريحًا.

## 9.2 سجل الاطلاع
يُسجل:
- المستخدم/المنتسب.
- الكتاب.
- التاريخ والوقت.
- بيانات الجلسة اللازمة للتدقيق عند الحاجة.

سجل الاطلاع الرسمي لا يحذف في الاستخدام العادي.

## 9.3 الكتاب الخاص المتاح لمنتسب
الإدارة تستطيع اختيار منتسب واحد أو عدة منتسبين وجعل الكتاب متاحًا لهم.

عند الإتاحة:
- يظهر الكتاب في مساحة المنتسب.
- ينشأ إشعار داخلي إذا كان الحدث جديدًا.
- يمكن سحب الإتاحة لاحقًا.
- سحب الإتاحة لا يحذف الكتاب.
- سحب الإتاحة لا يحذف سجل الاطلاع السابق.

## 9.4 الكتب المرتبطة بعدة منتسبين
يمكن تنفيذ الإتاحة الجماعية لكل المنتسبين المرتبطين بالكتاب.

## 9.5 المدير
لا يدير حالة الإتاحة.

---

# 10. الصلاحيات والأدوار

## 10.1 مسؤول السقاية 1 و2
حسابان إداريان منفصلان، بصلاحيات إدارية متساوية وفق السياسة الحالية.

يستطيعان:
- إدارة المنتسبين.
- إدارة الكتب.
- إدارة المرفقات.
- إدارة الإتاحة.
- إدارة الحالات.
- إدارة الحسابات.
- تجميد/فك تجميد/حظر/إعادة ضبط الحسابات.
- رؤية سجلات الدخول والخروج.
- إدارة البيانات الوظيفية.
- إدارة النسخ الاحتياطية والاستعادة.
- إدارة إعدادات النظام.
- متابعة Audit Log.

## 10.2 المدير
دوره إشرافي واطلاعي.

يرى ما يلزم للإشراف على:
- المنتسبين.
- الكتب.
- الإجازات.
- الزمنيات.
- التكليفات.
- الدورات.
- الخط الزمني.
- الملفات والمرفقات.
- الأعمام ومتابعة الاطلاع.
- الطلبات في نطاق سير الموافقة المعتمد.

لا يستطيع:
- إنشاء/تعديل/حذف كتاب كبيانات أرشيفية.
- إدارة حسابات المستخدمين.
- حظر أو تجميد الحسابات.
- رؤية سجلات الدخول الأمنية.
- إدارة إتاحة الكتب للمنتسبين.

**اعتماد/رفض الطلب** يعتبر إجراء Workflow خاصًا إذا كان نوع الطلب يتطلب المدير، وليس صلاحية CRUD عامة على بيانات المنتسب.

## 10.3 المنتسب
يرى بياناته الشخصية وسجلاته المسموح بها، إضافة إلى الأعمام العامة والكتب التي تمت إتاحتها له.

يمكنه رؤية:
- بياناته.
- مستمسكاته.
- كتب تعيينه.
- كتب الشكر.
- كتب العقوبات.
- الإجازات.
- الزمنيات.
- التكليفات.
- الدورات.
- الكتب المتاحة له.
- الإشعارات الخاصة به.
- الطلبات الخاصة به.
- الخط الزمني الخاص به.

---

# 11. نظام المصادقة والحسابات

## 11.1 إنشاء الحساب لأول مرة
لا يوجد رمز تهيئة.

التدفق المعتمد:

```text
رقم الباج/الرقم الوظيفي + الهاتف المسجل
              ↓
        OTP إلى الهاتف
              ↓
        إدخال OTP صحيح
              ↓
       إنشاء الرمز السري
              ↓
         تفعيل الحساب
```

إذا فشل المطابقة لا يكشف النظام أي معلومة عن الحقل الصحيح/الخاطئ.

## 11.2 تسجيل الدخول المعتاد
يسمح باستخدام:
- رقم الباج أو الرقم الوظيفي.
- أو رقم الهاتف.
- الرمز السري.

لا يطلب OTP في كل دخول عادي.

## 11.3 الحالات
- غير مفعّل.
- نشط.
- مجمّد.
- محظور.

التجميد والحظر يمنعان الدخول.

عند التجميد أو الحظر:
- تبطل الجلسات النشطة للحساب فورًا.

## 11.4 محاولات الدخول
- المحاولات 1–3: بدون تأخير خاص.
- المحاولة 4: تأخير 5 ثوانٍ.
- المحاولة 5: تجميد 15 دقيقة.
- لا يكشف النظام هل الخطأ في الرقم أم الرمز.
- كل المحاولات تسجل.

## 11.5 OTP
- 6 أرقام.
- صالح 5 دقائق.
- استخدام واحد.
- OTP جديد يبطل السابق.
- 5 طلبات كحد أقصى لكل حساب/هاتف خلال 15 دقيقة.
- تجاوز الحد يؤدي إلى حظر طلبات OTP لمدة 15 دقيقة.
- 5 محاولات OTP خاطئة تبطل OTP الحالي وتتطلب إصدارًا جديدًا.
- طلبات OTP تسجل.
- لا يكشف النظام وجود الحساب أو عدمه عند طلب OTP.

## 11.6 الاستعادة
تدفق الاستعادة:

```text
رقم الهاتف
   ↓
OTP
   ↓
رمز جديد
```

لا يحتاج المستخدم إلى الرمز القديم للاستعادة.

## 11.7 إعادة ضبط الإدارة
المسؤول الإداري يستطيع إعادة ضبط حساب مستخدم.

النتيجة:
- الرمز القديم يبطل.
- ينشأ رمز مؤقت جديد.
- يعرض للمسؤولين المصرح لهم.
- يطلب تغييره عند أول دخول.

## 11.8 رؤية الرمز السري للمسؤولين
هذا قرار وظيفي استثنائي ومعتمد حاليًا: يستطيع مسؤولو السقاية رؤية الرمز السري الحالي للمنتسب.

التنفيذ الأمني المطلوب:
- لا تخزن القيمة نصًا مكشوفًا داخل قاعدة البيانات.
- تستخدم **reversible encryption / envelope encryption** بدل one-way hash للحسابات التي يصرح النظام إداريًا برؤية رمزها.
- مفتاح التشفير لا يخزن في نفس قاعدة البيانات.
- كل عملية كشف للرمز تسجل Audit Log.
- أي تسريب أو فشل في المفتاح يؤدي إلى استخدام إعادة الضبط، لا إلى تجاوز التشفير.

هذا الاستثناء يجب عزله في وحدة أمنية واضحة وعدم تعميمه على بيانات أخرى.

## 11.9 الجلسات
- مهلة خمول: 30 دقيقة.
- نشاط المستخدم يعيد ضبط المؤقت.
- الجلسات المتزامنة عبر عدة أجهزة مسموحة.
- الحساب مرتبط بالمنتسب وليس بالجهاز.
- تسجيل الخروج يدمر الجلسة الحالية فقط.
- لا Remember Me.
- تسجيل الدخول والخروج في السجل.

---

# 12. Access Scope

القيم الحالية:
- `PublicToEmployees`
- `SpecificEmployees`
- `Administrative`
- `DirectorOnly`

القاعدة:

```text
Identity → Permission → Access Scope → Resource
```

Access Scope ليس بديلًا عن Permission.

مثال:
- Permission = `view_transaction`
- Scope = `SpecificEmployees`
- Resource = Transaction X

يجب منع الوصول على الخادم حتى لو حاول المستخدم إرسال طلب API يدويًا.

---

# 13. الموظفون السابقون

داخل قسم المنتسبين توجد مساحة واضحة باسم:

**المنتسبون السابقون**

تجمع من انتهت خدمتهم بسبب:
- انتهاء الخدمة.
- التقاعد.
- الانفصال.
- الاستقالة.

الإجراء:
- تغيير حالة الخدمة/الأرشفة.
- إخراج المنتسب من قائمة النشطين.
- الإبقاء على كل السجلات والكتب والمرفقات والتاريخ.
- منع الحذف الفعلي لمجرد انتهاء الخدمة.

---

# 14. الإجازات والزمنيات — القواعد المعتمدة

## 14.1 الاعتيادية
- كل 10 أيام خدمة = يوم واحد إجازة اعتيادية.
- الأيام المتبقية من دورة العشرة تحفظ.
- الرصيد يرحل بين السنوات.
- الحد الأعلى للرصيد 180 يومًا.
- قاعدة التعامل مع الاستحقاق الذي يؤدي إلى تجاوز 180 لم تُحسم نهائيًا؛ لا يخترع النظام سلوكًا.

## 14.2 الطارئة
- 15 يومًا في السنة.
- غير المستخدم لا يرحل.
- عند بداية سنة جديدة يبدأ من 15 يومًا.

## 14.3 الزمنيات
كل سجل يتضمن:
- المنتسب.
- التاريخ.
- وقت الخروج.
- وقت العودة.
- المدة المحسوبة.
- السبب/الملاحظات عند الحاجة.

تخزن المدة بالدقائق.

كل 420 دقيقة = يوم طارئ واحد.

الدقائق غير المحولة ترحل للسنة التالية.

مثال:
- 16 ساعة = يومان طارئان + ساعتان متبقيتان.

## 14.4 الحد الأسبوعي
قاعدة الكتاب: لا تزيد الزمنية الممنوحة على 4 ساعات في الأسبوع.

لكن النظام **لا يمنع التسجيل الفني** عند تجاوز 4 ساعات.

يمكن إصدار تنبيه/مؤشر مستقبلي، لكن لا يمنع التسجيل ولا يحذف البيانات الفعلية.

## 14.5 نفاد الطارئ
عندما تستحق الزمنيات أيامًا طارئة أكبر من الرصيد المتاح:
- الجزء المغطى = طارئ.
- الجزء غير المغطى = بدون راتب وفق القاعدة المعتمدة.
- الرصيد لا يصبح سالبًا.

## 14.6 المرضية
- 1–45 يوم: 100%.
- 46–90: 80%.
- بعد 90: بدون راتب.

لا يُفترض هل الشرائح تقاس بالسنة أو بفترة خدمة أخرى إلى أن يعتمد المرجع الرسمي هذا الجانب.

## 14.7 الحج
- 30 يومًا.
- مرة واحدة في خدمة المنتسب.

## 14.8 العمرة
- 12 يومًا.
- مرة واحدة في خدمة المنتسب.

## 14.9 الدراسية
نوع مستقل.

لا يضع النظام رقمًا ثابتًا أو رصيدًا تلقائيًا لها في الوقت الحالي.

## 14.10 بدون راتب
نوع مستقل.

يستخدم في الحالات المعتمدة مثل:
- النقص في الرصيد الاعتيادي.
- النقص في الطارئ عند تحويل الزمنيات.
- تجاوز المرضية الحدود المعتمدة.

الحد العام للإجازة بدون راتب غير محسوم.

---

# 15. Leave Ledger

لا يجوز تعديل الرصيد الرقمي مباشرة دون تسجيل الحركة.

مثال للحركة:

```text
تاريخ | العملية | النوع | القيمة | الرصيد بعد العملية
```

الحركات تشمل مثلًا:
- استحقاق.
- خصم إجازة.
- إلغاء إجازة.
- تحويل زمنيات.
- تصحيح إداري موثق.
- نقطة بداية افتتاحية.

الإلغاء يعكس الحركة بدل محو تاريخها.

---

# 16. الموقف اليومي

يبقى كيانًا مستقلًا.

لا يخزن كجزء من Transaction.

يرتبط بالمنتسبين عبر IDs.

يحافظ على شكل الاستمارة الرسمية المطلوبة.

---

# 17. الباحثون والأساتذة والمعاملات الخاصة

## الباحثون
كيان مستقل.

الحقول غير المحسومة في مواصفة الأعمال لا تنشأ من تخمين Cline.

## الأساتذة
لهم احتياجات قد لا تناسب نموذج الكتاب التقليدي.

مثال مثبت:
- إيصال استلام راتب.
- أسماء.
- توقيع.
- تاريخ.

بدون افتراض وجود رقم كتاب أو تسلسل إذا لم يكن جزءًا من المعاملة.

يُستخدم مفهوم **Special Personnel Transaction** أو ما يعادله معماريًا لتجنب إجبار كل معاملة على حقول الكتب.

---

# 18. الطلبات وسير الموافقة

الطلب كيان مستقل.

يحتوي على:
- صاحب الطلب.
- النوع.
- الحالة.
- تاريخ الإنشاء.
- تاريخ التحديث.
- تاريخ التغييرات.
- الردود/التوضيحات عند الحاجة.

سير العمل المعتمد:

```text
المنتسب يرسل الطلب
        ↓
المدير يراجعه
        ↓
موافقة / رفض / طلب توضيح
        ↓
المنتسب يرد على التوضيح عند الحاجة
        ↓
الحالة النهائية
```

طلب الإجازة والزمنية يرتبطان بكيانات السجلات الفعلية ولا يستبدلانها.

---

# 19. التعليقات

بسبب تعارض الوثائق القديمة مع القرار الأحدث:

- لا تمنح هذه الخطة المدير صلاحية تعديل/حذف التعليقات كميزة إدارية عامة.
- إذا ظهر تعليق في واجهة المدير، يجب أن يكون جزءًا من آلية الإشراف التي تم اعتمادها في المرحلة ذات الصلة، وليس تفويضًا إضافيًا للمدير لتعديل البيانات.
- التعليقات الخاصة بالإدارة تبقى ضمن النطاق الإداري إذا تم تنفيذها.

أي سلوك إضافي للتعليقات يحتاج قرارًا موثقًا قبل التنفيذ.

---

# 20. الإشعارات

الإشعارات الحالية **داخل السقاية فقط**.

لا WhatsApp ولا SMS خارجي ولا Device Push في النسخة الحالية.

## أنواع الاستخدام الأساسية
- جعل كتاب متاحًا.
- كتاب إعمام جديد.
- تغيّر مهم حسب الصلاحية.
- طلب جديد للجهة التي يجب أن تتابعه.
- تحديث طلب.
- تذكير مستحق.

## واجهة المستخدم
- جرس.
- حالة «جديد».
- علامة حمراء على القسم/الكتاب عندما يكون مناسبًا.
- فتح المحتوى يزيل حالة الجديد وفق قاعدة UI المعتمدة.
- السجل التاريخي للإشعارات يبقى منفصلًا عن حالة «جديد».

---

# 21. التذكيرات

التذكير اختياري.

يمكن ربطه بسجل يحتاج متابعة.

يحفظ:
- enabled.
- التاريخ.
- الوقت.
- النص المخصص.
- الحالة التي تدل على التنفيذ/الانتهاء عند الحاجة.

التنفيذ عبر Scheduled Jobs.

في النسخة الحالية:
- يظهر داخل السقاية فقط.
- لا Push خارجي.

---

# 22. Timeline

الـTimeline طبقة تجميع فقط.

## المصادر الحالية
- Leave.
- Time Permission.
- Assignment.
- Course.
- Transaction.
- Daily Situation.

## مصادر مستقبلية المحجوزة
- Appointment.
- Transfer.
- Other Administrative Events.

لا يتم إنشاء جدول Timeline مستقل لمجرد العرض.

## موقع الواجهة
Timeline ضمن ملف المنتسب، وليس قسمًا مستقلًا رئيسيًا في الوقت الحالي.

## التنقل
العنصر الزمني يجب أن يقود إلى مصدره الحقيقي إذا كان ذلك ممكنًا.

إذا كانت واجهة المصدر غير موجودة بعد، يوضح النظام ذلك بدل اختراع صفحة جديدة.

---

# 23. المرحلة 0–7 — سجل التنفيذ السابق

هذه المراحل مكتملة ولا يعاد تنفيذها كجزء من الخطة الجديدة.

## Phase 0 — Baseline
- تدقيق المشروع.
- Git baseline.
- توثيق الحالة.

## Phase 1 — Domain Models
- النماذج الأساسية.
- العلاقات الأولية.

## Phase 2 — Personnel Domain & Services
- خدمات شؤون المنتسبين الأساسية.
- CRUD/Validation للنطاق المنفذ.

## Phase 3 — Employee Profile
- ملف المنتسب.
- تجميع السجلات المرتبطة.

## Phase 4 — Transaction Domain
- اتجاه الكتاب.
- الحالة.
- البيانات الرسمية.
- التذكير.

## Phase 5 — Transaction–Employee
- M:N.
- TransactionEmployee.

## Phase 6 — Daily Situation
- كيان مستقل.

## Phase 7 — Timeline
- طبقة تجميع مشتقة.
- لا تخزين مكرر.
- اختبارات المرحلة الحالية الناجحة حسب التقرير.

---

# 24. PHASE 8 — Backend Foundation

## الهدف
إنشاء Backend حقيقي دون نقل جميع البيانات دفعة واحدة.

## النطاق
- Node.js.
- Express.
- TypeScript.
- server entry point.
- routes.
- controllers.
- services.
- repositories.
- validators.
- configuration.
- error handling.
- request IDs.
- health check.
- readiness check.
- structured technical logging.
- Scheduled Operations infrastructure.

## البنية المستهدفة
```text
backend/
  src/
    config/
    routes/
    controllers/
    services/
    repositories/
    validators/
    middleware/
    auth/
    authorization/
    audit/
    storage/
    jobs/
    logging/
    utils/
    app.ts
    server.ts
  tests/
```

قد تختلف الأسماء قليلًا إذا كان هيكل المشروع الحالي يفرض اسمًا أفضل، لكن المسؤولية الطبقية لا تتغير.

## لا ينفذ في هذه المرحلة
- المصادقة الكاملة.
- RBAC الكامل.
- PostgreSQL الكامل.
- OCR.
- ملفات الإنتاج.
- النقل الكامل من localStorage.

## الاختبارات
- تشغيل الخادم.
- health.
- readiness.
- خطأ 404 منظم.
- خطأ validation منظم.
- خطأ داخلي منظم.
- graceful shutdown.

## معيار الإغلاق
Backend يشتغل ويستقبل طلبًا تجريبيًا، مع بنية يمكن أن تبنى فوقها بقية المراحل.

---

# 25. PHASE 9 — PostgreSQL + Migrations + Persistence Foundation

## الهدف
إنشاء مصدر الحقيقة المركزي.

## التنفيذ
- PostgreSQL.
- schema.
- migrations.
- constraints.
- foreign keys.
- indexes الأولية.
- transaction handling.
- date/time strategy.
- repository integration.

## الجداول الأساسية
يبدأ التنفيذ بالكيانات الموجودة فعليًا والمثبتة، ثم يضيف ما تحتاجه المراحل التالية:
- users.
- employees.
- employee status/history.
- transactions.
- transaction_employees.
- attachments metadata.
- leaves.
- leave_balances.
- leave_ledger.
- time_permissions.
- assignments.
- courses.
- daily_situations.
- requests.
- notifications.
- reminders.
- audit_logs.
- view_logs.

## قاعدة
PostgreSQL هو مصدر الحقيقة بعد اعتماد طبقة persistence.

## الاختبارات
- migration up.
- migration rollback على قاعدة اختبار.
- foreign key tests.
- uniqueness tests.
- transaction rollback test.
- repository CRUD tests.

---

# 26. PHASE 10 — API Data Layer / الانتقال من LocalStorage إلى API

## الهدف
فصل UI عن التخزين المحلي ونقل القراءة والكتابة بالتدريج.

## التنفيذ
- API client.
- DTOs.
- mapping بين DTO وDomain.
- repository adapters.
- server-side validation.
- fallback Local Adapter فقط للاختبارات/التطوير المحلي عند الحاجة.

## ترتيب النقل
1. Employees.
2. Transactions.
3. TransactionEmployee.
4. Daily Situation.
5. Personnel records.
6. Timeline reads.

## لا تنفذ هنا
- Auth النهائي.
- RBAC النهائي.
- استيراد الأرشيف القديم.

## معيار الإغلاق
الواجهة تقرأ وتكتب بيانات الاختبار من API/DB بدل localStorage في نطاق المرحلة، مع عدم فقد البيانات أثناء round-trip.

---

# 27. PHASE 11 — Authentication / الحسابات / الجلسات

## الهدف
تحويل قواعد الحسابات أعلاه إلى نظام خادم فعلي.

## التنفيذ التفصيلي
### Registration
- lookup بالرقم الوظيفي/الباج + الهاتف.
- لا تكشف سبب الفشل.
- إصدار OTP.
- تحقق OTP.
- إنشاء الرمز السري.
- تفعيل الحساب.

### Login
- badge/official number أو phone.
- secret.
- محاولات 1–5 وفق القاعدة.
- freeze عند المحاولة الخامسة.

### Sessions
- session ID آمن أو آلية token/session موثقة.
- inactivity 30 minutes.
- concurrent sessions.
- logout current session.
- invalidate all on freeze/block.

### OTP
- 6 أرقام.
- 5 دقائق.
- one-time.
- 5 requests / 15 minutes.
- 5 failures invalidates current OTP.

### Recovery
- phone.
- OTP.
- new secret.

### Admin reset
- temporary secret.
- force change.
- invalidate old sessions/secret.

### Secret visibility exception
- reversible encryption.
- separate key.
- audit reveal.

## OTP Provider
يُبنى `OtpProvider` كواجهة.

في الاختبار يستخدم Fake/Test Provider.

لا يختار Cline مزود SMS تجاريًا من نفسه.

اختيار المزود الفعلي يبقى إعداد نشر لاحق ما لم يقرر المستخدم غير ذلك.

## الاختبارات
- success.
- wrong credential.
- 4th attempt delay.
- 5th freeze.
- freeze invalidates sessions.
- OTP expiry.
- OTP reuse rejection.
- OTP request rate limit.
- OTP wrong attempts.
- password reset.
- concurrent sessions.
- logout single session.

---

# 28. PHASE 12 — RBAC / Permissions

## الهدف
فرض الصلاحيات على الخادم.

## الأدوار
- admin/responsible Saqa.
- director.
- employee.

## Permission families
- view.
- create.
- update.
- delete/archive.
- manage availability.
- manage accounts.
- manage security.
- approve request.
- view audit/security logs.
- backup/restore.

## قاعدة
لا يعتمد الأمن على إخفاء زر في React.

## اختبارات إلزامية
لكل Role × عملية حساسة:
- allowed.
- denied.
- denied when direct API call bypasses UI.

---

# 29. PHASE 13 — Access Scope + Book Availability

## الهدف
تطبيق الفصل بين Permission وAccess Scope.

## التنفيذ
- `PublicToEmployees`.
- `SpecificEmployees`.
- `Administrative`.
- `DirectorOnly`.

## Availability
إنشاء العلاقة اللازمة بين transaction وemployees.

العمليات:
- grant availability.
- bulk grant.
- revoke availability.
- inspect availability for admin.

المدير لا يدير هذا السجل.

## اختبارات
- public circular.
- one employee.
- multiple employees.
- revoke.
- linked employee but not available.
- available but employee role only.
- director access according to scope without managing availability.

---

# 30. PHASE 14 — Attachments & Central File Storage

## الهدف
نقل المرفقات من Base64 إلى تخزين مركزي.

## metadata
لكل ملف:
- stable ID.
- original filename.
- MIME type.
- size.
- created date.
- hash.
- storage key/path.
- OCR status.
- integrity state.

## التخزين
لا مشاركة مباشرة لمجلد الأرشيف عبر Windows للمستخدمين.

الملف يقدم عبر Backend بعد authorization.

## حماية
- منع path traversal.
- MIME validation.
- size limits.
- filename sanitization.
- access check.

## الاختبارات
- upload.
- download authorized.
- download denied.
- corrupted file detection.
- hash verification.
- multiple attachments.

---

# 31. PHASE 15 — Audit Log + View/Acknowledgement Logs

## Audit Log
يسجل عند الحاجة:
- create.
- update.
- archive/delete.
- status change.
- permission change.
- account actions.
- login/logout.
- OTP events.
- sensitive file access.
- admin secret reveal.
- backup/restore.

عند تعديل مهم يسجل old/new values حسب سياسة الحساسية.

## View Log
خاص بالاطلاع الرسمي.

يجب عدم الخلط بين:
- فتح الصفحة.
- تنزيل الملف.
- الاطلاع الرسمي.

السلوك الرسمي لـ«اطلعت» يجب أن يكون محددًا في الواجهة؛ زر التأكيد يبقى إذا كان مطلوبًا صراحة.

## اختبارات
- audit created.
- audit immutable to normal user.
- acknowledgement persists.
- duplicate acknowledgement does not create false new official state.

---

# 32. PHASE 16 — Soft Delete + Data Integrity

## الهدف
الحفاظ على التاريخ وعدم تكسير العلاقات.

## التنفيذ
- `deletedAt`.
- `deletedBy`.
- سبب الحذف عند الحاجة.
- restore where allowed.
- FK restrictions.
- unique constraints.
- historical preservation.

## Employee
لا يحذف بسبب انتهاء الخدمة؛ ينقل إلى former state.

## Transaction
لا يحذف نهائيًا في الاستخدام الإداري العادي.

## الاختبارات
- archive preserves relations.
- restore.
- deleted records excluded from active views.
- historical query still available to authorized admins.

---

# 33. PHASE 17 — Concurrency Control

## الهدف
منع الكتابة فوق تحديث أحدث دون علم المستخدم.

## التنفيذ
- version column أو equivalent.
- optimistic locking.
- database transactions للعمليات المركبة.
- conflict response واضح.

## مثال
مستخدم A يفتح كتابًا.
مستخدم B يعدله ويحفظ.
A يحاول الحفظ.

النتيجة:
- لا يكتب فوق تعديل B بصمت.
- يعاد تحميل النسخة الحديثة أو يظهر تعارض واضح.

## الاختبارات
- stale update.
- concurrent transaction.
- rollback mid-operation.

---

# 34. PHASE 18 — Personnel Rules Engine: Leaves + Time Permissions

## الهدف
تنفيذ محرك الرصيد المحكوم بالقواعد التي وثقناها.

## يجب أن ينفذ منفصلًا عن React

```text
Service Records
      ↓
Accrual Engine
      ↓
Leave Balance
      ↓
Leave Ledger

Time Permission
      ↓
Minutes Engine
      ↓
420 minutes
      ↓
Emergency Conversion
      ↓
Emergency Balance
```

## الاعتيادية
- كل 10 أيام خدمة = +1.
- remainder محفوظ.
- carry over سنوي.
- max 180.
- لا قرار آلي عند تجاوز 180 حتى يعتمد السلوك.

## الطارئة
- reset إلى 15 سنويًا.
- no carryover للرصيد نفسه.

## الزمنيات
- مدة بالدقائق.
- كل 420 دقيقة = يوم طارئ.
- remainder minutes carry forward.
- تجاوز 4 ساعات أسبوعيًا يسجل ولا يمنع.

## نفاد الطارئ
الجزء غير المغطى يذهب إلى بدون راتب وفق القاعدة.

## المرضية
- 45 × 100%.
- 45 × 80%.
- الباقي بدون راتب.

لا يفترض النظام دورة زمنية للشرائح غير موثقة.

## الحج والعمرة
- 30/12.
- مرة واحدة في الخدمة.

## بدون راتب
نوع مستقل.

## افتتاح الرصيد
يدعم إدخال نقطة بداية موثقة بدل إعادة اختراع كل التاريخ القديم.

## Leave Ledger tests
يجب أن تكون لكل عملية حركة قابلة للتتبع والعكس.

---

# 35. PHASE 19 — Requests + Workflow

## الهدف
تنفيذ الطلبات فعليًا على الخادم.

## الأنواع الأولية
- طلبات عامة.
- أجهزة/معدات.
- إجازة.
- زمنية.
- الأنواع الأخرى بعد اعتمادها.

## workflow
- Draft.
- Submitted.
- Under Review.
- Clarification Requested.
- Approved.
- Rejected.
- Cancelled.

القيم النهائية يجب أن تتطابق مع UI المتفق عليه قبل التنفيذ إن كان الاسم مختلفًا.

## المدير
يستطيع اتخاذ إجراء Workflow الذي تم تفويضه له، لكنه لا يحصل بسبب ذلك على CRUD على ملفات المنتسب أو الكتب.

## الاختبارات
- submit.
- approve.
- reject.
- clarification.
- employee reply.
- cancellation rules.
- permission tests.

---

# 36. PHASE 20 — Archive Domain Server: Books, Relations, Circulars

## الهدف
نقل منطق الكتب الفعلي إلى Backend.

## العمليات
- create incoming.
- create outgoing.
- create internal.
- update.
- archive.
- status transition.
- related books.
- transaction-employee relation.
- comments/notes حسب السياسة.
- priority.
- attachments.
- historical import flag.

## Related Books
علاقة database حقيقية:
- book A refers to book B.
- one-to-many/many-to-many حسب الحاجة الفعلية.

يجب منع حلقات غير مقصودة أو على الأقل كشفها في validation إذا أصبح ذلك مهمًا للمعمارية.

## Duplicate Detection
يستخدم:
- official number.
- date.
- source.
- topic.
- file hash when available.

لا يمنع الإدخال تلقائيًا.

يظهر warning مع أسباب الاشتباه.

---

# 37. PHASE 21 — Notifications + Reminders Engine

## الهدف
إعطاء Backend القدرة على إنشاء وتنفيذ الأحداث الزمنية.

## Notification model
- user.
- event type.
- resource.
- createdAt.
- readAt/new state.
- payload/reference.

## Reminder model
- resource.
- dueAt.
- message.
- enabled.
- completed/processed state.

## Historical Import
يجب أن يحمل `historicalImport=true` أو ما يعادله عند استيراد 2022–2026.

هذا يمنع:
- إشعار جديد.
- إشعار تعديل حديث.
- تنبيه مصطنع للمدير.

## Background jobs
- reminder dispatcher.
- cleanup للمهام المنتهية عند الحاجة.
- فحوص مؤجلة.

---

# 38. PHASE 22 — OCR + Unified Search

## البحث العادي
يشمل:
- official number.
- internal sequence.
- date.
- source.
- addressed to.
- subject.
- content.
- employee.
- department.
- status.
- request.

## Search by employee
- suggestions.
- flexible matching.
- لا ينشئ Employee جديدًا بسبب typo.

## OCR
- يعمل بعد حفظ الصورة.
- خلفية/background job.
- لا يمنع حفظ الكتاب.
- النص المستخرج للفهرسة فقط.
- الصورة الأصلية هي المرجع الرسمي.

## Arabic normalization
يستخدم تطبيعًا وفهرسة مرنة بدل matching حرفي واحد.

## OCR Engine
يتم اختيار المحرك بعد Benchmark على عينات حقيقية.

Cline لا يختار مزودًا مدفوعًا أو خدمة سحابية من نفسه.

## الاختبارات
- image clear.
- low quality.
- stamps.
- Arabic variants.
- OCR failure recovery.

---

# 39. PHASE 23 — Reports + Statistics + Export

## التقارير الأساسية
- التقرير الشهري.
- الوارد.
- الصادر.
- الإجازات.
- الزمنيات.
- الأعمام والاطلاع.
- الطلبات.
- المنتسبين.
- الباحثين.
- الأساتذة.
- الحالة.

## مولد التقارير
filters:
- date from/to.
- section.
- type.
- employee.
- status.
- source.

## Export
- Excel.
- PDF.

## الأمان
التقرير والتصدير يخضعان لنفس Permission + Access Scope.

---

# 40. PHASE 24 — Integrity + Backup + Restore

## الهدف
جعل البيانات قابلة للاستعادة فعليًا.

## مصادر النسخ
- PostgreSQL.
- central attachments.
- configuration required for recovery.
- required audit/system state.

## التخزين المستهدف
- SSD للنظام والبيانات الحية.
- HDD داخلي للنسخ.
- HDD خارجي إضافي للنسخة الثانية عند توفره.

## Backup
- scheduled.
- success/failure record.
- verification.
- retention policy.

## Restore
- database restore.
- attachment restore.
- consistency check.
- application readiness check.

## اختبارات
استعادة نسخة فعلية على بيئة اختبار.

لا يعتبر Backup ناجحًا إذا لم يمكن اختبار Restore منه.

---

# 41. PHASE 25 — Advanced Security + Monitoring + Structured Logging

## Security
- server validation.
- rate limiting.
- session security.
- CORS configuration.
- CSRF strategy حسب نوع الـclient/session.
- secure secrets.
- audit.
- authorization.

## Monitoring
- CPU.
- RAM.
- disk.
- database.
- file storage.
- backup.
- service state.

## Readiness
فرق واضح بين:
- service is running.
- system is ready.

## شاشة حالة النظام
مثال:
- السقاية تعمل.
- قاعدة البيانات تعمل.
- التخزين طبيعي.
- آخر نسخة احتياطية ناجحة.

---

# 42. PHASE 26 — Performance + Background Processing

## التنفيذ
- indexes.
- pagination.
- lazy loading للمرفقات.
- عدم تحميل جميع الصور في القوائم.
- caching عند الحاجة.
- background jobs.
- job retry policy.
- job failure logging.

## المستهدف
عدد المستخدمين الحالي حوالي 15، مع عدم بناء افتراض أن العدد سيبقى ثابتًا للأبد.

## اختبارات
- 15 مستخدمًا متزامنًا.
- قائمة كبيرة من الكتب.
- مرفقات متعددة.
- OCR queue.
- notifications queue.

---

# 43. PHASE 27 — LAN Deployment

## السيرفر
الحاسوب الحالي الذي سيعمل كسيرفر في البداية.

## startup
- تشغيل الخدمات مع Windows.
- فحص DB.
- فحص storage.
- فحص backup state.
- readiness بعد نجاح checks.

## Sleep/Hibernate
يجب منع ما يوقف الخدمة أثناء ساعات التشغيل.

## إغلاق الغطاء
لا يؤدي إلى توقف السيرفر.

## الشبكة
لا hard-code لعنوان IP داخل التطبيق.

يستخدم:
- hostname/local resolution.
- أو عنوان ثابت قابل للتهيئة.
- fallback configuration.

المستخدم العادي لا يدخل IP يدويًا.

## Wi-Fi
السقاية لا تعتمد على اسم SSID.

يختبر الطرفان الوصول الفعلي إلى السيرفر.

## Internet
الوظائف الأساسية داخل LAN تعمل بدون الإنترنت الخارجي.

---

# 44. PHASE 28 — Windows Client + Mobile Experience

## Windows
يهدف النظام إلى الظهور كتطبيق مثبت، لا كموقع فقط.

القرار المعماري المقترح:
- تطبيق Windows shell خفيف يتصل بالسيرفر المركزي.
- محتوى الأعمال UI يأتي من السيرفر.
- لا يحتاج المستخدم إلى إعادة تثبيت التطبيق عند كل تحديث ويب.
- تحديثات الـshell نفسها تتم عبر آلية تحديث موقعة/مضبوطة عندما يلزم ذلك.

الآلية الدقيقة (مثل Tauri أو تقنية مكافئة) تثبت بعد اختبار بيئة Windows الفعلية، ولا يختار Cline تقنية مختلفة من نفسه.

## الهاتف
- Responsive/PWA.
- touch-friendly.
- فتح الصور.
- الأعمام.
- الطلبات.
- الإشعارات الداخلية.
- تسجيل الدخول وفق النظام.

---

# 45. PHASE 29 — Attendance / Fingerprint Integration

## الهدف
تهيئة التكامل مع نظام الحضور والانصراف الفعلي.

المسار المعماري:

```text
Fingerprint / Attendance Device / Vendor Software
                ↓
      Raw Attendance Import/API
                ↓
            Saqa
                ↓
     Employee official identifier
                ↓
 Derived Attendance Records
```

## طرق التكامل المسموحة
- Excel/CSV import/export.
- API.
- قاعدة بيانات الوسيط/البرنامج.
- connector رسمي.

## قاعدة
يجب معرفة جهاز الحضور/برنامجه الفعلي قبل كتابة connector إنتاجي.

لا يخترع Cline vendor أو database schema للجهاز.

## البيانات
- raw record يبقى محفوظًا.
- derived attendance منفصل.
- لا تُحذف السجلات الأصلية عند الاشتقاق.

---

# 46. PHASE 30 — Historical Archive Migration Preparation

## الأعوام
- 2022.
- 2023.
- 2024.
- 2025.
- 2026.

## قبل الإدخال
- mapping.
- cleaning.
- validation.
- attachment mapping.
- source preservation.
- duplicate detection.
- error report.
- dry run.

## تاريخان مهمان
- Document Date = تاريخ الوثيقة الأصلي.
- Imported At = تاريخ إدخالها في السقاية.

## قاعدة
لا يصدر عنها إشعار «جديد» أو نشاط حديث.

---

# 47. PHASE 31 — Migration Execution by Batches

كل سنة/دفعة تعالج منفصلة.

لكل دفعة:
1. تجهيز الملفات.
2. قراءة البيانات.
3. mapping.
4. كشف المكرر.
5. فحص التسلسل.
6. فحص التواريخ.
7. ربط المنتسبين.
8. ربط الكتب ذات الصلة.
9. تخزين المرفقات.
10. OCR.
11. مراجعة عينة.
12. اعتماد الدفعة.
13. تسجيل النتيجة.

لا يتم إدخال الإنتاج الكامل دفعة واحدة دون نقطة تحقق.

---

# 48. PHASE 32 — Comprehensive Testing

## Unit
- Auth.
- OTP.
- session.
- leave engine.
- time engine.
- duplicate detection.
- permission checks.
- search.
- reminders.
- notifications.

## Integration
- API + PostgreSQL.
- API + storage.
- Auth + session.
- permission + scope.
- backup + restore.
- OCR pipeline.

## Security Tests
- unauthorized direct API.
- privilege escalation attempt.
- invalid token/session.
- blocked account.
- leaked resource IDs.

## Recovery
- restart.
- backup restore.
- attachment restore.
- server replacement.

## OCR
عينات حقيقية متنوعة.

## Load
حوالي 15 مستخدمًا متزامنًا مع بيانات كبيرة نسبيًا.

---

# 49. PHASE 33 — Test Seed + UAT

## Test Seed
بيانات معزولة عن الحقيقة:
- employees.
- former employees.
- transactions.
- circulars.
- requests.
- leaves.
- time permissions.
- researchers.
- professors.
- attachments.
- notifications.

## UAT
ثلاثة مسارات رئيسية:
- admin.
- director.
- employee.

## قاعدة
لا تدخل بيانات العمل الحقيقية قبل نجاح UAT.

---

# 50. PHASE 34 — Production Readiness

قبل الإنتاج:
- backup tested.
- restore tested.
- accounts reviewed.
- permissions reviewed.
- LAN tested.
- server startup tested.
- storage capacity checked.
- device replacement procedure tested.
- maintenance procedure documented.
- recovery procedure documented.

---

# 51. PHASE 35 — Production Rollout

## الإطلاق
1. تشغيل محدود.
2. مراقبة.
3. إصلاح.
4. توسيع المستخدمين.
5. إدخال الأرشيف القديم على دفعات.

## قاعدة
الأرشيف الرسمي الورقي لا يستبدل تلقائيًا بالنظام.

السقاية أداة إدارة وأرشفة رقمية ومتابعة؛ أي تغيير رسمي في الأرشيف يجب أن يتبع السياسة الإدارية المعتمدة.

---

# 52. قواعد البيانات التاريخية والاستيراد

أي سجل قديم يجب أن يحتفظ بمصدره.

يجب التمييز بين:
- createdAt.
- documentDate.
- importedAt.
- updatedAt.

لا تستخدم `createdAt` بدل `documentDate` للوثائق التاريخية.

---

# 53. سياسة الاختبارات لكل مرحلة

كل مرحلة يجب أن تحتوي في تقريرها على:

```text
1. Scope implemented
2. Files changed
3. Files intentionally untouched
4. Tests executed
5. Test results
6. Known limitations
7. Deviations from plan
8. Business-rule decisions used
9. Git commit
10. Stop
```

لا تقبل عبارة «تم» دون نتائج.

---

# 54. بروتوكول Cline الإلزامي

يجب وضع النص التالي في تعليمات كل مرحلة أو في الملف المرجعي الذي يقرأه Cline:

```text
READ THE REPOSITORY AND THE CURRENT ALSQAYA PLAN FIRST.

This phase is authoritative and self-contained.
Implement ONLY this phase.

DO NOT:
- invent business rules;
- guess missing fields;
- choose undocumented workflow behavior;
- implement future phases;
- refactor unrelated code;
- remove tests or safeguards to make the build pass;
- replace server-side security with UI checks;
- silently change an approved business rule.

WHEN THE PLAN EXPLICITLY SAYS TBD / UNRESOLVED:
- do not invent a value;
- do not implement a guessed behavior;
- report the blocked item and stop at that part.

BEFORE EDITING:
1. inspect the relevant repository files;
2. identify dependencies;
3. compare the current implementation to this phase;
4. list the intended changes briefly.

DURING IMPLEMENTATION:
- keep domain logic in domain/services;
- keep React components focused on UI;
- enforce security on the server;
- preserve historical data;
- use IDs for relations;
- follow existing naming conventions where they do not conflict with this plan.

AFTER IMPLEMENTATION:
1. run typecheck/lint;
2. run build;
3. run phase-specific tests;
4. fix failures caused by this phase only;
5. inspect the diff;
6. verify no future-phase code was added;
7. report changed files;
8. report tests and results;
9. STOP.

Do not start the next phase automatically.
```

---

# 55. قواعد Git لكل مرحلة

قبل البدء:
- branch واضح للمرحلة.
- baseline نظيف.

بعد الإكمال:
- typecheck/lint.
- build.
- tests.
- diff review.
- commit.

Commit format:

```text
feat(scope): implement phase N - short description
```

لا تستخدم force push.

لا تحذف نقطة استقرار.

---

# 56. القرارات التي لا يجوز لـCline اختراعها

## قواعد أعمال غير محسومة
1. السقف النهائي للاستحقاق عند تجاوز 180 يومًا.
2. الحد العام للإجازة بدون راتب.
3. التفاصيل الرقمية للإجازة الدراسية.
4. تفاصيل إصابة العمل إذا كانت لها قواعد خاصة.
5. أي استثناء غير موثق للمرضية.
6. البيانات الخاصة التفصيلية للباحثين قبل اعتمادها.
7. بيانات جهاز الحضور الفعلي قبل معرفة الجهاز/البرنامج.
8. مزود SMS/OTP التجاري الفعلي.
9. آلية الوصول البعيد/الإنترنت خارج LAN إذا قررت إضافته لاحقًا.
10. أي صلاحيات للمدير غير المذكورة في هذه الوثيقة.

## القرار عند وجود TBD
القاعدة:

```text
TBD ≠ permission to guess
```

---

# 57. قرارات تقنية محسومة مسبقًا لتقليل الاجتهاد

1. React هو UI.
2. Node.js + Express + TypeScript هو Backend.
3. PostgreSQL هو مصدر الحقيقة.
4. Repository pattern للوصول للبيانات.
5. Attachment files خارج PostgreSQL، والـmetadata داخله.
6. Backend هو نقطة فرض الصلاحيات.
7. Background Jobs للـOCR والتذكيرات والنسخ الاحتياطي والفحوص الثقيلة.
8. Structured logs منفصلة عن Audit Logs.
9. Timeline مشتق وليس جدولًا مكررًا.
10. IDs هي أساس العلاقات.
11. Soft Delete للبيانات التي تحتاج تاريخًا.
12. Optimistic Concurrency للبيانات الحساسة للتزامن.
13. LAN أولًا.
14. الهاتف عبر Responsive/PWA.
15. Windows عبر shell/installed client، مع عدم إعادة التثبيت لكل تغيير في واجهة السيرفر.

---

# 58. ما الذي يجب تحديثه في ملفات المشروع بعد اعتماد هذه الخطة

بعد اعتماد هذا المستند، يجب مزامنة الوثائق التالية في المشروع:

- `ALSQAYA_PLAN.md` — ليصبح مرجع التنفيذ النهائي أو تتم إعادة تسميته إلى المرجع النهائي المتفق عليه.
- `PROJECT_VISION.md` — تحديث المصطلحات والحدود الجديدة.
- `PROJECT_RULES.md` — إضافة قواعد Cline والسلطة بين الوثائق.
- `Architecture.md` — تحديث المعمارية المستهدفة.
- تقارير المراحل — لا نعيد كتابتها؛ فقط نربطها بالخطة النهائية.
- أي وثائق Business Rules قديمة — تصحح أو تؤرشف إذا تعارضت.

## قائمة التصحيحات الضرورية

- إزالة مفهوم رمز التهيئة من الخطط الحالية.
- تصحيح الباحثين ليكونوا مستقلين عن Employee.
- تصحيح دور المدير إلى دور إشرافي مع Workflow المسموح فقط.
- إدخال المنتسبين السابقين.
- إدخال نظام إتاحة الكتب للمنتسبين.
- إدخال قواعد الإجازات والزمنيات الحالية.
- تحديث Timeline وفق التنفيذ الفعلي.
- تحديث حالة المشروع إلى Phase 7 المكتملة وPhase 8 التالية.
- إزالة أرقام المراحل المتعارضة بين الوثائق.

---

# 59. تعريف «اكتمال المشروع»

لا يعتبر المشروع مكتملًا لأن كل واجهة ظهرت.

يعتبر جاهزًا عندما:

- البيانات الحقيقية في PostgreSQL.
- المرفقات في تخزين مركزي آمن.
- Authentication يعمل.
- RBAC وAccess Scope يعملان على الخادم.
- الإتاحة والاطلاع يعملان.
- الموظفون السابقون محفوظون تاريخيًا.
- الإجازات والزمنيات محسوبة بالقواعد المعتمدة.
- الطلبات تعمل.
- الإشعارات والتذكيرات الداخلية تعمل.
- OCR والبحث يعملان ضمن الدقة المقبولة.
- Audit/View Logs تعمل.
- Backup/Restore تم اختبارهما.
- LAN مستقر.
- Windows/mobile يعملان.
- الاختبارات الشاملة/UAT نجحت.
- خطة الاستعادة على جهاز بديل مجربة.

---

# 60. القاعدة النهائية للتنفيذ

```text
Phase N
  ↓
Read current repository
  ↓
Read this phase specification
  ↓
Implement only N
  ↓
Test
  ↓
Review diff
  ↓
Stabilize
  ↓
Commit
  ↓
Report
  ↓
STOP
  ↓
Human/architecture review
  ↓
Phase N+1
```

**لا يوجد انتقال تلقائي إلى المرحلة التالية.**

---

# 61. ملاحظة ختامية مهمة

هذه الوثيقة تعمدت أن تكون أكثر تفصيلًا من الخطط السابقة. الغرض ليس جعل Cline يقرأ قائمة طويلة فقط، بل تقليل مساحة الاجتهاد إلى الحد الأدنى.

عندما تكون القاعدة معروفة، وردت صراحة.

عندما يكون القرار التقني قد حُسم، وردت آليته.

وعندما يكون القرار الوظيفي غير محسوم، ورد بوضوح على أنه `TBD` حتى لا يتحول نقص المعلومات إلى قاعدة عمل مخترعة.

بعد اعتماد هذه النسخة ومزامنة وثائق المشروع معها، تصبح هذه الوثيقة المرجع التنفيذي الرئيسي للمراحل القادمة. يبدأ التنفيذ من **Phase 8** فقط، ولا يجوز الرجوع إلى وثيقة أقدم لا تتوافق معها.

