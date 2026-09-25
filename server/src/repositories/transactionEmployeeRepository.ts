/**
 * مستودع روابط الكتاب بالمنتسبين (Phase 9 — BR-05).
 * جدول وحده؛ يُحذف الرابط فقط لا طرفاه (CASCADE في الـschema عند حذف الطرف).
 */
import type {
  CreateTransactionEmployeeLink,
  TransactionEmployeeRepository,
} from './contracts';
import { nullToUndefined, type Db } from './shared';
import type { TransactionEmployee } from '../../../src/core/models/transactionEmployee';

const LINK_COLUMNS = `
  id, transaction_id AS "transactionId", employee_id AS "employeeId",
  relationship_type AS "relationshipType", notes,
  created_at AS "createdAt"
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

  async listByTransaction(transactionId: string): Promise<TransactionEmployee[]> {
    const result = await this.db.query<LinkRow>(
      `SELECT ${LINK_COLUMNS} FROM transaction_employees
       WHERE transaction_id = $1 ORDER BY created_at, id`,
      [transactionId],
    );
    return result.rows.map(toLink);
  }

  async listByEmployee(employeeId: string): Promise<TransactionEmployee[]> {
    const result = await this.db.query<LinkRow>(
      `SELECT ${LINK_COLUMNS} FROM transaction_employees
       WHERE employee_id = $1 ORDER BY created_at, id`,
      [employeeId],
    );
    return result.rows.map(toLink);
  }

  async add(input: CreateTransactionEmployeeLink): Promise<TransactionEmployee> {
    const result = await this.db.query<LinkRow>(
      `INSERT INTO transaction_employees (transaction_id, employee_id, relationship_type, notes)
       VALUES ($1, $2, $3, $4) RETURNING ${LINK_COLUMNS}`,
      [
        input.transactionId,
        input.employeeId,
        input.relationshipType ?? null,
        input.notes ?? null,
      ],
    );
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
        `SELECT ${LINK_COLUMNS} FROM transaction_employees WHERE id = $1`,
        [id],
      );
      return current.rows.length > 0 ? toLink(current.rows[0]) : null;
    }
    params.push(id);
    const result = await this.db.query<LinkRow>(
      `UPDATE transaction_employees SET ${sets.join(', ')}
       WHERE id = $${params.length} RETURNING ${LINK_COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toLink(result.rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM transaction_employees WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
