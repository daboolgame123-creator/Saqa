/**
 * Shared confirmation gate for BOTH transaction detail open and attachment
 * preview. A button click alone is never proof that the authenticated account
 * successfully opened a book. This deliberately does not acknowledge a book.
 */
import { markBookOpened } from './newBook';

export async function confirmBookOpenedForSession(
  transactionId: string,
  isCurrentSession: () => boolean,
  onConfirmed: () => void,
  onDenied: () => void,
  markOpened: (id: string) => Promise<void> = markBookOpened,
): Promise<void> {
  try {
    await markOpened(transactionId);
    // A logout, account switch or 401 invalidation during the request must
    // not reveal an old book or clear a different account's NEW marker.
    if (isCurrentSession()) onConfirmed();
  } catch {
    if (isCurrentSession()) onDenied();
  }
}
