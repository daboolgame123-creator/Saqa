/**
 * خدمة سجل الاطلاع الرسمي في طبقة الـAPI (Phase 15 — §9.1/§9.2).
 *
 * مسؤولية واحدة: ختم «اطلعت» صراحةً idempotent، بعد التحقق أن الكتاب
 * **مرئٍ للفاعل** ضمن `TransactionScopeFilter` (نفس قاعدة 404 حجب
 * الوجود في القراءة العادية — §12): من لا يرى الكتاب لا يقرّه.
 *
 * الفاعل يأتي من هوية الجلسة (`AuthenticatedIdentity`) لا من جسم الطلب —
 * فلا يملك العميل أن يعلن `employeeId` أو `userId` غيره.
 *
 * لا يكتب هذا مسارات فتح الصفحة ولا التنزيل: فتح الكتاب قراءة عادية،
 * والتنزيل حدث وصول حساس في `audit_logs` — الاثنان ليسا اطلاعياً.
 */
import { Pool } from 'pg';
import { withTransaction, type Queryable } from '../../database';
import { acknowledgeView, type ViewLogRecord } from '../../audit';
import type { TransactionRepository, TransactionScopeFilter } from '../../repositories/contracts';
import { PgTransactionRepository } from '../../repositories/transactionRepository';
import { transactionScopeCondition } from '../../repositories/transactionScopeSql';
import { ResourceNotFoundError } from '../errors';
import { toAcknowledgementDto, type AcknowledgementDto } from '../dto/audit';

const ARABIC_TRANSACTION = 'الكتاب';

/** الفاعل كما يُقرأ من الجلسة — لا من العميل. */
export interface AcknowledgementActor {
  userId: string;
  employeeId: string | null;
  sessionId: string;
}

export class ViewLogApiService {
  constructor(
    private readonly db: Queryable,
    private readonly transactions: TransactionRepository,
  ) {}

  /**
   * يختم الاطلاع الرسمي لكتاب مرئٍ للفاعل.
   *
   * التكرار لنفس الفاعل والكتاب لا ينشئ حالة جديدة: القيد الفريد في
   * القاعدة و`ON CONFLICT` يبقيان الختم الأول كما هو (§31: duplicate
   * acknowledgement لا يُنتج حالة رسمية مكررة).
   */
  async acknowledge(
    transactionId: string,
    actor: AcknowledgementActor,
    scope?: TransactionScopeFilter,
  ): Promise<AcknowledgementDto> {
    // The authorized read and acknowledgement INSERT must share one PostgreSQL
    // connection and transaction. Otherwise an archive/visibility change can
    // commit between findById() and INSERT, recording a false formal «اطلعت».
    if (this.db instanceof Pool) {
      return withTransaction(this.db, async (client) =>
        new ViewLogApiService(client, new PgTransactionRepository(client))
          .acknowledge(transactionId, actor, scope),
      );
    }

    const visible = await this.transactions.findById(transactionId, scope);
    if (visible === null) {
      throw new ResourceNotFoundError('transaction', transactionId, ARABIC_TRANSACTION);
    }
    // UI-06 / §9.1: only incoming books publicly circulated to employees
    // are eligible. This matches transactionController's new_broadcast test.
    if (visible.direction !== 'وارد' || visible.visibility !== 'PublicToEmployees') {
      throw new ResourceNotFoundError('transaction', transactionId, ARABIC_TRANSACTION);
    }
    // Recheck the same scope and state UNDER a row lock, held until the
    // surrounding transaction commits. A concurrent archive or visibility
    // UPDATE must wait rather than invalidate the successful acknowledgement.
    const params: unknown[] = [transactionId];
    let sql = `SELECT t.id FROM transactions t
      WHERE t.id = $1 AND t.deleted_at IS NULL
        AND t.direction = 'وارد'
        AND (t.visibility #>> '{}') = 'PublicToEmployees'`;
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 't', params)}`;
    }
    sql += ' FOR SHARE OF t';
    const eligible = await this.db.query<{ id: string }>(sql, params);
    if (eligible.rows.length === 0) {
      throw new ResourceNotFoundError('transaction', transactionId, ARABIC_TRANSACTION);
    }
    const record: ViewLogRecord = await acknowledgeView(this.db, {
      transactionId,
      userId: actor.userId,
      employeeId: actor.employeeId,
      sessionRef: actor.sessionId,
    });
    return toAcknowledgementDto(record);
  }
}
