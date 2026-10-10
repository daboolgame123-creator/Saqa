/**
 * requestRepository — مستودع الطلبات وسجل تغييرات حالتها (Phase 19).
 *
 * على نمط `transactionRepository` في Phase 17:
 * - **قفل تفاؤلي بلا نافذة**: كل كتابة على صف طلب هي `UPDATE` واحدة فيها
 *   `version = $expectedVersion` **و** `version = version + 1`، ومع
 *   `transition` شرط `status = $expectedStatus` أيضاً — فلا قراءة ثم
 *   كتابة، ولا نافذة بينهما. صفر صفوف يُصنَّف ولا يُترك نجاحاً صامتاً.
 * - **ذرّية**: إنشاء الطلب = صف طلب + صف تاريخ (`create`)، وكل انتقال =
 *   تحديث الطلب + صف تاريخ + (عند التوضيح/القرار) تحديث `jsonb` الخاص —
 *   داخل `withTransaction` واحدة، فلا طلب بلا تاريخ ولا انتقال بلا صف
 *   (§33 «database transactions للعمليات المركبة»).
 * - **بلا `DELETE`**: الإلغاء حالة `cancelled` (§32) — لا يُمحى صف ولا
 *   صفٌّ من تاريخه.
 * - **النطاق داخل الاستعلام**: قيد `RequestScopeFilter` يُبنى في
 *   `authorization/` ويُطبَّق في SQL هنا (لا تصفية بعد قراءة الكل)،
 *   ونطاق `empty` ⇐ استعلام لا يُعيد شيئاً (fail-closed).
 *
 * حدود متعمَّدة (موثّقة في `PHASE_19_REPORT.md`):
 * - `linked_leave_id` / `linked_time_permission_id` لا يُملآن: قاعدة
 *   «الاعتماد ينشئ السجل الفعلي» غير محسومة في الخطة (Blocker).
 * - لا انتقال إلى `under_review`: لا عملية معتمدة في §35 تُنتجها (TBD).
 */
import { withTransaction } from '../database/pool';
import type {
  CreateRequestInput,
  RequestActor,
  RequestListFilter,
  RequestRecord,
  RequestRepository,
  RequestScopeFilter,
  RequestTransitionInput,
  RequestWriteOutcome,
  UpdateRequestInput,
} from './contracts';
import { buildWhere, isPool, nullToUndefined, type Db } from './shared';
import { REQUEST_TRANSITIONS, canTransition } from '../services/requestWorkflow';
import type {
  RequestClarification,
  RequestDirectorAction,
  RequestDirectorDecision,
  RequestKind,
  RequestPayloadData,
  RequestStatus,
  RequestStatusHistoryRecord,
  RequestWorkflowAction,
} from '../../../src/core/models/request';

const COLUMNS = `
  id, employee_id AS "employeeId", kind, payload, status,
  clarification, director_decision AS "directorDecision", notes,
  linked_leave_id AS "linkedLeaveId",
  linked_time_permission_id AS "linkedTimePermissionId",
  created_at AS "createdAt", updated_at AS "updatedAt", version
`;

const HISTORY_COLUMNS = `
  id, request_id AS "requestId", from_status AS "fromStatus", to_status AS "toStatus",
  action, actor_user_id AS "actorUserId", actor_employee_id AS "actorEmployeeId",
  comment, created_at AS "createdAt"
`;

/** صف `requests` كما يعيده pg. */
interface RequestRow {
  id: string;
  employeeId: string;
  kind: RequestKind;
  payload: RequestPayloadData;
  status: RequestStatus;
  clarification: RequestClarification | null;
  directorDecision: RequestDirectorDecision | null;
  notes: string | null;
  linkedLeaveId: string | null;
  linkedTimePermissionId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** صف `request_status_history` كما يعيده pg. */
interface HistoryRow {
  id: string;
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  action: RequestWorkflowAction;
  actorUserId: string | null;
  actorEmployeeId: string | null;
  comment: string | null;
  createdAt: string;
}
function toRecord(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    ...(row.clarification !== null && { clarification: row.clarification }),
    ...(row.directorDecision !== null && { directorDecision: row.directorDecision }),
    ...(row.notes !== null && { notes: row.notes }),
    // يبقى `undefined` حتى تعتمد الخطة قاعدة ربط (Blocker موثّق).
    ...(row.linkedLeaveId !== null && { linkedLeaveId: row.linkedLeaveId }),
    ...(row.linkedTimePermissionId !== null && {
      linkedTimePermissionId: row.linkedTimePermissionId,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toHistoryRecord(row: HistoryRow): RequestStatusHistoryRecord {
  return {
    id: row.id,
    requestId: row.requestId,
    ...(row.fromStatus !== null && { fromStatus: row.fromStatus }),
    toStatus: row.toStatus,
    action: row.action,
    ...(row.actorUserId !== null && { actorUserId: row.actorUserId }),
    ...(row.actorEmployeeId !== null && { actorEmployeeId: row.actorEmployeeId }),
    ...(row.comment !== null && { comment: row.comment }),
    createdAt: row.createdAt,
  };
}

/**
 * شرط النطاق في SQL مع معاملاته.
 *
 * `empty` ⇒ `FALSE` (لا صف): fail-closed بلا استثناء، فلا يمرّ صف واحد
 * لحساب بلا منتسب أو لدور خارج §28. `owner` ⇒ `employee_id = $n`.
 */
function scopeCondition(scope: RequestScopeFilter, params: unknown[]): string {
  if (scope.kind === 'all') {
    return 'TRUE';
  }
  if (scope.kind === 'empty') {
    return 'FALSE';
  }
  params.push(scope.ownerEmployeeId);
  return `employee_id = $${params.length}`;
}

/** يضيف صفاً واحداً إلى `request_status_history` (§18 «تاريخ التغييرات»). */
async function insertHistory(
  db: Db,
  requestId: string,
  fromStatus: RequestStatus | null,
  toStatus: RequestStatus,
  action: RequestWorkflowAction,
  actor: { userId: string | null; employeeId: string | null; comment?: string },
): Promise<void> {
  await db.query(
    `INSERT INTO request_status_history (
       request_id, from_status, to_status, action,
       actor_user_id, actor_employee_id, comment
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      requestId,
      fromStatus,
      toStatus,
      action,
      actor.userId,
      actor.employeeId,
      actor.comment ?? null,
    ],
  );
}

/**
 * الأعمدة الإضافية التي يحتاجها الانتقال: سؤال التوضيح، ردّ المنتسب،
 * أو قرار المدير — تُحسب من **الحالة الراهنة** ومن الإجراء لا من العميل.
 */
function transitionExtras(
  input: RequestTransitionInput,
  before: RequestRow,
): { sets: string[]; params: unknown[] } {
  const now = new Date().toISOString();
  if (input.action === 'request_clarification') {
    return {
      sets: ['clarification'],
      params: [
        JSON.stringify({
          question: input.comment ?? '',
          askedAt: now,
          // ردّ سابق يبقى محفوظاً في **التاريخ** لا في الحالة الراهنة:
          // سؤال جديد يبدأ دورة توضيح جديدة.
        }),
      ],
    };
  }
  if (input.action === 'employee_reply') {
    const previous = before.clarification;
    return {
      sets: ['clarification'],
      params: [
        JSON.stringify({
          question: previous?.question ?? '',
          askedAt: previous?.askedAt,
          response: input.response ?? '',
          respondedAt: now,
        }),
      ],
    };
  }
  if (input.action === 'approve' || input.action === 'reject') {
    const decisionAction: RequestDirectorAction = input.action;
    return {
      sets: ['director_decision'],
      params: [
        JSON.stringify({
          action: decisionAction,
          decidedAt: now,
          ...(input.comment !== undefined && { comment: input.comment }),
        }),
      ],
    };
  }
  // `submit` و`cancel`: لا حقل حالة راهنة إضافي — القصة محفوظة كاملةً
  // في `request_status_history`.
  return { sets: [], params: [] };
}
/**
 * مستودع الطلبات — قراءة بنطاق، وكتابة بقفل تفاؤلي وذرّية.
 */
export class PgRequestRepository implements RequestRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string, scope: RequestScopeFilter): Promise<RequestRecord | null> {
    const params: unknown[] = [id];
    const result = await this.db.query<RequestRow>(
      `SELECT ${COLUMNS} FROM requests
        WHERE id = $1 AND ${scopeCondition(scope, params)}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(
    filter: RequestListFilter = {},
    scope: RequestScopeFilter = { kind: 'all' },
  ): Promise<RequestRecord[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'status', value: filter.status },
      { column: 'kind', value: filter.kind },
    ]);
    const scopeSql = scopeCondition(scope, params);
    const where = clause === '' ? ` WHERE ${scopeSql}` : `${clause} AND ${scopeSql}`;
    const result = await this.db.query<RequestRow>(
      `SELECT ${COLUMNS} FROM requests${where} ORDER BY created_at DESC, id DESC`,
      params,
    );
    return result.rows.map(toRecord);
  }

  /**
   * إنشاء الطلب بحالة `draft` + أول صف تاريخ في معاملة واحدة.
   *
   * الحالة `draft` تُثبَّت هنا ولا تأتي من المدخلات: العميل لا يرسل
   * حالةً أصلاً (§35 — الحالات نتاج عمليات الخادم لا حقلٌ يرسله العميل).
   */
  async create(input: CreateRequestInput, actor: RequestActor): Promise<RequestRecord> {
    const run = async (db: Db): Promise<RequestRecord> => {
      const inserted = await db.query<RequestRow>(
        `INSERT INTO requests (employee_id, kind, payload, status, notes)
         VALUES ($1,$2,$3,'draft',$4) RETURNING ${COLUMNS}`,
        [input.employeeId, input.kind, JSON.stringify(input.payload), input.notes ?? null],
      );
      const record = toRecord(inserted.rows[0]);
      await insertHistory(db, record.id, null, 'draft', 'create', {
        userId: actor.userId,
        employeeId: actor.employeeId,
      });
      return record;
    };
    return isPool(this.db) ? withTransaction(this.db, run) : run(this.db);
  }

  /**
   * تعديل جزئي (بيانات وصفية فقط) مقيد بالنسخة **و** بحالة `draft`.
   *
   * `status = 'draft'` داخل جملة `WHERE` نفسها: تعديل بعد الإرسال أو بعد
   * قرار نهائي لا ينفَّذ بصمت — يصير `notFound` (404) فلا يُكتب على طلب
   * لم يعد مسوّداً.
   */
  async update(
    id: string,
    patch: UpdateRequestInput,
    expectedVersion: number,
    scope: RequestScopeFilter,
  ): Promise<RequestWriteOutcome> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.payload !== undefined) {
      params.push(JSON.stringify(patch.payload));
      sets.push(`payload = $${params.length}`);
    }
    if (patch.notes !== undefined) {
      params.push(patch.notes);
      sets.push(`notes = $${params.length}`);
    }
    if (sets.length === 0) {
      const existing = await this.findById(id, scope);
      return existing === null
        ? { outcome: 'notFound' }
        : { outcome: 'updated', record: existing };
    }
    const scopeParams: unknown[] = [];
    const scopeSql = scopeCondition(scope, scopeParams);
    params.push(expectedVersion);
    params.push(id);
    const result = await this.db.query<RequestRow>(
      `UPDATE requests
          SET ${sets.join(', ')}, updated_at = now(), version = version + 1
        WHERE id = $${params.length}
          AND version = $${params.length - 1}
          AND status = 'draft'
          AND ${scopeSql}
        RETURNING ${COLUMNS}`,
      [...params, ...scopeParams],
    );
    if (result.rows.length === 0) {
      return this.classifyMiss(id, expectedVersion, scope);
    }
    return { outcome: 'updated', record: toRecord(result.rows[0]) };
  }

  /**
   * تنفيذ انتقال حالة: تحديث الطلب + صف تاريخ + تحديث `clarification`
   * أو `director_decision` عند الحاجة — في `withTransaction` واحدة.
   *
   * الحالة الهدف تُؤخذ من `REQUEST_TRANSITIONS` (المصدر الوحيد) لا من
   * العميل، والشرط `version = $before` مع `status = $before.status` يمنع
   * حتى التطبيق المزدوج المتزامن (409 لا نجاح صامت).
   */
  async transition(
    id: string,
    input: RequestTransitionInput,
    scope: RequestScopeFilter,
  ): Promise<RequestWriteOutcome> {
    const toStatus = REQUEST_TRANSITIONS[input.action].to;

    const run = async (db: Db): Promise<RequestWriteOutcome> => {
      // 1) قراءة الحالة الراهنة **داخل نفس المعاملة**: منها صفّ التاريخ
      //    (`fromStatus`) وحقلا clarification/director_decision اللذان
      //    يحتاجان القيمة السابقة — فلا تُقرآن من خارج المعاملة.
      const readParams: unknown[] = [id];
      const current = await db.query<RequestRow>(
        `SELECT ${COLUMNS} FROM requests
          WHERE id = $1 AND ${scopeCondition(scope, readParams)}`,
        readParams,
      );
      if (current.rows.length === 0) {
        return { outcome: 'notFound' };
      }
      const before = current.rows[0];

      // 2) شرط الحالة نفسه: الإجراء لا يُقبل من حالة لا تقبله. فحص
      //    مزدوج عمداً: الخدمة تفحص قبل الاستدعاء، وهذا يمنع
      //    الكتابة المباشرة على المستودع (أعمق مصدر للحقيقة).
      if (!canTransition(input.action, before.status)) {
        return { outcome: 'notAllowed', currentStatus: before.status };
      }

      // 3) التحديث مقيد **بالنسخة التي أرسلها العميل** وبالحالة التي قرأها
      //    المتوازي. `version = $3` هو `input.expectedVersion` لا
      //    `before.version`: لولا ذلك لكان القفل بلا أثر (يكتب الخادم على
      //    الأحدث دائماً فيتنازل عن شرط `expectedVersion` الذي يرسله العميل
      //    — وهو ما يمثّله §33 حرفياً).
      const extras = transitionExtras(input, before);
      const params: unknown[] = [id, toStatus, input.expectedVersion, before.status];
      const extraColumns: string[] = [];
      extras.sets.forEach((column, index) => {
        params.push(extras.params[index]);
        extraColumns.push(`${column} = $${params.length}`);
      });
      const setClause = [
        'status = $2',
        'updated_at = now()',
        'version = version + 1',
        ...extraColumns,
      ].join(', ');
      const updated = await db.query<RequestRow>(
        `UPDATE requests SET ${setClause}
          WHERE id = $1 AND version = $3 AND status = $4
          RETURNING ${COLUMNS}`,
        params,
      );
      if (updated.rows.length === 0) {
        // صفر صفوف: إما نسخة أقدم من المرسلة، أو تغيّرت الحالة بين
        // القراءة والكتابة. نُعيد التصنيف بلا أي كتابة (§33)، والنسخة
        // المُعادة هي ما قُوبل به شرط `version` داخل هذه المعاملة.
        return { outcome: 'stale', currentVersion: before.version };
      }

      // 4) صفّ التاريخ — في نفس المعاملة إجبارياً.
      await insertHistory(db, id, before.status, toStatus, input.action, {
        userId: input.actorUserId,
        employeeId: input.actorEmployeeId,
        ...(input.comment !== undefined && { comment: input.comment }),
      });

      return { outcome: 'updated', record: toRecord(updated.rows[0]) };
    };

    return isPool(this.db) ? withTransaction(this.db, run) : run(this.db);
  }

  /** تاريخ تغييرات الحالة (§18) — للقراءة فقط، الأقدم أولاً. */
  async listHistory(
    id: string,
    scope: RequestScopeFilter,
  ): Promise<RequestStatusHistoryRecord[]> {
    const params: unknown[] = [id];
    const result = await this.db.query<HistoryRow>(
      `SELECT ${HISTORY_COLUMNS} FROM request_status_history h
        WHERE h.request_id = $1
          AND EXISTS (
            SELECT 1 FROM requests r
             WHERE r.id = h.request_id AND ${scopeCondition(scope, params)}
          )
        ORDER BY h.created_at ASC, h.id ASC`,
      params,
    );
    return result.rows.map(toHistoryRecord);
  }

  /** صفر صفوف بعد كتابة `update` ⇒ `notFound` أو `stale` — بلا أي كتابة. */
  private async classifyMiss(
    id: string,
    expectedVersion: number,
    scope: RequestScopeFilter,
  ): Promise<RequestWriteOutcome> {
    const params: unknown[] = [id];
    const result = await this.db.query<{ version: number; status: RequestStatus }>(
      `SELECT version, status FROM requests
        WHERE id = $1 AND ${scopeCondition(scope, params)}`,
      params,
    );
    if (result.rows.length === 0) {
      return { outcome: 'notFound' };
    }
    // الطلب موجود لكنه ليس مسوّداً: يُعامل كما لو لم يُوجد، فلا يُكشف
    // عن حالة طلبٍ مرئي لفاعل يملك `update` (نفس سلوك Phase 16/17).
    if (result.rows[0].status !== 'draft') {
      return { outcome: 'notFound' };
    }
    return { outcome: 'stale', currentVersion: result.rows[0].version };
  }
}