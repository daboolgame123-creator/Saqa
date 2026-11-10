/**
 * خدمة الطلبات وسير الموافقة في طبقة الـAPI (Phase 19 · §18 · §35).
 *
 * ترتيب الطبقات على المسار كما في بقية الموارد:
 *   `authorization` (صلاحية + نطاق) → validation (شكل) → **هنا**
 *   → `requestWorkflow` (آلة الحالات) → repository → PostgreSQL.
 *
 * ما تفعله الخدمة وما لا تفعله — مقصود:
 * - **لا صلاحية ولا نطاق هنا**: كلاهما مبنيّ على المسار/الوسيط
 *   (`requirePermission` · `requestScopeOf`). الخدمة تطبّق `scope`
 *   الذي مُرِّر إليها فقط، فلا تعرف `role` ولا تحسبه.
 * - **لا تحقّق من الشكل**: `api/validation` سبقها. الخدمة تفحص
 *   **الحالة** فقط عبر `assertTransitionAllowed`.
 * - **لا أثر على أي سجل آخر**: لا إنشاء Leave/TimePermission عند
 *   الاعتماد ولا عكس رصيد عند الإلغاء — كلااهما قاعدة لم تحسمها الخطة
 *   (موثّق في `PHASE_19_REPORT.md` §5) ولا يُخترع له هنا سلوك.
 * - **لا `delete`**: الإلغاء حالة `cancelled` (§32)؛ الصف وتاريخه يبقيان.
 */
import type {
  RequestRecord,
  RequestRepository,
  RequestScopeFilter,
  RequestTransitionInput,
  RequestWriteOutcome,
} from '../../repositories/contracts';
import type { AuditActor } from '../../audit';
import type {
  CreateRequestDto,
  RequestDetailDto,
  RequestDto,
  RequestListQuery,
  RequestWorkflowBody,
  UpdateRequestDto,
} from '../dto/request';
import { ResourceNotFoundError, VersionConflictError } from '../errors';
import {
  REQUEST_TRANSITIONS,
  assertTransitionAllowed,
  availableActions,
} from '../../services/requestWorkflow';
import { RequestTransitionError } from '../../services/requestErrors';
import type {
  RequestStatus,
  RequestWorkflowAction,
} from '../../../../src/core/models/request';

const ARABIC_REQUEST = 'الطلب';

/** سجل الطلب كما يعيده الـAPI (نموذج المجال بلا فهرسة). */
function toDto(record: RequestRecord): RequestDto {
  return {
    id: record.id,
    employeeId: record.employeeId,
    kind: record.kind,
    payload: record.payload,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.clarification !== undefined && { clarification: record.clarification }),
    ...(record.directorDecision !== undefined && {
      directorDecision: record.directorDecision,
    }),
    ...(record.notes !== undefined && { notes: record.notes }),
    ...(record.linkedLeaveId !== undefined && { linkedLeaveId: record.linkedLeaveId }),
    ...(record.linkedTimePermissionId !== undefined && {
      linkedTimePermissionId: record.linkedTimePermissionId,
    }),
    version: record.version,
  };
}

export class RequestApiService {
  constructor(private readonly requests: RequestRepository) {}

  /** قائمة الطلبات ضمن نطاق الفاعل — التصفية في SQL لا بعد القراءة. */
  async list(filter: RequestListQuery, scope: RequestScopeFilter): Promise<RequestDto[]> {
    const records = await this.requests.list(
      {
        ...(filter.employeeId !== undefined && { employeeId: filter.employeeId }),
        ...(filter.status !== undefined && { status: filter.status }),
        ...(filter.kind !== undefined && { kind: filter.kind }),
      },
      scope,
    );
    return records.map(toDto);
  }

  /**
   * طلب واحد بتاريخه وإجراءاته المتاحة، أو 404.
   *
   * `history` من `request_status_history` و`availableActions` من جدول
   * الانتقالات — كلاهما قراءة، لا حساب قاعدة في هذه الدالة.
   */
  async getById(id: string, scope: RequestScopeFilter): Promise<RequestDetailDto> {
    const record = await this.requireVisible(id, scope);
    const history = await this.requests.listHistory(id, scope);
    return {
      ...toDto(record),
      history,
      availableActions: availableActions(record.status),
    };
  }

  /**
   * إنشاء طلب بحالة `draft`.
   *
   * الفاعل من هوية الجلسة (`AuditActor`) لا من الجسم — حتى يُسجَّل
   * `request_status_history.actor_*` ومنه يُشتق حدث التدقيق `create`.
   */
  async create(dto: CreateRequestDto, actor: AuditActor): Promise<RequestDto> {
    const record = await this.requests.create(
      {
        employeeId: dto.employeeId,
        kind: dto.kind,
        payload: dto.payload,
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      { userId: actor.userId, employeeId: actor.employeeId },
    );
    return toDto(record);
  }

  /**
   * تعديل بيانات وصفية على مسوّد، بقفل تفاؤلي.
   *
   * `stale` ⇒ 409 `VERSION_CONFLICT` (Phase 17) بلا أي كتابة؛
   * `notFound` ⇒ 404 — ويشمل «الطلب ليس مسوّداً» لأن شرط `draft` داخل
   * `WHERE`، فلا يُكشف عن حالة طلبٍ مخفي ولا يُكتب عليه.
   */
  async update(
    id: string,
    dto: UpdateRequestDto,
    scope: RequestScopeFilter,
  ): Promise<RequestDto> {
    const outcome = await this.requests.update(
      id,
      {
        ...(dto.payload !== undefined && { payload: dto.payload }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      dto.expectedVersion,
      scope,
    );
    return toDto(this.assertWritten(outcome, id, dto.expectedVersion));
  }

  /**
   * تنفيذ عملية Workflow واحدة (submit · approve · reject ·
   * request_clarification · employee_reply · cancel).
   *
   * الترتيب مقصود:
   * 1) قراءة الطلب ضمن النطاق (يغيب خارج النطاق ⇒ 404 لا 403، §12).
   * 2) `assertTransitionAllowed` على **الحالة المقروءة** ⇒ 409 إن كانت
   *    لا تقبل الإجراء. هذا قبل أي كتابة، فالطلب لا يتغيّر.
   * 3) `transition` بالقفل التفاؤلي ⇒ 409 `VERSION_CONFLICT` إن تغيّر
   *    الطلب بين القراءة والكتابة (ولا نجاح صامت).
   */
  async workflow(
    id: string,
    body: RequestWorkflowBody,
    scope: RequestScopeFilter,
    actor: AuditActor,
  ): Promise<{ request: RequestDto; previousStatus: RequestStatus }> {
    const current = await this.requireVisible(id, scope);
    assertTransitionAllowed(body.action, current.status);

    const input: RequestTransitionInput = {
      action: body.action,
      expectedVersion: body.expectedVersion,
      ...(body.comment !== undefined && { comment: body.comment }),
      ...(body.response !== undefined && { response: body.response }),
      actorUserId: actor.userId,
      actorEmployeeId: actor.employeeId,
    };
    const outcome = await this.requests.transition(id, input, scope);
    return {
      request: toDto(this.assertWritten(outcome, id, body.expectedVersion, body.action)),
      // الحالة المقروءة قبل الكتابة: هي نفسها التي كتب بها المستودع
      // صفّ التاريخ، فيتطابق حدث التدقيق مع السجل (§31 old/new).
      previousStatus: current.status,
    };
  }

  /** يقرأ الطلب ضمن النطاق أو يرمي 404 (لا 403: لا كشف وجود). */
  private async requireVisible(
    id: string,
    scope: RequestScopeFilter,
  ): Promise<RequestRecord> {
    const record = await this.requests.findById(id, scope);
    if (record === null) {
      throw new ResourceNotFoundError('request', id, ARABIC_REQUEST);
    }
    return record;
  }

  /**
   * ترجمة نتيجة كتابة مقيدة إلى سجل أو خطأ — موضع واحد لكل الكتابات.
   *
   * `stale` ⇒ 409 `VERSION_CONFLICT` مع النسختين في `details` (Phase 17).
   * `notAllowed` ⇒ نفس `RequestTransitionError` الذي ترميه الخدمة قبل
   *   الاستدعاء — المستودع يفحص الحالة أيضاً داخل المعاملة، فالنتيجة
   *   واحدة مهما كان مسار الوصول.
   * `notFound` ⇒ 404 (نفس `ResourceNotFoundError`)، فلا يُميَّز بين
   * «غير موجود» و«غير مرئي» ولا بين «ليس مسوّداً» (Phase 16/17).
   */
  private assertWritten(
    outcome: RequestWriteOutcome,
    id: string,
    expectedVersion: number,
    action?: Exclude<RequestWorkflowAction, 'create'>,
  ): RequestRecord {
    if (outcome.outcome === 'updated') {
      return outcome.record;
    }
    if (outcome.outcome === 'stale') {
      throw new VersionConflictError(
        'request',
        id,
        ARABIC_REQUEST,
        expectedVersion,
        outcome.currentVersion,
      );
    }
    if (outcome.outcome === 'notAllowed' && action !== undefined) {
      throw new RequestTransitionError(
        action,
        outcome.currentStatus,
        REQUEST_TRANSITIONS[action],
      );
    }
    throw new ResourceNotFoundError('request', id, ARABIC_REQUEST);
  }
}