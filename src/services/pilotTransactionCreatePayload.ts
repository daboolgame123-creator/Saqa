/**
 * Official pilot CREATE must accept only fields from the real server
 * createTransactionBody validator. Domain-local ID, month, read marker,
 * version and display-only attachment data never cross the API boundary.
 */
import type { Transaction } from '../core/models/transaction';
import type { CreateTransactionInput } from '../core/interfaces/dataAdapter';

const CREATE_FIELDS = [
  'number', 'sequence', 'date', 'direction', 'category', 'subType',
  'entity', 'subject', 'addressedTo', 'content', 'employeeName',
  'visibility', 'targetScope', 'priority', 'directorDirective', 'reminder',
  'status', 'notes', 'specificDetails',
] as const satisfies readonly (keyof Transaction)[];

/**
 * API mode has no file-byte handoff in this form. Reject metadata-only
 * attachments rather than fabricating an uploaded document on the server.
 */
export function buildPilotTransactionCreatePayload(transaction: Transaction): CreateTransactionInput {
  if (transaction.isDailySituation || transaction.dailySituationData) {
    throw new Error('OFFICIAL_DAILY_CREATION_NOT_ATOMIC');
  }
  if (transaction.attachments.length > 0) {
    throw new Error('OFFICIAL_ATTACHMENTS_REQUIRE_UPLOAD');
  }
  const source = transaction as unknown as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of CREATE_FIELDS) {
    if (source[key] !== undefined) payload[key] = source[key];
  }

  const employeeIds = transaction.employeeIds ?? [];
  if (employeeIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw new Error('INVALID_EMPLOYEE_LINK');
  }
  // The backend owns UUIDs and relationship rows; the client supplies only
  // exact employee references, never temporary link IDs.
  payload.employeeLinks = [...new Set(employeeIds)].map((employeeId) => ({employeeId}));
  return payload as CreateTransactionInput;
}
