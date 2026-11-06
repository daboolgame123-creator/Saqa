/** UI-10 legacy monthly preview: limit auxiliary relationship metadata to
 * transactions already admitted to the currently visible UI list.
 *
 * Presentation data minimization ONLY. Backend authorization is authoritative.
 */
import type { Transaction, TransactionEmployee } from '../../types';

export function scopedReportPreviewLinks(
  visibleTransactions: readonly Pick<Transaction, 'id'>[],
  relations: readonly TransactionEmployee[],
): TransactionEmployee[] {
  const visibleIds = new Set(visibleTransactions.map(transaction => transaction.id));
  return relations.filter(relation => visibleIds.has(relation.transactionId));
}
