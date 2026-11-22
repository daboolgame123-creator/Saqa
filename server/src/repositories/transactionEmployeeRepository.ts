/**
 * مستودع روابط الكتاب بالمنتسبين (Phase 9 — BR-05).
 * جدول وحده؛ يُحذف الرابط فقط لا طرفاه (CASCADE في الـschema عند حذف الطرف).
 *
 * Phase 16: الروابط تتبع حالة كتابها — كتاب مؤرشف لا تعيده قائمة
 * الروابط النشطة، تماماً كإخفاء visibility. أما الصف نفسه فلا يُحذف
 * (قيد RESTRICT منذ الترحيل 0009) ولا يختفي من القاعدة.
 */
import type {
  CreateTransactionEmployeeLink,
  TransactionEmployeeRepository,
  TransactionScopeFilter,
} from './contracts';
import { nullToUndefined, type Db } from './shared';
import { transactionScopeCondition } from './transactionScopeSql';
import type { TransactionEmployee } from '../../../src/core/models/transactionEmployee';

/** The link exists historically, but its archived book is no longer writable. */
export class InactiveLinkTransactionError extends Error {
  constructor(readonly transactionId: string) {
    super('Transaction does not exist or is archived');
    this.name = 'InactiveLinkTransactionError';
  }
}

const LINK_COLUMNS = `
  id, transaction_id AS "transactionId", employee_id AS "employeeId",
  relationship_type AS "relationshipType", notes,
  created_at AS "createdAt"
`;

/**
 * الأعمدة نفسها مؤهَّلة بـalias الجدول (Phase 13): القراءة المقيَّدة
 * بالنطاق تربط `transactions`، فلا بد من تأهيل الأعمدة في الاستعلام.
 */
const SCOPED_LINK_COLUMNS = `
  l.id, l.transaction_id AS "transactionId", l.employee_id AS "employeeId",
  l.relationship_type AS "relationshipType", l.notes,
  l.created_at AS "createdAt"
`;


interface LinkRow {
  id: string;
  transactionId: string;
  employeeId: string;
  relationshipType: string | null;
  notes: string | null;
  createdAt: string;
}

function toLink(row: LinkRow): TransactionEmployee {
  return {
    id: row.id,
    transactionId: row.transactionId,
    employeeId: row.employeeId,
    relationshipType: nullToUndefined(
      row.relationshipType as TransactionEmployee['relationshipType'],
    ),
    notes: nullToUndefined(row.notes),
    createdAt: row.createdAt,
  };
}

/** تنفيذ جدول روابط الكتاب-منتسب. */
export class PgTransactionEmployeeRepository implements TransactionEmployeeRepository {
  constructor(private readonly db: Db) {}

  /**
   * روابط كتاب واحد.
   *
   * عند تمرير `scope` يُشترط أن يكون الكتاب مرئياً للفاعل في الاستعلام
   * نفسه (`JOIN transactions` + قيد النطاق) — فالرابط يتبع رؤية كتابه،
   * ولا يكفي أن يُطلب بمعرّفه.
   */
  async listByTransaction(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionEmployee[]> {
    const params: unknown[] = [transactionId];
    // Phase 16: `JOIN` لا شرطاً للنطاق وحده — بلا نطاق (مسؤول/مشرف
    // بلا قيد) يجب أن يخفي روابط كتاب مؤرشف أيضاً. فالحالة شرط دائم.
    let sql = `SELECT ${SCOPED_LINK_COLUMNS} FROM transaction_employees l
               JOIN transactions t ON t.id = l.transaction_id`;
    sql += ' WHERE l.transaction_id = $1 AND t.deleted_at IS NULL';
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 't', params)}`;
    }
    sql += ' ORDER BY l.created_at, l.id';
    const result = await this.db.query<LinkRow>(sql, params);
    return result.rows.map(toLink);
  }

  /** روابط منتسب واحد، مقيدة بنفس نطاق رؤية الكتب. */
  async listByEmployee(
    employeeId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionEmployee[]> {
    const params: unknown[] = [employeeId];
    // Phase 16: نفس قاعدة `listByTransaction` — المؤرشف مستبعد دائماً.
    let sql = `SELECT ${SCOPED_LINK_COLUMNS} FROM transaction_employees l
               JOIN transactions t ON t.id = l.transaction_id`;
    sql += ' WHERE l.employee_id = $1 AND t.deleted_at IS NULL';
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 't', params)}`;
    }
    sql += ' ORDER BY l.created_at, l.id';
    const result = await this.db.query<LinkRow>(sql, params);
    return result.rows.map(toLink);
  }


  async add(input: CreateTransactionEmployeeLink): Promise<TransactionEmployee> {
    const result = await this.db.query<LinkRow>(
      `WITH active_book AS (
         SELECT id FROM transactions WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
       )
       INSERT INTO transaction_employees (transaction_id, employee_id, relationship_type, notes)
       SELECT id, $2, $3, $4 FROM active_book
       RETURNING ${LINK_COLUMNS}`,
      [
        input.transactionId,
        input.employeeId,
        input.relationshipType ?? null,
        input.notes ?? null,
      ],
    );
    if (result.rows.length === 0) throw new InactiveLinkTransactionError(input.transactionId);
    return toLink(result.rows[0]);
  }

  async update(
    id: string,
    patch: { relationshipType?: string; notes?: string },
  ): Promise<TransactionEmployee | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.relationshipType !== undefined) {
      params.push(patch.relationshipType);
      sets.push(`relationship_type = $${params.length}`);
    }
    if (patch.notes !== undefined) {
      params.push(patch.notes);
      sets.push(`notes = $${params.length}`);
    }
    if (sets.length === 0) {
      const current = await this.db.query<LinkRow>(
        `SELECT ${SCOPED_LINK_COLUMNS}
           FROM transaction_employees l
           JOIN transactions t ON t.id = l.transaction_id
          WHERE l.id = $1 AND t.deleted_at IS NULL`,
        [id],
      );
      return current.rows.length > 0 ? toLink(current.rows[0]) : null;
    }
    params.push(id);
    const result = await this.db.query<LinkRow>(
      `WITH active_book AS (
         SELECT t.id FROM transactions t
         JOIN transaction_employees existing ON existing.transaction_id = t.id
         WHERE existing.id = ${params.length} AND t.deleted_at IS NULL
         FOR UPDATE OF t
       )
       UPDATE transaction_employees l SET ${sets.join(', ')}
       FROM active_book b
       WHERE l.id = ${params.length} AND l.transaction_id = b.id
       RETURNING ${SCOPED_LINK_COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toLink(result.rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query(
      `WITH active_book AS (
         SELECT t.id FROM transactions t
         JOIN transaction_employees existing ON existing.transaction_id = t.id
         WHERE existing.id = $1 AND t.deleted_at IS NULL
         FOR UPDATE OF t
       )
       DELETE FROM transaction_employees l USING active_book b
       WHERE l.id = $1 AND l.transaction_id = b.id`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
