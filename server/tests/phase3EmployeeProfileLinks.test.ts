import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Transaction } from '../../src/types';
import { employeeProfileTransactions } from '../../src/services/employeeProfileLinks';

const employees = [
  { id: 'employee-a', name: 'محمد علي حسن' },
  { id: 'employee-b', name: 'محمد علي حسين' },
  { id: 'employee-c', name: 'سارة كريم علي' },
];

function transaction(id: string, fields: Record<string, unknown> = {}): Transaction {
  return { id, ...fields } as unknown as Transaction;
}

function ids(items: Transaction[]): string[] {
  return items.map((item) => item.id);
}

function profile(
  employee = employees[0],
  transactions: Transaction[] = [],
  transactionEmployees: Array<{ employeeId: string; transactionId: string }> = [],
  officialMode = true,
  directory: Array<{ id: string; name: string }> = employees,
): string[] {
  return ids(employeeProfileTransactions({
    employee,
    employees: directory,
    transactions,
    transactionEmployees,
    officialMode,
  }));
}

describe('Phase 3 — secure employee dossier link aggregation', () => {
  it('official mode never infers a transaction from exact, partial or subject names', () => {
    const records = [
      transaction('exact-name', { employeeName: 'محمد علي حسن' }),
      transaction('overlapping-name', { employeeName: 'محمد علي حسين' }),
      transaction('subject-name', { subject: 'معاملة محمد علي حسن' }),
      transaction('daily-name', {
        dailySituationData: { permanentLeaves: [{ employeeName: 'محمد علي حسن' }] },
      }),
    ];
    assert.deepEqual(profile(employees[0], records), []);
  });

  it('explicit relation wins over conflicting employeeIds mirror and text', () => {
    const record = transaction('official-link', {
      employeeName: employees[0].name,
      employeeIds: ['employee-a'],
    });
    const links = [{ transactionId: record.id, employeeId: 'employee-b' }];
    assert.deepEqual(profile(employees[0], [record], links), []);
    assert.deepEqual(profile(employees[1], [record], links), ['official-link']);
  });

  it('employeeIds mirror is used when the relation rows are absent', () => {
    const records = [
      transaction('mine', { employeeIds: ['employee-a'] }),
      transaction('other', { employeeIds: ['employee-b'], employeeName: employees[0].name }),
      transaction('shared', { employeeIds: ['employee-a', 'employee-b'] }),
    ];
    assert.deepEqual(profile(employees[0], records), ['mine', 'shared']);
    assert.deepEqual(profile(employees[1], records), ['other', 'shared']);
  });

  it('legacy local matching requires an exact normalized unique full name', () => {
    const records = [
      transaction('legacy-exact', { employeeName: 'السيد محمد علي حسن' }),
      transaction('legacy-neighbor', { employeeName: 'محمد علي حسين' }),
      transaction('legacy-ambiguous-prefix', { employeeName: 'محمد علي' }),
      transaction('legacy-many', { employeeName: 'سارة كريم علي، محمد علي حسن' }),
      transaction('legacy-subject-only', { subject: 'محمد علي حسن معاملة' }),
    ];
    assert.deepEqual(profile(employees[0], records, [], false), ['legacy-exact', 'legacy-many']);
    assert.deepEqual(profile(employees[0], records, [], true), []);
  });

  it('legacy records with conflicting explicit links are never reassigned via names', () => {
    const records = [
      transaction('linked-to-other', { employeeName: employees[0].name }),
      transaction('mirrored-to-other', { employeeIds: ['employee-b'], employeeName: employees[0].name }),
    ];
    assert.deepEqual(profile(employees[0], records, [
      { transactionId: 'linked-to-other', employeeId: 'employee-b' },
    ], false), []);
  });

  it('name-only fallback fails closed when multiple employees share the same full name', () => {
    const duplicate = { id: 'employee-duplicate', name: 'محمد علي حسن' };
    const record = transaction('ambiguous', { employeeName: 'محمد علي حسن' });
    assert.deepEqual(profile(employees[0], [record], [], false, [...employees, duplicate]), []);
  });

  it('local embedded daily record uses a structured exact name, never a partial match', () => {
    const records = [
      transaction('daily-exact', {
        dailySituationData: { temporaryTimePermissions: [{ employeeName: 'محمد علي حسن' }] },
      }),
      transaction('daily-partial', {
        dailySituationData: { temporaryLeaves: [{ employeeName: 'محمد علي حسين' }] },
      }),
    ];
    assert.deepEqual(profile(employees[0], records, [], false), ['daily-exact']);
    assert.deepEqual(profile(employees[0], records, [], true), []);
  });

  it('multi-role duplicate link rows produce one linked transaction', () => {
    const record = transaction('repeated', { employeeIds: [] });
    const links = [
      { transactionId: 'repeated', employeeId: 'employee-a' },
      { transactionId: 'repeated', employeeId: 'employee-a' },
    ];
    assert.deepEqual(profile(employees[0], [record], links), ['repeated']);
  });
});
