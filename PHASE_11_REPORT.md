# PHASE 11 REPORT — Authentication / الحسابات / الجلسات

**الحالة:** مكتملة ومختبرة.
**نقطة الانتقال التالية:** Phase 12 — RBAC / الصلاحيات.

---

## 1. نطاق Phase 11

المرجع: `ALSQAYA_PLAN.md` §27 (و§11 للقواعد الوظيفية).

**الهدف:** تحويل قواعد الحسابات أعلاه إلى نظام خادم فعلي.

| بند الخطة | الحالة |
|---|---|
| Registration | ✅ `POST /api/auth/registration/otp` + `POST /api/auth/registration/verify` |
| Login | ✅ `POST /api/auth/login` |
| Sessions | ✅ `requireSession()` + `/api/auth/me` + `/api/auth/logout` |
| OTP | ✅ واجهة `OtpProvider` + جدول `auth_otp_codes` + `auth_otp_rate_limits` |
| Recovery | ✅ `POST /api/auth/recovery/otp` + `POST /api/auth/recovery/verify` |
| Admin reset | ✅ `POST /api/auth/accounts/:id/reset` + `POST /api/auth/secret` |
| Secret visibility exception | ✅ `GET /api/auth/accounts/:id/secret` (AES-256-GCM + مفتاح منفصل + audit) |
| OtpProvider كواجهة | ✅ واجهة + Test Provider + Log Provider للتطوير |
| **إجبار الهوية على المسارات** | ✅ `requireSession()` مركّب على كل راوترات البيانات |

**لم يُنفَّذ عمداً** (خارج النطاق): RBAC · Access Scope · واجهة دخول في React · اختيار مزوّد SMS تجاري.

---

## 2. ما تم تنفيذه

### 2.1 القاعدة — `server/migrations/0005_authentication.sql`

| العنصر | التفاصيل |
|---|---|
| `auth_sessions` | `token_hash` (تجزئة SHA-256، لا الرفعة)، `last_activity_at`، `revoked_at` |
| `auth_otp_codes` | `code_hash`، `purpose`، `attempts`، `expires_at`، `consumed_at`، `invalidated_at` |
| `auth_otp_rate_limits` | `phone` + `blocked_until` لحظر الطلبات |
| `users` (إضافة فقط) | `status` (`inactive`/`active`/`frozen`/`blocked`)، أعمدة السر المشفّر، `must_change_secret`، `failed_login_attempts`، `frozen_until` |

**بلا حذف ولا إعادة تسمية عمود** — `users` الموروثة من Phase 9 سليمة. إجمالي الجداول 18 ← 21.

### 2.2 الخادم — `server/src/auth/`

```
auth/
  authTypes.ts        الثوابت المنقولة من §11 + سجلات الأنواع
  authService.ts      منطق التسجيل والدخول وOTP والاستعادة وإعادة الضبط
  accountRepository.ts · sessionRepository.ts · otpRepository.ts
  crypto.ts           توليد وتجزئة ومقارنة ثابتة الزمن
  secretVault.ts      AES-256-GCM + عزل المفتاح (الوحدة الأمنية §11.8)
  otpProvider.ts      واجهة المزوّد + Test/Log providers
  authAudit.ts        كتابة أحداث المصادقة في audit_logs
  sessionMiddleware.ts  requireSession() + requireChangedSecret()
  authRoutes.ts · authController.ts · authValidators.ts · authDto.ts
  serviceContext.ts · index.ts
```

### 2.3 المسارات

```
/api/auth  ←  تُركَّب قبل حارس الجلسة (المدخل الذي يُنتج الجلسة)
  عامّة:     registration/otp · registration/verify
             recovery/otp · recovery/verify · login
  محمية:    GET /me · POST /logout · POST /secret
             POST /accounts/:id/reset · GET /accounts/:id/secret

/api/*     ←  requireSession() → requireChangedSecret() → الموارد
```

---

## 3. آلية المصادقة والجلسات (كما وُجدت فعلاً)

| الجانب | التنفيذ |
|---|---|
| هوية الجلسة | رفعة عشوائية 256 بت، تُسلَّم مرة واحدة في جسم الاستجابة |
| النقل | `Authorization: Bearer` أو كوكي `alsqaya_session` |
| التخزين | **تجزئة SHA-256 فقط** — لا نص الرفعة في القاعدة ولا في السجل |
| الخمول | 30 دقيقة، يعيد كل طلب ناجح ضبط المؤقّت |
| التزامن | جلسات متزامنة على الحساب نفسه مسموحة (لا قيد تفرد) |
| الخروج | يهدم الجلسة **الحالية فقط** |
| التجميد/الحظر | يبطل كل جلسات الحساب فوراً |
| السر السري | reversible encryption (AES-256-GCM) — لازمٍ لاستثناء رؤية الرمز (§11.8) |
| المفتاح | متغير بيئة منفصل `AUTH_SECRET_KEY`، **خارج القاعدة**، ولا جدول له |
| فشل فك التشفير | `503 SECRET_UNAVAILABLE` يوجّه إلى إعادة الضبط — لا تجاوز ولا قيمة مهترئة |

---

## 4. قرارات معمارية مهمة

| القرار | السبب |
|---|---|
| `requireSession()` يثبت **الهوية** فقط، و`requireChangedSecret()` يقيّد **الموارد** | كان الفرض داخل `requireSession` فيُغلق على المستخدم مسار تغيير الرمز المؤقت نفسه، فيبقى محبوساً على سرّ لا يستطيع تبديله — تناقض مع §11.7 |
| المعاملات محصورة في **النواة الذرّية**؛ عدّادات المحاولات وأحداث التدقيق تكتب **خارجها** (`durable()`) | كانت الكتابات داخل معاملة العملية، فالـROLLBACK كان يمحوها عند رمي الاستثناء — أي أن «كل المحاولات تسجل» و«طلبات OTP تسجل» لا تصمدان |
| تأخير المحاولة الرابعة **خارج** المعاملة | إمساك صف الحساب مقفلاً خمس ثوانٍ يمنع أي طلب تالٍ من لمس الصف نفسه |
| `token_hash` مجزّأ لا نصي | من يقرأ القاعدة لا يملك رفة صالحة |
| فك التشفير يفشل بصراحة | §11.8: فشل المفتاح يؤدي إلى إعادة الضبط، لا إلى تجاوز التشفير |
| القيم مشتقّة من سجل الموظف: `username` = رقم الباج، `display_name` = الاسم | لا تكرار للهوية؛ الهاتف يبقى في `employees` ولا يُنسخ إلى `users` |
| `OtpProvider` واجهة بلا تنفيذ شبكي | الخطة: لا يختار Cline مزوّد SMS تجاري من نفسه |

---

## 5. المشاكل التي ظهرت أثناء التنفيذ وكيف أُصلحت

### 5.1 تعليق كل طلب على المسارات المحمية (الأخطر)

**العطل:** `GET /api/auth/me` و`/logout` و`/secret` ومسارا إدارة الحساب كانت **تعلّق بلا استجابة حتى مهلة 300 ثانية**.

**السبب الجذري:** `requireSession` دالة **مصنع** (`requireSession(): RequestHandler`) فيجب استدعاؤها. `authRoutes.ts` كُتبت `router.get('/me', requireSession, me)` — فقرأ Express المصنع نفسه كوسيط، فأعاد وسيطاً جديداً **دون `next()` ولا استجابة**، فتعطّل الطلب. أما `createApiRouter()` فاستدعتها صحيحةً (`requireSession()`)، ولهذا كان `/api/employees` يردّ `401` فوراً بينما تعلّقت مسارات المصادقة.

**الدليل:** فحص محدود — `/health` يردّ في 48ms (نفس سلسلة الـmiddleware)، و`/api/auth/me` يتعلّق حتى برفعة مُلفّقة؛ و`pg_stat_activity` أثناء التعليق: **صفر** اتصال تطبيق وصفر أقفال غير ممنوحة (أي ليس القاعدة)؛ وتتبّع مؤقت أثبت أن `requireSession` لا يُستدعى أصلاً لمسار `me`.

**الإصلاح:** استدعاء `requireSession()` في المواضع الخمسة.

### 5.2 سجل التدقيق ومحاولات الفشل تُمحى بالـROLLBACK

**العطل:** عدّاد `auth_otp_codes.attempts` يبقى 0 بعد خمس محاولات خاطئة، ولا يُكتب أي صف في `audit_logs` لمحاولات الدخول أو OTP الفاشلة.

**السبب الجذري:** هذه الكتابات كانت داخل معاملة العملية، والاستثناء المرمي هو ما أرجعها.

**الإصلاح:** مسار `durable()` يكتب خارج المعاملة، والمعاملات باقية للنواة الذرّية فقط. **تحقّق صريح:** الاستثناء الأصلي ما زال يُرمى **بعد** تسجيل الحدث، وفشل الكتابة لا يبتلَع بل يُرمى.

### 5.3 عمود ملتبس في استعلام بدمج جدولين

**العطل:** `column reference "id" is ambiguous` عند الدخول برقم الهاتف.

**السبب:** `SELECT` غير مُسبوق بالجدول في استعلام ينضمّ `users` إلى `employees`.

**الإصلاح:** قائمة أعمدة مُسبوقة (`ACCOUNT_COLUMNS_JOINED`).

### 5.4 محقّق مسار `:id` كان يفحص الكائن لا القيمة

كان يفحص `req.params` كاملاً فيرفض كل معرّف صالح بـ400. أُصلح بقراءة `req.params.id`.

### 5.5 أخطاء في الاختبارات (ليست في التطبيق)

| الحالة | السبب الحقيقي |
|---|---|
| `'Wr0ng'` لم يُسجَّل كمحاولة دخول | طوله 5 محارف فيُرفض بالتحقق (`400`) **قبل** أي محاولة — التطبيق صحيح، فبيانات الاختبار كانت خاطئة |
| `logout` أعاد 200 لا 204 | التطبيق يردّ `204` بلا جسد (صحيح)؛ التوقع في الاختبار كان خاطئاً |
| `POST /api/auth/secret` أعاد 401 | الاختبار كان يرسل بلا جلسة بعد `useTestSession(null)` |

---

## 6. نتائج التحقق الفعلية

| الفحص | العدد | النتيجة |
|---|---|---|
| `npm run test:api` → `auth.test.ts` | 36 | ✅ |
| `npm run test:server` | 60 | ✅ |
| `npm run test:db` | 43 | ✅ |
| `npm run test:api` (الكل) | 96 | ✅ |
| **`npm run test:all`** | **199** | **✅ صفر فشل** |
| `npm run build` | — | ✅ نجح |
| `npm run lint` (tsc) | — | ✅ نظيف |

**تغطية `auth.test.ts` (36 اختباراً):** الاختبارات الإلزامية الاثنا عشر في §27 مغطّاة واحدةً واحدة — success · wrong credential · 4th attempt delay · 5th freeze · freeze invalidates sessions · OTP expiry · OTP reuse rejection · OTP request rate limit · OTP wrong attempts · password reset · concurrent sessions · logout single session. إضافةً: تسجيل الحساب مفعّلاً · الدخول برقم الهاتف · مهلة الخمول · رفض كل مسار بيانات بلا جلسة · إعادة الضبط الإداري · كشف الرمز مع التدقيق · فشل فك التشفير ⇒ 503 · التجميد يبطل الجلسات · تغيير الرمز يفتح الوصول.

---

## 7. تغيّرات على اختبارات سابقة (مبرَّرة)

| الملف | التغيير | السبب |
|---|---|---|
| `tests/db/migrations.test.ts` | 4 ← 5 إصدارات، 18 ← 21 جدولاً | ترحيل `0005` |
| `tests/db/testDb.ts` | الجداول الثلاثة الجديدة ضمن التصفير | لا تسرّب بيانات بين الملفات |
| `tests/api/*.test.ts` (ستة ملفات) | `newAuthenticatedAccount` في `beforeEach` | مسارات `api/*` صارت تتطلّب جلسة |
| `tests/errors.test.ts` | فصل «محمي» عن «غير موجود»، و`/api/auth/login` صار موجوداً | فرض الجلسة غيّر رموز 404/401 |
| `tests/requestId.test.ts` | فحص 404 على مسار غير محمي + فحص 401 | `/api/*` محمي فصار 401 قبل 404 |
| `tests/scope.test.ts` | `auth/` خرجت من المحجوزة + حارس ضد تسرّب Phase 12/13 | نُفِّذت `auth` |
| `tests/api/employees.test.ts` | عدّ الموظفين بالاسم بدل عدد مطلق | زرع حساب المصادقة يزيد العدد |
| `tests/api/transactions.test.ts` | التحقق من **مجموعة** أسماء المرفقات لا ترتيبها | الترتيب غير محدد في الخطة (انظر §9) |

---

## 8. الملفات المهمة

### جديد
`server/migrations/0005_authentication.sql` · `server/src/auth/` بالكامل (17 ملفاً) · `server/tests/api/auth.test.ts`

### مُعدَّل
`server/src/routes/index.ts` · `server/src/api/routes/index.ts` · `server/src/config/env.ts` · `.env.example` · `ALSQAYA_PLAN.md` · `Architecture.md` · `README.md` · ملفات الاختبارات المذكورة في §7

### محذوف
`server/src/auth/.gitkeep` (المجلد لم يعد محجوزاً)

---

## 9. تقييدات معروفة (موثّقة لا مُخفاة)

| البند | الحالة | المرحلة المسؤولة |
|---|---|---|
| **لا RBAC** | مسارا إعادة الضبط وكشف الرمز يتطلّبان **جلسة صالحة فقط** — أي مستخدم مسجّل يستطيع استدعاءهما | **Phase 12** |
| **لا Access Scope** | لا تحقق من نطاق رؤية البيانات | **Phase 13** |
| **لا واجهة دخول في React** | Phase 11 طبقة خادم فقط؛ الواجهة ستُرفض بـ`401` حتى تُضاف شاشة ترسل الجلسة | لاحق |
| **مزوّد SMS** | `OtpProvider` واجهة فقط؛ Log Provider للتطوير. في الإنتاج `AUTH_OTP_PROVIDER` إلزامي | قرار نشر |
| **ترتيب المرفقات** | غير محدد في الخطة؛ القاعدة تحسمه `uuid` عشوائي. الاختبار يتحقق من المجموعة لا الترتيب | مرحلة المرفقات (14/17) |
| **`users.is_active`** | عمود موروث من Phase 9 لا يقرأه كود؛ حالة الحساب المعتمدة هي `users.status` | — |
| `AUTH_SECRET_KEY` | إلزامي في الإنتاج (الخادم لا يقلع بدونه)؛ خارج الإنتاج مفتاح عابر للعملية | — |

---

## 10. حالة الإغلاق

- ✅ **نطاق Phase 11 كامل** — كل بند من بنود §27، والاختبارات الإلزامية الاثنا عشر.
- ✅ **إجبار الهوية على الخادم** — كل `/api/*` يرفض بلا جلسة قبل الـcontroller.
- ✅ **سجل التدقيق يصمد** — محاولات الدخول وOTP الفاشلة تُحفظ رغم رمي الاستثناء.
- ✅ **استثناء رؤية الرمز معزول** — تشفير عكسي + مفتاح خارج القاعدة + تدقيق + لا تجاوز عند الفشل.
- ✅ **اختبارات** — 199/199 خضراء؛ `tsc` و`build` نظيفان.
- ✅ **لا بيانات حقيقية** — كل ما يُزرع اصطناعي داخل `alsqaya_test` المعزولة.
- ✅ **لا أسرار** — `AUTH_SECRET_KEY` توثيق بلا قيمة في `.env.example`.
- ✅ **لم تُنفَّذ** أي مرحلة من Phase 12+.

**Phase 11 = مكتملة.**

---

## 11. الانتقال إلى Phase 12 (لم يُنفَّذ)

نقطة الدخول واضحة: مجلد `authorization/` ما زال محجوزاً، و`requireSession()` و`requireChangedSecret()` يركّبان في `api/routes/index.ts` **قبل** أي فحص صلاحية، فطبقة RBAC تُضاف بينهما.

**مطلوب معروف مسبقاً:** تعداد `Permission families` في §28 — ومنه `manage accounts` و`manage security` اللذان يغطيان حالياً مسارَي الإدارة في §11 بلا فحص — مع فرض «allowed / denied / denied when direct API call bypasses UI» لكل Role × عملية حساسة.

**نقطة تصميمية يجب الانتباه لها:** عند إدخال فحص الدور، `requireChangedSecret()` يجب أن يبقى في موضع يسمح لحساب يحمل رمزاً مؤقتاً بتغييره، وإلا عاد القفل الذي أُصلح في §4.

---

> هذا التقرير توثيق تاريخي لمرحلة نُفِّذت، ولا يُغني عن `ALSQAYA_PLAN.md` ولا يغيّر نطاقها. المتطلبات في الخطة هي المرجع؛ ما هنا وصف ما نُفِّذ فعلاً وما تحقّق منه.
