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
  const response = await client.remove<TransactionDto>(
    `/transactions/${segment}?expectedVersion=${expectedVersion}`,
  );
  // A 2xx status alone does not prove that the intended record was archived.
  // The backend returns the same row, new version and server-owned deletion
  // timestamp; reject incomplete/mismatched replies instead of hiding a book.
  if (!response || response.id !== id ||
      !Number.isSafeInteger(response.version) ||
      response.version !== expectedVersion + 1 ||
      typeof response.deletedAt !== 'string' ||
      response.deletedAt.trim().length === 0 ||
      !Number.isFinite(Date.parse(response.deletedAt))) {
    throw new Error('Unverified transaction archive response');
  }
}


/**
 * Admin-only official directive. The backend owns transaction authorization,
 * optimistic version lock and auditing; the UI never treats a local edit as
 * confirmation. Directive date is a supplied annotation, not an audit stamp.
 */
export async function savePilotTransactionDirective(
  id: string,
  text: string,
  actionRequired: boolean,
  expectedVersion: number,
  client: ApiClient = getApiClient(),
): Promise<Transaction> {
  const segment = checkTarget(id, expectedVersion);
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 2000 || typeof actionRequired !== 'boolean') {
    throw new Error('Invalid director directive');
  }
  const directive = {text: trimmed, date: new Date().toISOString(), actionRequired};
  const row = await client.patch<TransactionDto>(
    `/transactions/${segment}`, {directorDirective: directive, expectedVersion},
  );
  if (!row || row.id !== id || !Number.isSafeInteger(row.version) ||
      row.version <= expectedVersion || !row.directorDirective ||
      row.directorDirective.text !== directive.text ||
      row.directorDirective.date !== directive.date ||
      row.directorDirective.actionRequired !== directive.actionRequired) {
    throw new Error('Unverified directive persistence response');
  }
  return toTransaction(row);
}
