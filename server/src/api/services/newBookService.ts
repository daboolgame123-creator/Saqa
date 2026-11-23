/**
 * A small per-account "جديد" marker, independent of notifications and
 * explicit official acknowledgement (view_logs).
 *
 * - Read only live books created within the last seven days, never imports.
 * - Apply the identical transactionScopeCondition used by book reads in SQL.
 * - Persist the first open for the authenticated user only.
 * - Do not emit notifications or change transaction versions/Audit/ViewLogs.
 */
import { withTransaction } from '../../database/pool';
import { ResourceNotFoundError } from '../errors';
import type { TransactionScopeFilter } from '../../repositories/contracts';
import { isPool, type Db } from '../../repositories/shared';
import { transactionScopeCondition } from '../../repositories/transactionScopeSql';

export class NewBookApiService {
  constructor(private readonly db: Db) {}

  async listNewIds(userId: string, scope?: TransactionScopeFilter): Promise<string[]> {
    const params: unknown[] = [userId];
    let sql = `SELECT t.id FROM transactions t
      WHERE t.deleted_at IS NULL
        AND t.imported_at IS NULL
        AND t.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM transaction_opened opened
          WHERE opened.user_id = $1 AND opened.transaction_id = t.id
        )`;
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 't', params)}`;
    }
    sql += ' ORDER BY t.created_at DESC, t.id DESC';
    const result = await this.db.query<{ id: string }>(sql, params);
    return result.rows.map((row) => row.id);
  }

  async markOpened(
    transactionId: string,
    userId: string,
    scope?: TransactionScopeFilter,
  ): Promise<void> {
    if (isPool(this.db)) {
      return withTransaction(this.db, async (client) =>
        new NewBookApiService(client).markOpened(transactionId, userId, scope),
      );
    }

    const params: unknown[] = [transactionId];
    let sql = `SELECT t.id FROM transactions t
      WHERE t.id = $1 AND t.deleted_at IS NULL`;
    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 't', params)}`;
    }
    // Hold the book's shared lock through the insert: a concurrent archive or
    // visibility change cannot commit between this check and the mark.
    sql += ' FOR SHARE OF t';
    const visible = await this.db.query<{ id: string }>(sql, params);
    if (visible.rows.length === 0) {
      throw new ResourceNotFoundError('transaction', transactionId, 'الكتاب');
    }
    await this.db.query(
      `INSERT INTO transaction_opened (user_id, transaction_id)
       VALUES ($1, $2) ON CONFLICT (user_id, transaction_id) DO NOTHING`,
      [userId, transactionId],
    );
  }
}
