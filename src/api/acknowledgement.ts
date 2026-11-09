/**
 * Phase 23 pilot: explicit, official «اطلعت» acknowledgement.
 *
 * Reading, previewing or marking a transaction as locally read is NOT
 * an acknowledgement. The backend writes the immutable ViewLog against the
 * authenticated session and checks Access Scope. No user/employee identity
 * is sent in the POST body.
 */
import { getApiClient, type ApiClient } from './apiClient';

export interface OfficialAcknowledgement {
  id: string;
  transactionId: string;
  userId: string | null;
  employeeId: string | null;
  viewedAt: string;
  acknowledgedAt: string | null;
}

export async function acknowledgeTransactionOfficial(
  transactionId: string,
  authenticatedUserId: string,
  client: ApiClient = getApiClient(),
): Promise<string> {
  if (transactionId.trim() === '' || authenticatedUserId.trim() === '') {
    throw new Error('Missing authenticated identity or transaction');
  }
  // Deliberately no body. Backend derives actor only from Bearer session.
  const result: unknown = await client.post<unknown>(
    `/transactions/${encodeURIComponent(transactionId)}/acknowledge`,
    undefined,
  );
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid acknowledgement result');
  }
  const ack = result as Partial<OfficialAcknowledgement>;
  if (typeof ack.id !== 'string' || ack.id.length === 0 ||
      ack.transactionId !== transactionId ||
      ack.userId !== authenticatedUserId ||
      typeof ack.acknowledgedAt !== 'string' ||
      ack.acknowledgedAt.trim() === '') {
    // Never claim official success if the identity, book or stamp differs.
    throw new Error('Invalid acknowledgement confirmation');
  }
  return ack.acknowledgedAt;
}
