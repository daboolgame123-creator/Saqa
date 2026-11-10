/**
 * اختبارات Phase 19 — آلة حالات الطلبات (خالصة، بلا قاعدة بيانات).
 *
 * المرجع: `ALSQAYA_PLAN.md` §18 · §35 · §56 (TBD).
 *
 * لماذا هذا الملف منفصل عن اختبارات الـHTTP: الانتقالات قاعدة أعمال
 * (§35) وواضحة في دوال خالصة، فيُختبر كل زوج (حالة × إجراء) بلا I/O.
 * اختبار المسار الكامل (صلاحية + تحقق + مخزن + PostgreSQL) في
 * `api/requests.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  allowedNextStatuses,
  availableActions,
  canTransition,
  isDirectorAction,
  isFinalRequestStatus,
  isRequestStatus,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  requiresClarificationQuestion,
} from '../src/services/requestWorkflow';
import { RequestTransitionError } from '../src/services/requestErrors';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
} from '../../src/core/models/personnelCatalogs';

/** كل الإجراءات القابلة للتنفيذ (بلا `create`). */
const ACTIONS = Object.keys(REQUEST_TRANSITIONS) as Array<keyof typeof REQUEST_TRANSITIONS>;

describe('Phase 19 — آلة حالات الطلبات (§35 · §18)', () => {
  test('الحالات السبع في §35 هي المصدر الوحيد، ومكمّلة للكتالوج', () => {
    assert.deepEqual([...REQUEST_STATUSES], [
      'draft',
      'submitted',
      'under_review',
      'clarification_requested',
      'approved',
      'rejected',
      'cancelled',
    ]);
    // الكتالوج العربي يغطي كل حالة — و`Record` يفرض ذلك في البناء،
    // والفحص هنا يوثّق العدّاد مقابل ترحيل 0012.
    assert.equal(Object.keys(REQUEST_STATUS_LABELS).length, 7);
    for (const status of REQUEST_STATUSES) {
      assert.ok(isRequestStatus(status), `${status} حالة معتمدة`);
    }
    assert.equal(isRequestStatus('unknown_status'), false);
    assert.equal(isRequestStatus(7), false);
    // الأنواع الأولية في §35 أربعة — لا خامس بلا اعتماد لاحق.
    assert.equal(Object.keys(REQUEST_KIND_LABELS).length, 4);
  });

  test('submit: من draft فقط (§35 · §18 «المنتسب يرسل الطلب»)', () => {
    assert.equal(canTransition('submit', 'draft'), true);
    for (const status of REQUEST_STATUSES) {
      if (status === 'draft') {
        continue;
      }
      assert.equal(canTransition('submit', status), false, `submit من ${status} ممنوع`);
    }
    // من `draft`: الإرسال أو الإلغاء فقط (§35).
    assert.deepEqual(allowedNextStatuses('draft'), ['submitted', 'cancelled']);
  });

  test('approve/reject: من submitted وclarification_requested فقط', () => {
    for (const action of ['approve', 'reject'] as const) {
      assert.equal(canTransition(action, 'submitted'), true, `${action} من submitted`);
      assert.equal(
        canTransition(action, 'clarification_requested'),
        true,
        `${action} بعد ردّ المنتسب على التوضيح`,
      );
      assert.equal(canTransition(action, 'draft'), false, `${action} من draft (لم يُرسل)`);
      assert.equal(canTransition(action, 'approved'), false, `${action} من approved`);
      assert.equal(canTransition(action, 'rejected'), false, `${action} من rejected`);
      assert.equal(canTransition(action, 'cancelled'), false, `${action} من cancelled`);
    }
  });

  test('clarification: من الحالات المفتوحة، وإلزامه بسؤال (§35)', () => {
    assert.equal(canTransition('request_clarification', 'submitted'), true);
    assert.equal(canTransition('request_clarification', 'clarification_requested'), true);
    assert.equal(canTransition('request_clarification', 'draft'), false);
    assert.equal(requiresClarificationQuestion('request_clarification'), true);
    for (const action of ACTIONS) {
      if (action === 'request_clarification') {
        continue;
      }
      assert.equal(
        requiresClarificationQuestion(action),
        false,
        `${action} لا يحتاج سؤال توضيح`,
      );
    }
  });

  test('employee_reply: من clarification_requested، ولا يغيّر الحالة (§18)', () => {
    assert.equal(canTransition('employee_reply', 'clarification_requested'), true);
    // الرد لا يقرّر: الحالة تبقى بانتظار توضيح والقرار للمدير.
    assert.deepEqual(REQUEST_TRANSITIONS.employee_reply, {
      from: ['clarification_requested'],
      to: 'clarification_requested',
    });
    assert.equal(canTransition('employee_reply', 'submitted'), false);
    assert.equal(canTransition('employee_reply', 'draft'), false);
  });

  test('cancellation rules: الحالات المفتوحة فقط، والنتيجة حالة نهائية (§32)', () => {
    assert.equal(canTransition('cancel', 'draft'), true);
    assert.equal(canTransition('cancel', 'submitted'), true);
    assert.equal(canTransition('cancel', 'clarification_requested'), true);
    assert.deepEqual(REQUEST_TRANSITIONS.cancel.to, 'cancelled');
    // لا «إلغاء اعتماد» ولا «إعادة فتح»: من الحالات النهائية لا شيء.
    for (const status of ['approved', 'rejected', 'cancelled'] as const) {
      assert.equal(canTransition('cancel', status), false, `cancel من ${status}`);
      assert.equal(isFinalRequestStatus(status), true);
    }
    assert.equal(isFinalRequestStatus('submitted'), false);
    assert.equal(isFinalRequestStatus('draft'), false);
  });

  test('لا حالة نهائية لها انتقال خارجي — صفر مسارات (§18 «الحالة النهائية»)', () => {
    for (const status of REQUEST_STATUSES) {
      if (!isFinalRequestStatus(status)) {
        continue;
      }
      const exits = ACTIONS.filter((action) => canTransition(action, status));
      assert.deepEqual(exits, [], `${status} نهائية: لا انتقال يخرج منها`);
    }
  });

  test('under_review: حالة معتمدة بلا مُنتِج معتمد (TBD — لا انتقال مخترع)', () => {
    // الحالة في القائمة (§35) ولا شيء ينتجها: النصّ لا يحدّد أي عملية
    // تنقل الطلب إليها ولا من يحق له ذلك.
    assert.equal(isRequestStatus('under_review'), true);
    assert.equal(isFinalRequestStatus('under_review'), false);
    assert.deepEqual(allowedNextStatuses('under_review'), []);
    assert.deepEqual(availableActions('under_review'), []);
  });

  test('availableActions = الإجراءات المسموحة، محسوبة من الجدول لا من الواجهة', () => {
    assert.deepEqual(availableActions('draft').sort(), ['cancel', 'submit']);
    assert.deepEqual(availableActions('submitted').sort(), [
      'approve',
      'cancel',
      'reject',
      'request_clarification',
    ]);
    assert.deepEqual(availableActions('clarification_requested').sort(), [
      'approve',
      'cancel',
      'employee_reply',
      'reject',
      'request_clarification',
    ]);
    assert.deepEqual(availableActions('approved'), []);
    assert.deepEqual(availableActions('rejected'), []);
    assert.deepEqual(availableActions('cancelled'), []);
  });

  test('أفعال قرار المدير هي الثلاثة التي تُفرض عليها approve_request (§28 · §10.2)', () => {
    assert.deepEqual(ACTIONS.filter(isDirectorAction).sort(), [
      'approve',
      'reject',
      'request_clarification',
    ]);
    assert.equal(isDirectorAction('submit'), false);
    assert.equal(isDirectorAction('employee_reply'), false);
    assert.equal(isDirectorAction('cancel'), false);
  });

  test('الرفض المتحرّك: خطأ قاعدة 409 يحمل العملية والحالة والمسموحات', () => {
    // المسار المرفوض في الخدمة يسير هكذا: فحص ثم خطأ. الفحص هنا
    // يتحقق من **نوع الخطأ ودلالته** لا من مسار HTTP (في `api/`).
    const action = 'approve' as const;
    assert.equal(canTransition(action, 'draft'), false);
    const error = new RequestTransitionError(action, 'draft', REQUEST_TRANSITIONS[action]);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'REQUEST_TRANSITION_NOT_ALLOWED');
    assert.equal(error.currentStatus, 'draft');
    assert.equal(error.action, 'approve');
    assert.equal(error.nextStatus, 'approved');
    assert.deepEqual(error.allowedFrom, ['submitted', 'clarification_requested']);
    assert.ok(error.isOperational, 'خطأ متوقع يُعرض للعميل');
  });

  test('أفعال الجدول هي عمليات §35 — لا رابع ولا خامس', () => {
    // قائمة مغلقة: أي عملية جديدة بلا نصّ في §35 تكسر هذا الاختبار.
    assert.deepEqual([...ACTIONS].sort(), [
      'approve',
      'cancel',
      'employee_reply',
      'reject',
      'request_clarification',
      'submit',
    ]);
    // `create` ليس انتقالاً: ينشئه المستودع بحالة `draft` فقط.
    assert.equal(canTransition('create', 'draft'), false);
  });
});