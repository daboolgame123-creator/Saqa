/**
 * مستودع ارتباط الكتب (Phase 20 — §36 «Related Books»).
 *
 * العلاقة **موجّهة** ومحفوظة كمفتاحين أجنبيين حقيقيين على `transactions`:
 * «كتاب A يشير إلى كتاب B» صفٌّ من A إلى B. لا نص رابط ولا JSON بديل
 * ولا اسم كتاب (القاعدة 7: المعرّف هو أساس كل علاقة)، والعلاقة تخدم
 * one-to-many وmany-to-many معاً لأن الاتجاه محفوظ في اتجاه الصف.
 *
 * **قاعدة النطاق على الطرفين** (Phase 13، وتطبيقاً لقاعدة «Related Books»
 * لا تفتح تجاوزاً لنطاق الرؤية): الاستعلام يربط `transactions` مرتين
 * (الطرفان) ويفرض قيد النطاق **على كلٍّ منهما**. النتيجة: كتاب A مرئي
 * وB محجوب ⇒ لا يُعاد صفّ الارتباط أصلاً، فلا تُسرَب بيانات B عبر
 * العلاقة. التقييد في الاستعلام لا بعد القراءة ولا في الواجهة.
 *
 * **الطرفان غير المؤرشف**: كما في `transactionEmployeeRepository`
 * (Phase 16)، ارتباط كتاب مؤرشف لا يظهر في القوائم النشطة.
 *
 * لا حذف للكتب هنا: `remove` يحذف **سطر الارتباط فقط**، والكتابان
 * يبقيان بتاريخهما وبمعرّفيهما (§32).
 */
import type {
  CreateTransactionRelationInput,
  RelationWriteOutcome,
  TransactionRelationRecord,
  TransactionRelationRepository,
  TransactionScopeFilter,
} from './contracts';
import type { Db } from './shared';
import { transactionScopeCondition } from './transactionScopeSql';

const RELATION_COLUMNS = `
  r.id, r.transaction_id AS "transactionId",
  r.related_transaction_id AS "relatedTransactionId",
  r.created_by AS "createdBy", r.created_at AS "createdAt"
`;

/**
 * استعلام قراءة واحد يخدم الاتجاهين.
 *
 * `joinColumn` هو طرف هذا الكتاب داخل الصف: `r.transaction_id` لقراءة
 * «ما أشير إليه»، و`r.related_transaction_id` لقراءة «ما يشير إليّ».
 * القيد يُطبَّق على aliasين منفصلين (`src` و`dst`) لأن
 * `transactionScopeCondition` يبني شرطه على اسم الجدول المؤهَّل.
 */
function relationSelectSql(joinColumn: 'r.transaction_id' | 'r.related_transaction_id'): string {
  return (
    `SELECT ${RELATION_COLUMNS}
       FROM transaction_relations r
       JOIN transactions src ON src.id = r.transaction_id
       JOIN transactions dst ON dst.id = r.related_transaction_id
      WHERE ${joinColumn} = $1
        AND src.deleted_at IS NULL
        AND dst.deleted_at IS NULL`
  );
}

function toRecord(row: TransactionRelationRecord): TransactionRelationRecord {
  return {
    id: row.id,
    transactionId: row.transactionId,
    relatedTransactionId: row.relatedTransactionId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** تنفيذ جدول ارتباط الكتب. */
export class PgTransactionRelationRepository implements TransactionRelationRepository {
  constructor(private readonly db: Db) {}

  async listOutgoing(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionRelationRecord[]> {
    const params: unknown[] = [transactionId];
    let sql = relationSelectSql('r.transaction_id');
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 'src', params)}`;
      sql += ` AND ${transactionScopeCondition(scope, 'dst', params)}`;
    }
    sql += ' ORDER BY r.created_at, r.id';
    const result = await this.db.query<TransactionRelationRecord>(sql, params);
    return result.rows.map(toRecord);
  }

  async listIncoming(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionRelationRecord[]> {
    const params: unknown[] = [transactionId];
    let sql = relationSelectSql('r.related_transaction_id');
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 'src', params)}`;
      sql += ` AND ${transactionScopeCondition(scope, 'dst', params)}`;
    }
    sql += ' ORDER BY r.created_at, r.id';
    const result = await this.db.query<TransactionRelationRecord>(sql, params);
    return result.rows.map(toRecord);
  }

  /**
   * إنشاء ارتباط A → B.
   *
   * ثلاث نتائج مميّزة يقابل كلٌّ منها قيداً في القاعدة (0013):
   * - `selfReference`: `CHECK (transaction_id <> related_transaction_id)`
   *   ⇒ لا يُكتب أصلاً (كتاب لا يشير إلى نفسه).
   * - `duplicate`: `UNIQUE (transaction_id, related_transaction_id)` مع
   *   `ON CONFLICT DO NOTHING` ⇒ إعادة إرسال الطلب لا تُنشئ علاقتين.
   * - `created`: الصف الجديد بمعرّفه الحقيقي.
   *
   * `FK` على الطرفين يمنع طرفاً مجهولاً؛ وطبقة الخدمة تتحقق من وجود
   * الكتابين أولاً فتحوّل ذلك إلى `404` المتّفق عليه في بقية المسارات
   * (نفس نهج `availabilityService.requireTransaction`).
   */
  async add(input: CreateTransactionRelationInput): Promise<RelationWriteOutcome> {
    if (input.transactionId === input.relatedTransactionId) {
      return { outcome: 'selfReference' };
    }
    const result = await this.db.query<TransactionRelationRecord>(
      `INSERT INTO transaction_relations
         (transaction_id, related_transaction_id, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (transaction_id, related_transaction_id) DO NOTHING
       RETURNING id, transaction_id AS "transactionId",
                 related_transaction_id AS "relatedTransactionId",
                 created_by AS "createdBy", created_at AS "createdAt"`,
      [input.transactionId, input.relatedTransactionId, input.createdBy ?? null],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return { outcome: 'duplicate' };
    }
    return { outcome: 'created', record: toRecord(row) };
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM transaction_relations WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}