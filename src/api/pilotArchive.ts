/**
 * Phase 23 official admin archive: independent, read-only historical list and
 * explicit server-confirmed restore. No local delete/restore emulation.
 *
 * Backend authorization remains decisive: list is behind delete_archive and
 * restore is guarded by the same permission + versioned SQL update.
 */
import type { Transaction } from '../core/models';
import { getApiClient, type ApiClient } from './apiClient';
import { toTransaction, type TransactionDto } from './mappers';

type ArchivedDto = TransactionDto & {
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleteReason?: string | null;
};

export interface ArchivedPilotTransaction {
  id: string;
  number: string;
  sequence: string;
  subject: string;
  date: string;
  status: string;
  version: number;
  deletedAt: string;
  deleteReason: string | null;
}

function validVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version > 0;
}

export function validateArchivedPilotRow(row: ArchivedDto): ArchivedPilotTransaction {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      typeof row.id !== 'string' || row.id.trim() === '' ||
      typeof row.number !== 'string' || typeof row.sequence !== 'string' ||
      typeof row.subject !== 'string' || typeof row.date !== 'string' ||
      typeof row.status !== 'string' || !validVersion(row.version) ||
      typeof row.deletedAt !== 'string' || row.deletedAt.trim() === '' ||
      !Number.isFinite(Date.parse(row.deletedAt)) ||
      (row.deleteReason !== undefined && row.deleteReason !== null &&
       typeof row.deleteReason !== 'string')) {
    throw new Error('Unverified archived transaction returned by server');
  }
  return {
    id: row.id,
    number: row.number,
    sequence: row.sequence,
    subject: row.subject,
    date: row.date,
    status: row.status,
    version: row.version,
    deletedAt: row.deletedAt,
    deleteReason: row.deleteReason ?? null,
  };
}

/** A single bounded page; no arbitrary client-provided scope or actor. */
export async function listPilotArchivedTransactions(
  offset = 0,
  limit = 25,
  client: ApiClient = getApiClient(),
): Promise<ArchivedPilotTransaction[]> {
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid archive page');
  }
  const rows = await client.get<ArchivedDto[]>('/transactions/archived', {limit, offset});
  if (!Array.isArray(rows) || rows.length > limit) {
    throw new Error('Unverified archived list response');
  }
  const seen = new Set<string>();
  return rows.map((row) => {
    const item = validateArchivedPilotRow(row);
    if (seen.has(item.id)) throw new Error('Duplicate archived transaction in server response');
    seen.add(item.id);
    return item;
  });
}

/** Restore succeeds only after validated, newer server DTO is returned. */
export async function restorePilotArchivedTransaction(
  id: string,
  expectedVersion: number,
  client: ApiClient = getApiClient(),
): Promise<Transaction> {
  if (typeof id !== 'string' || id.trim() === '' || !validVersion(expectedVersion)) {
    throw new Error('Transaction ID and a positive expectedVersion are required');
  }
  const response = await client.post<ArchivedDto>(
    `/transactions/${encodeURIComponent(id)}/restore?expectedVersion=${expectedVersion}`,
    undefined, // POST deliberately has no body; backend validates query only.
  );
  if (!response || response.id !== id || !validVersion(response.version) ||
      response.version <= expectedVersion || response.deletedAt != null ||
      !Array.isArray(response.attachments) ||
      !Array.isArray(response.employeeIds) ||
      typeof response.subject !== 'string' || typeof response.status !== 'string') {
    throw new Error('Unverified transaction restore response');
  }
  return toTransaction(response);
}
