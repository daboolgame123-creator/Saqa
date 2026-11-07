/**
 * Pilot transaction actions: explicit server-side status transitions and
 * soft archive. No locally invented success, actor or delete timestamp.
 *
 * The server enforces RBAC and expectedVersion within a single SQL write.
 */
import type { Transaction } from '../core/models';
import { toTransaction, type TransactionDto } from './mappers';
import { getApiClient, type ApiClient } from './apiClient';

function checkTarget(id: string, expectedVersion: number): string {
  if (id.trim() === '' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Transaction ID and a positive expectedVersion are required');
  }
  return encodeURIComponent(id);
}

/** Explicit status transition: persisted row and new version come from API. */
export async function transitionPilotTransactionStatus(
  id: string,
  status: Transaction['status'],
  expectedVersion: number,
  client: ApiClient = getApiClient(),
): Promise<Transaction> {
  const segment = checkTarget(id, expectedVersion);
  if (status !== 'قيد المراجعة' && status !== 'مكتمل') {
    throw new Error('Invalid transaction status');
  }
  const row: TransactionDto = await client.post<TransactionDto>(
    `/transactions/${segment}/status`, {status, expectedVersion},
  );
  if (!row || row.id !== id || row.status !== status ||
      !Number.isSafeInteger(row.version) || row.version <= expectedVersion) {
    throw new Error('Unverified transaction status response');
  }
  return toTransaction(row);
}

/**
 * DELETE on this backend is SOFT ARCHIVE, not data destruction.
 * A successful HTTP response is required before removing the record from
 * the visible active list. No identity or archive timestamps are supplied.
 */
export async function archivePilotTransaction(
  id: string,
  expectedVersion: number,
  client: ApiClient = getApiClient(),
): Promise<void> {
  const segment = checkTarget(id, expectedVersion);
  await client.remove(`/transactions/${segment}?expectedVersion=${expectedVersion}`);
}
