/**
 * خدمة ارتباط الكتب في طبقة الـAPI (Phase 20 — §36 «Related Books»).
 *
 * ثلاث عمليات فقط، وهي ما تطلبه الخطة:
 * - `list` — كتاب A مع ما يشير إليه وما يشير إليه.
 * - `create` — «كتاب A يشير إلى كتاب B».
 * - `remove` — إزالة **سطر** العلاقة فقط، لا كتاب ولا طرف (§32).
 *
 * **النطاق موروث ولا يُخفَّف** (Phase 13): `scope` يُمرَّر إلى
 * المستودع الذي يطبّقه على **الطرفين**، فكتاب B محجوب لا يظهر اسمُه
 * ولا معرّفه. والخلاصة: قراءة ارتباط كتاب مرئي لا تفتح كتاباً محجوباً.
 *
 * **لا تغيير حالة للكتاب ولا rewrite لغيره**: إضافة علاقة لا تمسّ صفّ
 * الكتاب (`version` لا يتغيّر) لأن `version` يخصّ تعديل **بيانات
 * الكتاب نفسه**؛ علاقة كتاب جديدة ليست تعديلاً لحقل من حقوله، وإلا
 * لكان كل ارتباطٍ جديد سبب تعارضٍ كاذب مع قارئٍ لم يغيّر شيئاً.
 * أما **انتقال الحالة** فهو تعديل حقل `status` حقيقي، فيحمل القفل
 * كاملاً (انظر `TransactionApiService.transitionStatus`).
 *
 * **الفاعل** في `createdBy` من هوية الجلسة على الخادم لا من جسم الطلب
 * (§31 + القاعدة 7).
 */
import { AppError } from '../../errors';
import type {
  TransactionRelationRepository,
  TransactionRepository,
  TransactionScopeFilter,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import { toTransactionRelationDto } from '../dto/relationMappers';
import type {
  CreateTransactionRelationDto,
  TransactionRelationDto,
  TransactionRelationsDto,
} from '../dto';

const ARABIC_TRANSACTION = 'الكتاب';
const ARABIC_RELATION = 'ارتباط الكتاب';

/**
 * الكتاب يشير إلى نفسه — 400 `SELF_RELATION_NOT_ALLOWED`.
 *
 * `400` لا `409`: الجسم **صالح شكلاً** (معرّف كتاب موجود)، لكن الطلب
 * نفسه غير معقول في القاعدة (كتاب لا يشير إلى نفسه). وهو مقيَّد في
 * `transaction_relations` بـ`CHECK` منذ الترحيل 0013 — فهنا خطأ
 * مفهوم قبل أن يصل إلى القاعدة، لا 500 لانتهاك قيد.
 */
class SelfRelationError extends AppError {
  constructor() {
    super(
      'لا يمكن أن يشير الكتاب إلى نفسه — «الكتاب المشار إليه» كتاب آخر.',
      400,
      'SELF_RELATION_NOT_ALLOWED',
    );
  }
}

/**
 * نفس الاتجاه موجود فعلاً — 409 `RELATION_ALREADY_EXISTS`.
 *
 * `409` لأن الطلب سليم والسجل قائم (قيد `UNIQUE` في 0013). وهو سلوك
 * صريح لا صمت: إعادة إرسال الطلب لا تُنشئ علاقتين ولا تُرجع `201`
 * كاذباً بصفّ واحد.
 */
class DuplicateRelationError extends AppError {
  constructor() {
    super(
      'ارتباط بهذا الاتجاه موجود مسبقاً بين الكتابين.',
      409,
      'RELATION_ALREADY_EXISTS',
    );
  }
}

export class TransactionRelationApiService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly relations: TransactionRelationRepository,
  ) {}

  /**
   * الكتب المرتبطة بكتاب: الاتجاهان كما هما في القاعدة.
   *
   * الكتاب نفسه يجب أن يكون مرئياً للمتعامل؛ الفحص يمرّ عبر
   * `findById(id, scope)` فيصير كتاب غير مرئي `404` (حجب وجود Phase 13)
   * تماماً كقراءة الكتاب العادية.
   */
  async list(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionRelationsDto> {
    await this.requireVisible(transactionId, scope);
    const [outgoing, incoming] = await Promise.all([
      this.relations.listOutgoing(transactionId, scope),
      this.relations.listIncoming(transactionId, scope),
    ]);
    return {
      outgoing: outgoing.map(toTransactionRelationDto),
      incoming: incoming.map(toTransactionRelationDto),
    };
  }

  /**
   * «كتاب A يشير إلى كتاب B» — إنشاء سطر ارتباط.
   *
   * ترتيب الفحوص مقصود:
   * 1. الكتابان موجودان ونشطان ⇒ غير ذلك `404` (الـFK حارس أخير).
   * 2. الطرفان ليس واحداً ⇒ `400` (كتاب لا يشير إلى نفسه).
   * 3. نفس الاتجاه غير موجود ⇒ قيد `UNIQUE` في القاعدة؛ التكرار يُقرأ
   *    `duplicate` لا يُنشئ علاقتين ولا يُصمت كنجاح كاذب.
   */
  async create(
    transactionId: string,
    dto: CreateTransactionRelationDto,
    actorUserId: string | null,
  ): Promise<TransactionRelationDto> {
    await this.requireVisible(transactionId);
    await this.requireVisible(dto.relatedTransactionId);
    const outcome = await this.relations.add({
      transactionId,
      relatedTransactionId: dto.relatedTransactionId,
      createdBy: actorUserId,
    });
    if (outcome.outcome === 'selfReference') {
      throw new SelfRelationError();
    }
    if (outcome.outcome === 'duplicate') {
      throw new DuplicateRelationError();
    }
    return toTransactionRelationDto(outcome.record);
  }

  /**
   * إزالة سطر الارتباط فقط — الكتابان يبقيان بتاريخهما ومعرّفيهما.
   *
   * إزالة علاقة **ليست** أرشفة كتاب ولا حذفاً له (§32): لا صفّ كتاب
   * يُمسّ هنا ولا طابع `deleted_at` يُكتب. لكنّها كتابة إدارية حسّاسة
   * (كيان Archive Domain) فيُسجَّل لها حدث تدقيق `update` من النوع
   * المعتمد، لا نوع جديد.
   */
  async remove(id: string): Promise<{ id: string }> {
    const removed = await this.relations.remove(id);
    if (!removed) {
      throw new ResourceNotFoundError('transactionRelation', id, ARABIC_RELATION);
    }
    return { id };
  }

  /** كتاب مرئي (أو 404). النطاق يُطبَّق هنا عند القارئ المقيد. */
  private async requireVisible(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<void> {
    const found = await this.transactions.findById(transactionId, scope);
    if (found === null) {
      throw new ResourceNotFoundError('transaction', transactionId, ARABIC_TRANSACTION);
    }
  }
}
