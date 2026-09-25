# Architecture — معمارية نظام السقاية

**الحالة:** معمارية معتمدة بعد مزامنة الخطة في 2026-09-25.

## 1. الوضع الفعلي الحالي

المشروع أكمل Phase 0 إلى Phase 7.

Phase 7 نفذت Timeline كطبقة مشتقة من السجلات الأصلية، ولا يوجد جدول Timeline مستقل يكرر البيانات.

النظام ما زال Prototype من ناحية التخزين والتشغيل؛ Backend/PostgreSQL النهائيان لم يبدأا بعد.

## 2. المعمارية المستهدفة

```text
Windows / Browser / Mobile
          │
          ▼
     React Client
          │
          ▼
      REST API
          │
          ▼
 Node.js + Express + TypeScript
          │
   ┌──────┼───────────────┐
   │      │               │
   ▼      ▼               ▼
Auth   Services        Validation
   │      │
   │      ▼
   │  Repositories
   │      │
   └──────┼───────────────┐
          ▼               ▼
      PostgreSQL     Central File Storage

Background Jobs / Scheduled Operations
Audit / View Logs
Backup / Restore
Health / Readiness / Monitoring
```

## 3. المسؤوليات

### Client
- العرض.
- التفاعل.
- إدارة حالة الواجهة.
- استدعاء API.

### Backend
- المصادقة.
- الصلاحيات.
- Access Scope.
- التحقق من المدخلات.
- قواعد الأعمال.
- الوصول للبيانات.
- تسجيل الأحداث الحساسة.

### PostgreSQL
تصبح مصدر الحقيقة الأساسي بعد Phase 9.

### File Storage
الملف الفعلي في التخزين المركزي؛ قاعدة البيانات تحفظ metadata والمفتاح/المسار.

## 4. Identity / Permission / Scope

```text
Identity
   ↓
Permission
   ↓
Access Scope
   ↓
Resource
```

وجود الدور وحده لا يكفي للوصول إلى مورد مقيد.

## 5. الجلسات والمصادقة

المصادقة النهائية تستخدم القواعد المحددة في `ALSQAYA_PLAN.md`، ومنها:
- إنشاء الحساب عبر رقم الباج/الرقم الوظيفي + الهاتف المسجل + OTP.
- لا يوجد Initialization Code.
- الدخول المعتاد برقم الباج أو الهاتف + الرمز السري.
- جلسة بخمول 30 دقيقة.
- تجميد/حظر الحساب يبطل الجلسات النشطة.
- OTP وقواعد المحاولات والـrate limits محددة في الخطة.

## 6. التخزين المحلي

`localStorage` جزء من Prototype فقط، وليس مصدر الحقيقة النهائي.

المرفقات المحلية/Base64 ليست تخزينًا إنتاجيًا نهائيًا.

## 7. المجال الوظيفي

المجالات الرئيسية:
- User / Accounts.
- Employee / Former Employee.
- Researcher.
- Transactions/Books.
- TransactionEmployee.
- Attachments.
- Leaves / LeaveBalance / LeaveLedger.
- Time Permissions (الزمنيات).
- Assignments / Courses.
- Daily Situation.
- Requests.
- Notifications / Reminders.
- Audit / View Logs.
- Timeline (derived read model).
- Reports / Search / OCR.

## 8. البيانات التاريخية

المنتسب السابق يبقى محفوظًا مع تاريخه.

الأرشيف القديم 2022–2026 يحافظ على تاريخ الوثيقة وتاريخ إدخالها إلى السقاية، ولا يولد أحداثًا حديثة مصطنعة.

## 9. قواعد لا تغيرها المراحل

- لا علاقة رئيسية بالأسماء النصية.
- لا حذف تاريخي بسبب UI.
- لا صلاحية أمنية نهائية في العميل.
- لا تنفيذ لقواعد غير معتمدة.
- لا تكرار للبيانات الأصلية داخل Timeline أو التقارير.

## 10. المرجع

التفاصيل التنفيذية المرحلية والقواعد النهائية موجودة في:

`ALSQAYA_PLAN.md`
