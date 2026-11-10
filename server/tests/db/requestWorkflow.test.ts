/**
 * اختبارات Phase 19 على مستوى القاعدة — المستودع والذرّية والقفل (§33).
 *
 * المرجع: `ALSQAYA_PLAN.md` §18 · §32 · §33 · §35.
 *
 * ما يُثبَت هنا ولا في اختبار الـHTTP:
 * 1) **الذرّية**: إنشاء الطلب = صف طلب + صف تاريخ `create`؛ وكل انتقال
 *    = تحديث + صف تاريخ. فلا يُوجد طلب بلا تاريخ ولا انتقال بلا صف.
 * 2) **قفل تفاؤلي بلا نافذة**: `version = expectedVersion` مع `version+1`
 *    في جملة واحدة، والكتابة مقيدة بالحالة (`status = 'draft'` للتعديل).
 * 3) **بلا حذف**: الإلغاء حالة `cancelled` والصف وتاريخه باقيان (§32).
 * 4) **قيد CHECK في القاعدة**: قيمة خارج القيد ترفضها القاعدة (23514)
 *    لا التطبيق وحده.
 *
 * البيانات اصطناعية داخل قاعدة `alsqaya_test` المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { PgRequestRepository } from '../../src/repositories/requestRepository';
import type { RequestRecord, RequestRepository, RequestScopeFilter } from '../../src/repositories/contracts';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

/** خطأ CHECK في PostgreSQL (قيمة خارج قائمة العمود). */
const CHECK_VIOLATION = '23514';

/** خطأ المفتاح الأجنبي. */
const FK_VIOLATION = '23503';

/**
 * الفاعل في контраفين — الاسمان مختلفان عمداً:
 * `RequestActor` (إنشاء) يستعمل `userId`، و`RequestTransitionInput` (انتقال)
 * يستعمل `actorUserId`. فالثابتان منفصلان حتى لا تمرّر قيمة في غير موضعها.
 */
const CREATE_ACTOR = { userId: null, employeeId: null } as const;
const ACTOR = { actorUserId: null, actorEmployeeId: null } as const;
const ALL: RequestScopeFilter = { kind: 'all' };

/** مسرد رمز خطأ PostgreSQL داخل تأكيد الرفض. */
function pgCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  };
}

describe('Phase 19 — قاعدة البيانات: الطلبات وسجل الحالات', () => {
  let pool: Pool;
  let repo: RequestRepository;
  let employeeId: string;

  before(async () => {
    ({ pool } = await startTestDatabase());
    repo = new PgRequestRepository(pool);
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO employees (name, title, department)
       VALUES ('منتسب اختبار', 'معاون إداري', 'الشؤون الإدارية') RETURNING id`,
    );
    employeeId = inserted.rows[0].id;
  });

  /** ينشئ طلب مسوّد ويعيد سجله. */
  async function newDraft(notes = 'طلب اختبار'): Promise<RequestRecord> {
    return repo.create(
      { employeeId, kind: 'general', payload: { kind: 'general', subject: 'جهاز' }, notes },
      CREATE_ACTOR,
    );
  }

  it('إنشاء الطلب: draft + صف تاريخ create في معاملة واحدة', async () => {
    const request = await newDraft();
    assert.equal(request.status, 'draft', 'الحالة الأولى draft من الخادم');
    assert.equal(request.version, 1, 'النسخة تبدأ 1');
    assert.equal(request.employeeId, employeeId, 'العلاقة بمعرّف لا باسم');

    const history = await repo.listHistory(request.id, ALL);
    assert.equal(history.length, 1);
    assert.equal(history[0].action, 'create');
    assert.equal(history[0].toStatus, 'draft');
    assert.equal(history[0].fromStatus, undefined, 'لا حالة قبل الإنشاء');
  });

  it('كل انتقال يكتب صف تاريخ، والتاريخ كامل بالترتيب (§18)', async () => {
    const draft = await newDraft();
    const submitted = await repo.transition(
      draft.id,
      { action: 'submit', expectedVersion: 1, ...ACTOR },
      ALL,
    );
    assert.equal(submitted.outcome, 'updated');
    const clarified = await repo.transition(
      draft.id,
      {
        action: 'request_clarification',
        expectedVersion: 2,
        comment: 'ما الغرض من الطلب؟',
        ...ACTOR,
      },
      ALL,
    );
    assert.equal(clarified.outcome, 'updated');
    const replied = await repo.transition(
      draft.id,
      { action: 'employee_reply', expectedVersion: 3, response: 'الغرض: صيانة', ...ACTOR },
      ALL,
    );
    assert.equal(replied.outcome, 'updated');
    const approved = await repo.transition(
      draft.id,
      { action: 'approve', expectedVersion: 4, ...ACTOR },
      ALL,
    );
    assert.equal(approved.outcome, 'updated');

    const history = await repo.listHistory(draft.id, ALL);
    assert.deepEqual(
      history.map((entry) => entry.action),
      ['create', 'submit', 'request_clarification', 'employee_reply', 'approve'],
    );
    assert.deepEqual(
      history.map((entry) => entry.toStatus),
      ['draft', 'submitted', 'clarification_requested', 'clarification_requested', 'approved'],
    );
    // الحالة الراهنة للطلب ومعها دورتا التوضيح والقرار محفوظتان.
    const final = await repo.findById(draft.id, ALL);
    assert.equal(final?.status, 'approved');
    assert.equal(final?.version, 5, 'النسخة تزداد لكل كتابة');
    assert.equal(final?.clarification?.question, 'ما الغرض من الطلب؟');
    assert.equal(final?.clarification?.response, 'الغرض: صيانة');
    assert.equal(final?.directorDecision?.action, 'approve');
  });

  it('القفل التفاؤلي: نسخة قديمة تُرفض ولا تكتب شيئاً (§33)', async () => {
    const draft = await newDraft();
    const first = await repo.update(draft.id, { notes: 'ملاحظة أولى' }, 1, ALL);
    assert.equal(first.outcome, 'updated');

    const stale = await repo.update(draft.id, { notes: 'كتابة فوق الأحدث' }, 1, ALL);
    assert.equal(stale.outcome, 'stale');
    assert.equal(stale.outcome === 'stale' ? stale.currentVersion : 0, 2);

    const current = await repo.findById(draft.id, ALL);
    assert.equal(current?.notes, 'ملاحظة أولى', 'لم تُكتب النسخة القديمة');
    assert.equal(current?.version, 2);
  });

  it('التعديل مسموح في draft فقط: بعد الإرسال يفشل بلا كتابة (§32)', async () => {
    const draft = await newDraft();
    await repo.transition(draft.id, { action: 'submit', expectedVersion: 1, ...ACTOR }, ALL);
    const attempt = await repo.update(draft.id, { notes: 'تعديل بعد الإرسال' }, 2, ALL);
    // `notFound` لا `stale`: الطلب موجود لكنه ليس مسوّداً، فلا يُكشف عن
    // ذلك (نفس سلوك Phase 16/17 — 404 بدل كشف حالة الطلب).
    assert.equal(attempt.outcome, 'notFound');
    const after = await repo.findById(draft.id, ALL);
    assert.equal(after?.notes, 'طلب اختبار');
    assert.equal(after?.version, 2);
  });

  it('الإلغاء حالة لا حذف: الصف وتاريخه يبقيان (§32)', async () => {
    const draft = await newDraft();
    const cancelled = await repo.transition(
      draft.id,
      { action: 'cancel', expectedVersion: 1, ...ACTOR },
      ALL,
    );
    assert.equal(cancelled.outcome, 'updated');
    assert.equal(cancelled.outcome === 'updated' ? cancelled.record.status : '', 'cancelled');

    assert.ok(await repo.findById(draft.id, ALL), 'الصف لم يُحذف');
    const history = await repo.listHistory(draft.id, ALL);
    assert.deepEqual(history.map((entry) => entry.action), ['create', 'cancel']);
  });

  it('لا انتقال بعد حالة نهائية: 409 بلا نجاح صامت (§33)', async () => {
    const draft = await newDraft();
    // `reject` لا يُقبل من `draft` (لم يُرسل): نُرسل أولاً ثم نرفض.
    await repo.transition(draft.id, { action: 'submit', expectedVersion: 1, ...ACTOR }, ALL);
    await repo.transition(draft.id, { action: 'reject', expectedVersion: 2, ...ACTOR }, ALL);
    const attempt = await repo.transition(
      draft.id,
      { action: 'approve', expectedVersion: 3, ...ACTOR },
      ALL,
    );
    // المستودع نفسه يرفض الإجراء: فحص الحالة يتم **داخل المعاملة** بعد
    // قراءة الحالة الراهنة، فلا كتابة ولا صف تاريخ.
    assert.equal(attempt.outcome, 'notAllowed');
    assert.equal(
      attempt.outcome === 'notAllowed' ? attempt.currentStatus : '',
      'rejected',
    );
    const current = await repo.findById(draft.id, ALL);
    assert.equal(current?.status, 'rejected');
    assert.equal(current?.version, 3, 'النسخة لم تزد');
    assert.equal((await repo.listHistory(draft.id, ALL)).length, 3, 'لا صف تاريخ زائد');
  });

  it('قيد CHECK في القاعدة: الحالة والنوع والعملية خارج القيد مرفوضة', async () => {
    const draft = await newDraft();
    // حالة خارج قائمة §35.
    await assert.rejects(
      () => pool.query(`UPDATE requests SET status = 'pending' WHERE id = $1`, [draft.id]),
      pgCode(CHECK_VIOLATION),
    );
    // نوع خارج قائمة §35.
    await assert.rejects(
      () => pool.query(`UPDATE requests SET kind = 'travel' WHERE id = $1`, [draft.id]),
      pgCode(CHECK_VIOLATION),
    );
    // عملية خارج قائمة §35 في سجل الحالة.
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO request_status_history (request_id, to_status, action)
           VALUES ($1, 'submitted', 'escalate')`,
          [draft.id],
        ),
      pgCode(CHECK_VIOLATION),
    );
    // FK: صاحب الطلب يجب أن يكون منتسباً موجوداً (القاعدة 7).
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO requests (employee_id, kind, payload, status)
           VALUES ('00000000-0000-0000-0000-0000000000ff', 'general', '{}', 'draft')`,
        ),
      pgCode(FK_VIOLATION),
    );
  });

  it('سجل الحالة يحمي الطلب من المحو: ON DELETE RESTRICT (§32)', async () => {
    const draft = await newDraft();
    await assert.rejects(
      () => pool.query(`DELETE FROM requests WHERE id = $1`, [draft.id]),
      pgCode(FK_VIOLATION),
    );
    assert.ok(await repo.findById(draft.id, ALL), 'الصف باقٍ بمعرّفه');
  });

  it('FK: الفاعل يبقى محفوظاً بعد حذف حسابه (SET NULL — سجل لا محو)', async () => {
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (username, display_name, role)
       VALUES ('REQ-ACT-1', 'فاعل الاختبار', 'director') RETURNING id`,
    );
    const draft = await repo.create(
      { employeeId, kind: 'general', payload: { kind: 'general' } },
      { userId: user.rows[0].id, employeeId },
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [user.rows[0].id]);

    const history = await repo.listHistory(draft.id, ALL);
    assert.equal(history.length, 1, 'الصف باقٍ');
    assert.equal(history[0].actorUserId, undefined, 'المعرّف صار NULL لا ضاع الصف');
    assert.equal(history[0].actorEmployeeId, employeeId, 'العلاقة بالمنتسب باقية');
  });

  it('لا رابط فعلي بعد الاعتماد: الأعمدة تبقى NULL (Blocker موثّق)', async () => {
    const draft = await newDraft();
    await repo.transition(draft.id, { action: 'submit', expectedVersion: 1, ...ACTOR }, ALL);
    await repo.transition(draft.id, { action: 'approve', expectedVersion: 2, ...ACTOR }, ALL);
    const approved = await repo.findById(draft.id, ALL);
    assert.equal(approved?.status, 'approved');
    // قاعدة «الاعتماد ينشئ Leave/TimePermission» غير محسومة ⇒ لا سجل ولا
    // رابط يُملآن.
    assert.equal(approved?.linkedLeaveId, undefined);
    assert.equal(approved?.linkedTimePermissionId, undefined);
    const leaves = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM leaves WHERE employee_id = $1`,
      [employeeId],
    );
    assert.equal(leaves.rows[0].count, '0', 'لم يُنشأ سجل إجازة تلقائياً');
    const ledger = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM leave_ledger WHERE employee_id = $1`,
      [employeeId],
    );
    assert.equal(ledger.rows[0].count, '0', 'لا حركة رصيد مخترَعة');
  });

  it('الإلغاء لا يعكس حركة رصيد ولا يمسّ سجلاً فعلياً (§15 لم تُستدعَ)', async () => {
    const draft = await newDraft();
    await repo.transition(draft.id, { action: 'cancel', expectedVersion: 1, ...ACTOR }, ALL);
    const ledger = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM leave_ledger WHERE employee_id = $1`,
      [employeeId],
    );
    assert.equal(ledger.rows[0].count, '0', 'لا حركة رصيد مخترَعة');
  });

  it('النطاق: owner يرى طلباته فقط، وempty يرى لا شيء (fail-closed)', async () => {
    const mine = await newDraft();
    const other = await pool.query<{ id: string }>(
      `INSERT INTO employees (name, title, department)
       VALUES ('منتسب آخر', 'معاون إداري', 'الشؤون الإدارية') RETURNING id`,
    );

    const ownerScope: RequestScopeFilter = { kind: 'owner', ownerEmployeeId: employeeId };
    assert.equal((await repo.findById(mine.id, ownerScope))?.id, mine.id);
    assert.equal(await repo.findById(other.rows[0].id, ownerScope), null);
    assert.equal((await repo.list({}, ownerScope)).length, 1);
    assert.equal((await repo.list({}, { kind: 'empty' })).length, 0);
    assert.equal(await repo.findById(mine.id, { kind: 'empty' }), null);
    assert.equal((await repo.listHistory(mine.id, { kind: 'empty' })).length, 0);
  });
});