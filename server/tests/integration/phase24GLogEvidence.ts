/**
 * 24-G: assert both classes of original restored event rows independently.
 * Checking only their SUM could allow one missing type to be hidden by the other.
 * Input is PostgreSQL count(*)::text from the restored fixture, before any
 * new test-only accounts are created.
 */
import assert from 'node:assert/strict';

export interface RestoredLogCounts {
  viewLogs: string;
  auditLogs: string;
}

export function assertRestoredLogCounts(counts: RestoredLogCounts): void {
  assert.equal(counts.viewLogs, '1',
    'Original restored ViewLog count must independently equal one');
  assert.equal(counts.auditLogs, '1',
    'Original restored AuditLog count must independently equal one');
}
