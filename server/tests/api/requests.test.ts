/**
 * اختبارات Phase 19 عبر الـHTTP الحقيقي — الطلبات وسير الموافقة.
 *
 * المرجع: `ALSQAYA_PLAN.md` §18 · §35 · §28 · §10.2 · §10.3 · §33.
 *
 * ما يُثبَت هنا: المسار الكامل
 * `middleware → authorization → validation → controller → service →
 *  requestWorkflow → repository → PostgreSQL` بلا mock في أي طبقة.
 *
 * مصفوفة الصلاحيات (مصدرها §10 وPhase 12، **بلا صلاحية جديدة**):
 * | الدور | قراءة | إنشاء/تعديل | قرار Workflow |
 * |---|---|---|---|
 * | admin (§10.1) | ✅ | ✅ | ❌ `403` — §28: المسؤول لا يملك `approve_request` |
 * | director (§10.2) | ✅ | ❌ `403` | ✅ |
 * | employee (§10.3) | طلباته وحدها | ❌ `403` | ❌ `403` |
 *
 * جميع الطلبات المرفوضة تمرّ عبر `fetch` مباشر بلا أي مكوّن React، فـ«منع
 * على الخادم لا في الواجهة» مُثبَت لا مُدَّعى (§28).
 *
 * البيانات اصطناعية داخل قاعدة `alsqaya_test` المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  getJson,
  patchJson,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
  type JsonResponse,
} from './apiTestHelpers';
import {
  newAuthenticatedAccount,
  newEmployee,
  type TestRole,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import { ROLE_PERMISSIONS } from '../../src/authorization';

/** طلب كما يعيده الـAPI. */
interface RequestBody {
  id: string;
  employeeId: string;
  kind: string;
  status: string;
  version: number;
  payload: Record<string, unknown>;
  notes?: string;
  clarification?: { question?: string; response?: string };
  directorDecision?: { action: string };
}

/** طلب مع تاريخه وإجراءاته المتاحة. */
interface RequestDetailBody extends RequestBody {
  history: { action: string; fromStatus?: string; toStatus: string; comment?: string }[];
  availableActions: string[];
}

const SECRET = 'S3cret-Start';

/** حمولة `leave` صالحة (نوع له حقول إلزامية — §35/نموذج المجال). */
const LEAVE_PAYLOAD = {
  kind: 'leave',
  leaveType: 'annual',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  days: 5,
  reason: 'ظرف خاص',
};

describe('Phase 19 — API: الطلبات وسير الموافقة', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;
  let seq = 0;

  before(async () => {
    suite = await startApiSuite();
    pool = suite.pool;
    baseUrl = suite.baseUrl;
  });

  after(async () => {
    await stopApiSuite(suite);
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
  });

  /** حساب بدور الخطة وجلسة محقونة. */
  async function actorWithRole(role: TestRole): Promise<{ token: string; employeeId: string }> {
    seq += 1;
    const created = await newAuthenticatedAccount(suite.context, {
      badgeNumber: `R19-${role}-${seq}`,
      phone: `0771${String(seq).padStart(7, '0')}`,
      secret: SECRET,
      role,
    });
    return { token: created.sessionToken, employeeId: created.employee.id };
  }

  /** ينشئ طلباً عبر الـAPI كمسؤول ويثبت 201. */
  async function newRequest(overrides: Record<string, unknown> = {}): Promise<RequestBody> {
    const response = await postJson<RequestBody>(baseUrl, '/api/requests', {
      employeeId: overrides.employeeId ?? (await newEmployee(suite.context)).id,
      kind: 'leave',
      payload: LEAVE_PAYLOAD,
      ...overrides,
    });
    assert.equal(
      response.status,
      201,
      `فشل إنشاء الطلب: ${JSON.stringify(response.body)}`,
    );
    return response.body;
  }

  /** ينفّذ عملية workflow ويتوقع 200. */
  async function workflow(
    id: string,
    body: Record<string, unknown>,
  ): Promise<JsonResponse<RequestBody | ApiErrorBody>> {
    return postJson<RequestBody>(baseUrl, `/api/requests/${id}/workflow`, body);
  }

  /** يؤكد رفض الصلاحية: 403 ورمز PERMISSION_DENIED (§28). */
  function assertDenied(response: JsonResponse<ApiErrorBody>, label: string): void {
    assert.equal(
      response.status,
      403,
      `${label}: يجب أن يكون 403 — ${JSON.stringify(response.body)}`,
    );
    assert.equal(
      response.body.error?.code,
      'PERMISSION_DENIED',
      `${label}: رمز الخطأ PERMISSION_DENIED`,
    );
  }

  describe('الإنشاء والقراءة', () => {
    it('admin ينشئ مسوّداً: الحالة والنسخة من الخادم (§35)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      assert.equal(created.status, 'draft');
      assert.equal(created.version, 1);
      assert.deepEqual(created.payload, LEAVE_PAYLOAD);
      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(detail.status, 200);
      assert.deepEqual(detail.body.availableActions.sort(), ['cancel', 'submit']);
      assert.deepEqual(detail.body.history.map((entry) => entry.action), ['create']);
    });

    it('الأنواع الأربعة في §35 تُقبل، والخامس يُرفض 400', async () => {
      useTestSession((await actorWithRole('admin')).token);
      for (const kind of ['general', 'equipment', 'leave', 'time_permission']) {
        const payload =
          kind === 'leave'
            ? LEAVE_PAYLOAD
            : kind === 'time_permission'
              ? {
                  kind: 'time_permission',
                  date: '2026-09-25',
                  timeOut: '14:00',
                  timeIn: '16:00',
                }
              : { kind, subject: 'طلب عام' };
        const response = await postJson<RequestBody>(baseUrl, '/api/requests', {
          employeeId: (await newEmployee(suite.context)).id,
          kind,
          payload,
        });
        assert.equal(response.status, 201, `النوع ${kind} معتمد في §35`);
      }
      const rejected = await postJson<ApiErrorBody>(baseUrl, '/api/requests', {
        employeeId: (await newEmployee(suite.context)).id,
        kind: 'travel',
        payload: { kind: 'travel' },
      });
      assert.equal(rejected.status, 400, 'نوع غير معتمد يُرفض قبل القاعدة');
    });

    it('حقول مجهولة و`status` مرسلة من العميل ⇒ 400 (الحالة من الخادم)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const employeeId = (await newEmployee(suite.context)).id;
      const withStatus = await postJson<ApiErrorBody>(baseUrl, '/api/requests', {
        employeeId,
        kind: 'general',
        payload: { kind: 'general' },
        status: 'approved',
      });
      assert.equal(withStatus.status, 400, 'الحقل `status` ممنوع من العميل');
      const unknown = await postJson<ApiErrorBody>(baseUrl, '/api/requests', {
        employeeId,
        kind: 'general',
        payload: { kind: 'general' },
        priority: 'high',
      });
      assert.equal(unknown.status, 400, 'حقل مجهول يُرفض');
    });

    it('حمولة `leave` الناقصة الحقول تُرفض 400 قبل أي كتابة', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const response = await postJson<ApiErrorBody>(baseUrl, '/api/requests', {
        employeeId: (await newEmployee(suite.context)).id,
        kind: 'leave',
        payload: { kind: 'leave', leaveType: 'annual', startDate: '2026-10-01' },
      });
      assert.equal(response.status, 400);
      const list = await getJson<RequestBody[]>(baseUrl, '/api/requests');
      assert.equal(list.body.length, 0, 'لم يُكتب أي طلب');
    });

    it('PATCH المسوّد: نسخة إلزامية، والتعديل بعد الإرسال مرفوض (§33)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      const noVersion = await patchJson<ApiErrorBody>(
        baseUrl,
        `/api/requests/${created.id}`,
        { notes: 'بلا نسخة' },
      );
      assert.equal(noVersion.status, 400, 'expectedVersion إلزامية');

      const updated = await patchJson<RequestBody>(
        baseUrl,
        `/api/requests/${created.id}`,
        { notes: 'ملاحظة محدّثة', expectedVersion: 1 },
      );
      assert.equal(updated.status, 200);
      assert.equal(updated.body.version, 2);

      const stale = await patchJson<ApiErrorBody>(
        baseUrl,
        `/api/requests/${created.id}`,
        { notes: 'نسخة قديمة', expectedVersion: 1 },
      );
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error?.code, 'VERSION_CONFLICT');

      await workflow(created.id, { action: 'submit', expectedVersion: 2 });
      const afterSubmit = await patchJson<ApiErrorBody>(
        baseUrl,
        `/api/requests/${created.id}`,
        { notes: 'بعد الإرسال', expectedVersion: 3 },
      );
      assert.equal(afterSubmit.status, 404, 'التعديل في غير المسوّد غير موجود');
    });
  });

  describe('سير العمل: submit → approve / reject / clarification → reply', () => {
    it('المسار الكامل: submit ثم اعتماد، مع التاريخ الكامل (§18)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();

      // `submit` POST ⇒ `create` ⇒ admin اليوم (قرار RBAC معلّق — §5).
      const submitted = await workflow(created.id, {
        action: 'submit',
        expectedVersion: created.version,
      });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      assert.equal((submitted.body as RequestBody).status, 'submitted');

      // القرار: `approve_request` ⇒ المدير وحده (§28 · §10.2).
      useTestSession((await actorWithRole('director')).token);
      const approved = await workflow(created.id, {
        action: 'approve',
        expectedVersion: 2,
        comment: 'المبرر كافٍ',
      });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      const final = approved.body as RequestBody;
      assert.equal(final.status, 'approved');
      assert.equal(final.version, 3);
      // الاعتماد **لا ينشئ** سجلاً فعلياً (قاعدة غير محسومة — Blocker §5).
      assert.equal(
        (final as unknown as Record<string, unknown>).linkedLeaveId,
        undefined,
      );

      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.deepEqual(detail.body.history.map((entry) => entry.action), [
        'create',
        'submit',
        'approve',
      ]);
      assert.deepEqual(detail.body.history.map((entry) => entry.toStatus), [
        'draft',
        'submitted',
        'approved',
      ]);
      assert.equal(detail.body.history[2].fromStatus, 'submitted');
      assert.deepEqual(detail.body.availableActions, [], 'لا إجراء بعد الحالة النهائية');
    });

    it('رفض الطلب ينهي المسار ويكتب القرار', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });

      useTestSession((await actorWithRole('director')).token);
      const rejected = await workflow(created.id, {
        action: 'reject',
        expectedVersion: 2,
        comment: 'المبرر غير كافٍ',
      });
      assert.equal(rejected.status, 200);
      assert.equal((rejected.body as RequestBody).status, 'rejected');
      assert.equal((rejected.body as RequestBody).directorDecision?.action, 'reject');
    });

    it('طلب التوضيح ثم ردّ المنتسب ثم القرار (§18)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });

      useTestSession((await actorWithRole('director')).token);
      const clarified = await workflow(created.id, {
        action: 'request_clarification',
        expectedVersion: 2,
        comment: 'ما الغرض من الطلب؟',
      });
      assert.equal(clarified.status, 200);
      assert.equal((clarified.body as RequestBody).status, 'clarification_requested');

      // ردّ المنتسب: لا يغيّر الحالة (§18 — القرار يبقى للمدير).
      // `employee_reply` من أفعال صاحب الطلب ⇒ `create` اليوم (Blocker §5)،
      // فالمنفّذ في هذا الاختبار هو **المسؤول** لا المدير.
      useTestSession((await actorWithRole('admin')).token);
      const replied = await workflow(created.id, {
        action: 'employee_reply',
        expectedVersion: 3,
        response: 'الغرض: صيانة جهاز',
      });
      assert.equal(replied.status, 200, JSON.stringify(replied.body));
      assert.equal((replied.body as RequestBody).status, 'clarification_requested');

      useTestSession((await actorWithRole('director')).token);
      const approved = await workflow(created.id, { action: 'approve', expectedVersion: 4 });
      assert.equal(approved.status, 200);
      assert.equal((approved.body as RequestBody).status, 'approved');

      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.deepEqual(detail.body.history.map((entry) => entry.action), [
        'create',
        'submit',
        'request_clarification',
        'employee_reply',
        'approve',
      ]);
      assert.equal(detail.body.clarification?.question, 'ما الغرض من الطلب؟');
      assert.equal(detail.body.clarification?.response, 'الغرض: صيانة جهاز');
    });

    it('سؤال التوضيح إلزامي (400)، والانتقال غير المسموح 409', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });
      useTestSession((await actorWithRole('director')).token);

      // بلا `comment`: شكل ناقص ⇒ 400 لا 409.
      const noQuestion = await workflow(created.id, {
        action: 'request_clarification',
        expectedVersion: 2,
      });
      assert.equal(noQuestion.status, 400);

      // انتقال غير مسموح من الحالة ⇒ 409 قاعدة بلا أي كتابة. ويُنفَّذ
      // هنا بـ`admin` لأن `submit` من أفعال صاحب الطلب (`create` اليوم).
      useTestSession((await actorWithRole('admin')).token);
      const duplicate = await workflow(created.id, { action: 'submit', expectedVersion: 2 });
      assert.equal(duplicate.status, 409, 'إرسال طلب مُرسَل: انتقال غير مسموح');
      assert.equal(
        (duplicate.body as ApiErrorBody).error?.code,
        'REQUEST_TRANSITION_NOT_ALLOWED',
      );
      const after = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(after.body.status, 'submitted', 'الحالة لم تتغيّر');
      assert.equal(after.body.version, 2);
    });

    it('الإلغاء حالة نهائية لا حذف (§35 · §32)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });
      const cancelled = await workflow(created.id, { action: 'cancel', expectedVersion: 2 });
      assert.equal(cancelled.status, 200);
      assert.equal((cancelled.body as RequestBody).status, 'cancelled');

      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(detail.status, 200, 'الصف لم يُحذف');
      assert.deepEqual(detail.body.history.map((entry) => entry.action), [
        'create',
        'submit',
        'cancel',
      ]);
      const afterFinal = await workflow(created.id, { action: 'cancel', expectedVersion: 4 });
      assert.equal(afterFinal.status, 409, 'لا انتقال من حالة نهائية');
    });
  });

  describe('الصلاحيات على الخادم — Role × عملية (§28 · §10)', () => {
    it('approve_request: المدير يُعتمد، والمسؤول والمنتسب يُرفضان (403)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });

      // allowed: director — الطلب في `submitted` فيقبل `approve`.
      useTestSession((await actorWithRole('director')).token);
      assert.equal(
        (await workflow(created.id, { action: 'approve', expectedVersion: 2 })).status,
        200,
        'director يملك approve_request',
      );

      // denied: admin — §28 يمنح المسؤول كل العائلات **ما عدا**
      // `approve_request`، فمحاولته المباشرة (بطلب fetch لا بواجهة) 403.
      // الإجراء `approve` بعد `approved` مرفوض أيضاً بقاعدة، لكن **الفرض
      // يحدث أولاً** ⇒ 403 لا 409 (ترتيب §12: Authorization قبل Resource).
      const admin = await actorWithRole('admin');
      assertDenied(
        await requestWithToken<ApiErrorBody>(
          baseUrl,
          `/api/requests/${created.id}/workflow`,
          { method: 'POST', token: admin.token, body: { action: 'approve', expectedVersion: 3 } },
        ),
        'admin ينفّذ قرار Workflow (بلا approve_request)',
      );

      // denied: employee (نفس الإجراء: قرار Workflow لا يملكه).
      const employee = await actorWithRole('employee');
      assertDenied(
        await requestWithToken<ApiErrorBody>(
          baseUrl,
          `/api/requests/${created.id}/workflow`,
          {
            method: 'POST',
            token: employee.token,
            body: { action: 'approve', expectedVersion: 3 },
          },
        ),
        'employee ينفّذ قرار Workflow',
      );

      // والطلب لم يتغيّر: الرفض قبل الـcontroller، بلا كتابة (§12).
      useTestSession(admin.token);
      const check = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(check.body.version, 3, 'لا كتابة من محاولة مرفوضة');
      assert.equal(check.body.status, 'approved');
    });

    it('إنشاء/تعديل الطلب: admin فقط، وdirector وemployee يُرفضان', async () => {
      const admin = await actorWithRole('admin');
      useTestSession(admin.token);
      const created = await newRequest();
      const owner = (await newEmployee(suite.context)).id;

      for (const role of ['director', 'employee'] as const) {
        const actor = await actorWithRole(role);
        assertDenied(
          await requestWithToken<ApiErrorBody>(baseUrl, '/api/requests', {
            method: 'POST',
            token: actor.token,
            body: { employeeId: owner, kind: 'general', payload: { kind: 'general' } },
          }),
          `${role} POST /api/requests (create)`,
        );
        assertDenied(
          await requestWithToken<ApiErrorBody>(baseUrl, `/api/requests/${created.id}`, {
            method: 'PATCH',
            token: actor.token,
            body: { notes: 'محاولة', expectedVersion: 1 },
          }),
          `${role} PATCH /api/requests/:id (update)`,
        );
      }
    });

    it('بلا هوية ⇒ 401 لا 403 (فصل المصادقة عن التفويض)', async () => {
      useTestSession(null);
      const anonymous = await requestWithToken<ApiErrorBody>(baseUrl, '/api/requests', {
        method: 'GET',
      });
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.body?.error?.code, 'AUTHENTICATION_REQUIRED');
    });

    it('لا دور جديد ولا صلاحية جديدة في هذه المرحلة (§28)', () => {
      // المصفوفة كما في Phase 12 — Phase 19 لم تُضِف شيئاً.
      assert.deepEqual(ROLE_PERMISSIONS.director.slice().sort(), [
        'approve_request',
        'view',
      ]);
      assert.equal(ROLE_PERMISSIONS.admin.includes('approve_request'), false);
      assert.deepEqual(ROLE_PERMISSIONS.employee.slice().sort(), ['view']);
    });

    it('المدير لا يكسب CRUD على بيانات المنتسب بـ`approve_request` (§10.2)', async () => {
      const director = await actorWithRole('director');
      assertDenied(
        await requestWithToken<ApiErrorBody>(baseUrl, '/api/employees', {
          method: 'POST',
          token: director.token,
          body: { name: 'تجاوز', title: 'x', department: 'y' },
        }),
        'director ينشئ موظفاً (لا يستطيع — §10.2)',
      );
    });
  });

describe('نطاق الرؤية على الطلبات (§12 · §10.3)', () => {
    it('employee يرى طلباته وحدها؛ طلب غيره 404 لا 403 (لا كشف وجود)', async () => {
      const admin = await actorWithRole('admin');
      useTestSession(admin.token);
      const otherEmployee = await newEmployee(suite.context);

      // حساب employee مرتبط بمنتسب واحد: هو صاحب الطلب الأول.
      seq += 1;
      const employeeAccount = await newAuthenticatedAccount(suite.context, {
        badgeNumber: `R19-owner-${seq}`,
        phone: `0773${String(seq).padStart(7, '0')}`,
        secret: SECRET,
        role: 'employee',
      });
      // `newAuthenticatedAccount` يحقن جلسته — نعود لجلسة المسؤول قبل
      // إنشاء الطلبين (الإنشاء يحتاج `create`).
      useTestSession(admin.token);
      const mine = await newRequest({ employeeId: employeeAccount.employee.id });
      const theirs = await newRequest({ employeeId: otherEmployee.id });

      useTestSession(employeeAccount.sessionToken);
      const list = await getJson<RequestBody[]>(baseUrl, '/api/requests');
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.map((row) => row.id), [mine.id], 'طلباته وحدها');

      const own = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${mine.id}`);
      assert.equal(own.status, 200);
      const foreign = await getJson<ApiErrorBody>(baseUrl, `/api/requests/${theirs.id}`);
      assert.equal(foreign.status, 404, '404 لا 403: لا كشف وجود طلب الغير');
      assert.equal(foreign.body.error?.code, 'RESOURCE_NOT_FOUND');

      // والمسؤول يرى الاثنين (§10.1 يدير السجل).
      useTestSession(admin.token);
      const all = await getJson<RequestBody[]>(baseUrl, '/api/requests');
      assert.equal(all.body.length, 2);
    });

    it('director يرى كل الطلبات (نطاق سير الموافقة — §10.2)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      await newRequest();
      await newRequest();
      useTestSession((await actorWithRole('director')).token);
      const list = await getJson<RequestBody[]>(baseUrl, '/api/requests');
      assert.equal(list.body.length, 2, 'المدير يشوف طلبات سير الموافقة كلها');
    });
  });

  describe('التزامن والتشوّه والتدقيق', () => {
    it('نسخة قديمة في عملية Workflow ⇒ 409 VERSION_CONFLICT بلا كتابة (§33)', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });

      // الحالة `submitted` (نسخة 2)، والإجراء `approve` مسموح منها — لكن
      // العميل يرسل نسخة قديمة (1). فحص القاعدة يجتاز لأن الانتقال
      // مسموح، ثم يكشفه القفل التفاؤلي: لا كتابة فوق الأحدث (§33).
      useTestSession((await actorWithRole('director')).token);
      const stale = await workflow(created.id, { action: 'approve', expectedVersion: 1 });
      assert.equal(stale.status, 409);
      assert.equal((stale.body as ApiErrorBody).error?.code, 'VERSION_CONFLICT');

      // ثم الإجراء نفسه بالنسخة الصحيحة ينجح — والتاريخ يبقى 3 صفوف
      // (صفّ واحد لكل انتقال: لا أثر للمحاولة المرفوضة).
      const fresh = await workflow(created.id, { action: 'approve', expectedVersion: 2 });
      assert.equal(fresh.status, 200);
      assert.equal((fresh.body as RequestBody).status, 'approved');

      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(detail.body.status, 'approved', 'لم تُكتب فوق الأحدث');
      assert.deepEqual(detail.body.history.map((entry) => entry.action), [
        'create',
        'submit',
        'approve',
      ]);
    });

    it('أجسام مشوّهة ومجهولة الحقول ⇒ 400 بلا أي كتابة', async () => {
      useTestSession((await actorWithRole('admin')).token);
      const created = await newRequest();

      const malformed: { label: string; body: Record<string, unknown> }[] = [
        { label: 'بدون action', body: { expectedVersion: 1 } },
        { label: 'بدون نسخة', body: { action: 'submit' } },
        { label: 'نسخة صفرية', body: { action: 'submit', expectedVersion: 0 } },
        { label: 'إجراء غير معروف', body: { action: 'escalate', expectedVersion: 1 } },
        { label: 'حقل مجهول', body: { action: 'submit', expectedVersion: 1, force: true } },
        { label: 'ردّ فارغ', body: { action: 'submit', expectedVersion: 1, response: '   ' } },
      ];
      for (const { label, body } of malformed) {
        assert.equal((await workflow(created.id, body)).status, 400, `${label} ⇒ 400`);
      }
      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(detail.body.status, 'draft', 'لم تُنفَّذ أي عملية');
      assert.equal(detail.body.version, 1);
    });

    it('بلا مسار حذف للطلبات: DELETE غير موجود (§32)', async () => {
      const admin = await actorWithRole('admin');
      useTestSession(admin.token);
      const created = await newRequest();
      const viaDelete = await requestWithToken<ApiErrorBody>(
        baseUrl,
        `/api/requests/${created.id}`,
        { method: 'DELETE', token: admin.token },
      );
      assert.ok(
        viaDelete.status === 404 || viaDelete.status === 405,
        `لا مسار حذف للطلبات (كان ${viaDelete.status})`,
      );
      const detail = await getJson<RequestDetailBody>(baseUrl, `/api/requests/${created.id}`);
      assert.equal(detail.status, 200, 'الطلب باقٍ');
    });

    it('التدقيق: create + status_change بعد نجاح العملية (Phase 15 · §31)', async () => {
      const admin = await actorWithRole('admin');
      useTestSession(admin.token);
      const created = await newRequest();
      await workflow(created.id, { action: 'submit', expectedVersion: 1 });

      const logs = await getJson<
        { eventKind: string; entityKind?: string; entityId?: string }[]
      >(baseUrl, '/api/audit-logs');
      assert.equal(logs.status, 200);
      // الأحداث أعلى `listAuditLogs` تُقرأ من الأحدث، وفي كل اختبار يُكتب
      // صف واحد للطلب — فنقرأ صفَّي هذا الطلب مباشرة لنثبت النوعين.
      const raw = await pool.query<{ event_kind: string }>(
        `SELECT event_kind FROM audit_logs WHERE entity_id = $1 ORDER BY occurred_at ASC`,
        [created.id],
      );
      assert.deepEqual(
        raw.rows.map((row) => row.event_kind),
        ['create', 'status_change'],
        'حدث إنشاء + حدث تغيير حالة — بلا نوع AuditEventKind جديد',
      );

      // المدير لا يقرأ سجل التدقيق (§10.2 «لا يستطيع»).
      useTestSession((await actorWithRole('director')).token);
      assertDenied(await getJson<ApiErrorBody>(baseUrl, '/api/audit-logs'), 'director audit logs');
    });
  });
});
