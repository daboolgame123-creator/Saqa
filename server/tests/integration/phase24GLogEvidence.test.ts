/** No database connection: pure negative fixtures for restoration evidence. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertRestoredLogCounts } from './phase24GLogEvidence';

describe('24-G: ViewLog and AuditLog count must be verified separately', () => {
  it('accepts exactly one restored row of each type', () => {
    assert.doesNotThrow(() => assertRestoredLogCounts({ viewLogs: '1', auditLogs: '1' }));
  });

  it('rejects two ViewLogs and zero AuditLogs despite total of two', () => {
    assert.throws(() => assertRestoredLogCounts({ viewLogs: '2', auditLogs: '0' }),
      /ViewLog count must independently equal one/);
  });

  it('rejects zero ViewLogs and two AuditLogs despite total of two', () => {
    assert.throws(() => assertRestoredLogCounts({ viewLogs: '0', auditLogs: '2' }),
      /ViewLog count must independently equal one/);
  });

  it('rejects missing AuditLog even when ViewLog count is valid', () => {
    assert.throws(() => assertRestoredLogCounts({ viewLogs: '1', auditLogs: '0' }),
      /AuditLog count must independently equal one/);
  });
});
