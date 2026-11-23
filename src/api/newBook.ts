/** Display-only new-book markers (separate from formal acknowledgements). */
import { getApiClient, type ApiClient } from './apiClient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listNewBookIds(client: ApiClient = getApiClient()): Promise<string[]> {
  const ids: unknown = await client.get('/transactions/new-ids');
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    throw new Error('INVALID_NEW_BOOK_IDS');
  }
  return ids;
}

export async function markBookOpened(
  transactionId: string,
  client: ApiClient = getApiClient(),
): Promise<void> {
  if (!UUID.test(transactionId)) throw new Error('INVALID_BOOK_ID');
  // No actor or version is sent: backend uses authenticated session and view scope.
  const outcome: unknown = await client.post(
    `/transactions/${encodeURIComponent(transactionId)}/opened`, undefined,
  );
  if (outcome !== undefined) throw new Error('INVALID_OPENED_RESPONSE');
}
