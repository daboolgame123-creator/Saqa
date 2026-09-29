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
import type { Queryable } from '../../database';
import { acknowledgeView, type ViewLogRecord } from '../../audit';
import type { TransactionRepository, TransactionScopeFilter } from '../../repositories/contracts';
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
    const visible = await this.transactions.findById(transactionId, scope);
    if (visible === null) {
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
